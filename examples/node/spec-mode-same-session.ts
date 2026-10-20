/**
 * Spec mode: approve and implement in the same session.
 *
 * Approving the spec with `ProceedOnce` keeps implementation in the session
 * that planned it. The example prints its session id and reports that no
 * handoff occurred, which is what distinguishes its output from
 * spec-mode-new-session.ts.
 *
 * A handoff would announce itself on the notification envelope: `params.sessionId`
 * on incoming notifications would stop matching `session.id`. The typed message
 * stream carries no session id per message, so the example subscribes with
 * `session.onNotification()` and validates each envelope with
 * `SessionNotificationSchema`.
 *
 * Usage:
 *   npx tsx examples/node/spec-mode-same-session.ts
 */

import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type ClientPermissionHandler,
  DroidInteractionMode,
  DroidMessageType,
  ReasoningEffort,
  SessionNotificationSchema,
  type ToolConfirmationDetails,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

// Resolve symlinks (for example /var -> /private/var on macOS) so the path in
// the prompt is the same path that the permission request reports.
const tempDir = await realpath(
  await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'))
);
const outputPath = join(tempDir, 'hello.txt');

/** True when a tool call only writes the file that the prompt asks for. */
function writesOnlyOutputFile(details: ToolConfirmationDetails): boolean {
  switch (details.type) {
    case ToolConfirmationType.Create:
    case ToolConfirmationType.Edit:
      return details.filePath === outputPath;
    case ToolConfirmationType.ApplyPatch:
      return (details.files ?? [details]).every(
        (file) => file.filePath === outputPath
      );
    default:
      return false;
  }
}

let handoffSessionId: string | null = null;

const handlePermissionRequest: ClientPermissionHandler = ({
  toolUses,
  options,
}) => {
  // A Script request batches tool calls; see permission-handler.ts.
  const confirmations = toolUses.flatMap((toolUse) =>
    toolUse.details.type === ToolConfirmationType.Script
      ? toolUse.details.calls.map((call) => call.confirmation)
      : [toolUse.details]
  );
  // ProceedOnce on the plan keeps implementation in this session. Approve the
  // plan and the write to outputPath. Cancel everything else.
  const expected =
    confirmations.length > 0 &&
    confirmations.every(
      (details) =>
        details.type === ToolConfirmationType.ExitSpecMode ||
        writesOnlyOutputFile(details)
    );
  const outcome = expected
    ? ToolConfirmationOutcome.ProceedOnce
    : ToolConfirmationOutcome.Cancel;
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
    // The handler cancels shell commands, so the prompt asks for a file tool.
    for await (const message of session.stream(
      `Plan then create ${outputPath} containing "Hello from Droid". ` +
        'Write it with a file editing tool, not a shell command.'
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

// A foreign session id is only a proxy for a handoff, so warn rather than
// fail: it may mean `ProceedOnce` handed implementation off, or merely that
// some unrelated session-scoped notification arrived during the run.
if (handoffSessionId !== null) {
  console.warn(
    `Observed a notification scoped to a different session (${String(handoffSessionId)}). ` +
      'That may mean implementation was handed off, or that unrelated ' +
      'session-scoped activity occurred during this run.'
  );
}
