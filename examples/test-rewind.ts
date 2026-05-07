/**
 * Rewind example (getRewindInfo + executeRewind).
 *
 * Demonstrates the low-level DroidClient API for rewind operations.
 * Uses explicit user message IDs so they can be referenced as rewind
 * targets — the snapshot system uses user message IDs as boundary
 * markers.
 *
 * Usage:
 *   npx tsx examples/test-rewind.ts
 */

import crypto from 'node:crypto';

import {
  DroidClient,
  ProcessTransport,
  AutonomyLevel,
  DroidWorkingState,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from '@factory/droid-sdk';

function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Send a user message with an explicit messageId and wait for the
 * agent turn to complete by observing working-state notifications.
 */
async function sendAndWait(
  client: DroidClient,
  text: string,
  messageId: string
): Promise<void> {
  return new Promise<void>((resolve) => {
    let wasActive = false;

    const unsub = client.onNotification((notification) => {
      const params = notification['params'] as
        | Record<string, unknown>
        | undefined;
      const inner = params?.['notification'] as
        | Record<string, unknown>
        | undefined;
      if (!inner) return;

      if (inner['type'] === SessionNotificationType.ASSISTANT_TEXT_DELTA) {
        const delta = inner['textDelta'] as string | undefined;
        if (delta) process.stdout.write(delta);
      }

      if (
        inner['type'] === SessionNotificationType.DROID_WORKING_STATE_CHANGED
      ) {
        const newState = inner['newState'] as string;
        if (newState !== DroidWorkingState.Idle) {
          wasActive = true;
        }
        if (newState === DroidWorkingState.Idle && wasActive) {
          unsub();
          resolve();
        }
      }
    });

    void client.addUserMessage({ text, messageId });
  });
}

async function main(): Promise<void> {
  console.log('=== Creating session ===');
  const transport = new ProcessTransport({ cwd: process.cwd() });
  await transport.connect();
  const client = new DroidClient({ transport });

  const initResult = await client.initializeSession({
    machineId: 'default',
    cwd: process.cwd(),
    autonomyLevel: AutonomyLevel.High,
  });
  console.log(`Session ID: ${initResult.sessionId}\n`);

  client.setPermissionHandler(() => ToolConfirmationOutcome.ProceedOnce);

  const userMsgId1 = uuid();
  console.log(`=== Turn 1: "hello" (msgId: ${userMsgId1.slice(0, 12)}...) ===`);
  await sendAndWait(client, 'Say "hello" and nothing else.', userMsgId1);
  console.log('\n');

  const userMsgId2 = uuid();
  console.log(
    `=== Turn 2: create file (msgId: ${userMsgId2.slice(0, 12)}...) ===`
  );
  await sendAndWait(
    client,
    'Create a file called /tmp/droid-sdk-rewind-test.txt with the content ' +
      '"rewind test data". Do not explain, just create it.',
    userMsgId2
  );
  console.log('\n');

  console.log(`=== getRewindInfo (msgId: ${userMsgId2.slice(0, 12)}...) ===`);
  try {
    const rewindInfo = await client.getRewindInfo({ messageId: userMsgId2 });
    console.log(
      `  Available files to restore: ${rewindInfo.availableFiles.length}`
    );
    for (const f of rewindInfo.availableFiles) {
      console.log(`    - ${f.filePath} (${f.size} bytes)`);
    }
    console.log(`  Created files to delete: ${rewindInfo.createdFiles.length}`);
    for (const f of rewindInfo.createdFiles) {
      console.log(`    - ${f.filePath}`);
    }
    console.log(`  Evicted files: ${rewindInfo.evictedFiles.length}`);
  } catch (err) {
    console.log(
      `  Error (expected — server does not yet support this): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  console.log();

  console.log(
    `=== executeRewind (to msgId: ${userMsgId1.slice(0, 12)}...) ===`
  );
  try {
    const rewindResult = await client.executeRewind({
      messageId: userMsgId1,
      filesToRestore: [],
      filesToDelete: [],
      forkTitle: 'Rewind to first hello',
    });
    console.log(`  New session ID: ${rewindResult.newSessionId}`);
    console.log(`  Restored: ${rewindResult.restoredCount}`);
    console.log(`  Deleted: ${rewindResult.deletedCount}`);
    console.log(`  Failed restores: ${rewindResult.failedRestoreCount}`);
    console.log(`  Failed deletes: ${rewindResult.failedDeleteCount}`);
  } catch (err) {
    console.log(
      `  Error (expected — server does not yet support this): ${err instanceof Error ? err.message : String(err)}`
    );
  }
  console.log();

  console.log('=== Closing ===');
  await client.close();
  console.log('Done.');
}

main().catch((err: unknown) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
