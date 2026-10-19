/**
 * Spec mode: approve and hand off implementation to a new session.
 *
 * Approving the spec with `ProceedNewSessionHigh` moves implementation into a
 * fresh session. The example prints the planning session's own id alongside the
 * id of the session that actually implemented the spec, so the handoff is
 * visible in the output; see spec-mode-same-session.ts for the in-place
 * variant, which reports no handoff.
 *
 * The handed-off session announces itself only on the notification envelope:
 * once implementation moves, `params.sessionId` on incoming notifications stops
 * matching `session.id`. The typed message stream carries no session id per
 * message, so the example subscribes with `session.onNotification()` and
 * validates each envelope with `SessionNotificationSchema`.
 *
 * Usage:
 *   npx tsx examples/node/spec-mode-new-session.ts
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type ClientPermissionHandler,
  DroidInteractionMode,
  DroidMessageType,
  ReasoningEffort,
  SessionNotificationSchema,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

let handoffSessionId: string | null = null;

const handlePermissionRequest: ClientPermissionHandler = ({
  toolUses,
  options,
}) => {
  const exitsSpecMode = toolUses.some(
    (toolUse) => toolUse.details.type === ToolConfirmationType.ExitSpecMode
  );

  // This example approves every call to keep the focus on spec mode. See
  // permission-handler.ts for a handler that approves only expected calls.
  const outcome = exitsSpecMode
    ? ToolConfirmationOutcome.ProceedNewSessionHigh
    : ToolConfirmationOutcome.ProceedOnce;
  if (!options.some((option) => option.value === outcome)) {
    throw new Error(`Outcome not offered: ${outcome}`);
  }
  return outcome;
};

try {
  const session = await createSession({
    cwd: tempDir,
    interactionMode: DroidInteractionMode.Spec,
    specModeReasoningEffort: ReasoningEffort.High,
    permissionHandler: handlePermissionRequest,
  });

  // The typed message stream carries no per-message session id, and the
  // precise handoff signal the SDK uses internally is not part of the public
  // surface, so a foreign envelope session id is the available proxy. It is
  // only a proxy: any notification scoped to another session also trips it.
  const unsubscribe = session.onNotification((notification) => {
    const parsed = SessionNotificationSchema.safeParse(notification);
    if (!parsed.success) return;
    const envelopeSessionId = parsed.data.params.sessionId;
    if (envelopeSessionId !== undefined && envelopeSessionId !== session.id) {
      handoffSessionId = envelopeSessionId;
    }
  });

  try {
    for await (const message of session.stream(
      `Plan then create ${outputPath} containing "Hello from Droid".`
    )) {
      if (message.type === DroidMessageType.Result && !message.success) {
        throw new Error(
          message.error?.message ?? `Turn ended: ${message.subtype}`
        );
      }
    }
  } finally {
    unsubscribe();
    await session.close();
  }

  console.log(`planning session:       ${session.id}`);
  console.log(
    `implementing session:   ${handoffSessionId ?? '<same session>'}`
  );
  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}

// Without a distinct implementing session this run is indistinguishable from
// the same-session variant, so the handoff this example demonstrates did not
// happen.
if (handoffSessionId === null) {
  throw new Error(
    'Spec approval with ProceedNewSessionHigh did not hand off to a new session.'
  );
}
