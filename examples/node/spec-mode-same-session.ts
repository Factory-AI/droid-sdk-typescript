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

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DroidInteractionMode,
  ReasoningEffort,
  SessionNotificationSchema,
  ToolConfirmationOutcome,
  createSession,
} from '@factory/droid-sdk/node';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
const outputPath = join(tempDir, 'hello.txt');

let handoffSessionId: string | null = null;

try {
  const session = await createSession({
    interactionMode: DroidInteractionMode.Spec,
    specModeReasoningEffort: ReasoningEffort.High,
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
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
    for await (const _msg of session.stream(
      `Plan then create ${outputPath} containing "Hello from Droid".`
    )) {
      // Consume the stream until implementation finishes.
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
