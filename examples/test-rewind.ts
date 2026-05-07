/**
 * Low-level rewind API example.
 *
 * Usage:
 *   npx tsx examples/test-rewind.ts
 */

import { randomUUID } from 'node:crypto';

import {
  AutonomyLevel,
  DroidClient,
  DroidWorkingState,
  ProcessTransport,
  SessionNotificationType,
} from '@factory/droid-sdk';

function waitForTurn(client: DroidClient): Promise<void> {
  return new Promise((resolve) => {
    let started = false;
    const unsubscribe = client.onNotification((notification) => {
      const params = notification['params'];
      if (typeof params !== 'object' || params === null) {
        return;
      }

      const event = (params as Record<string, unknown>)['notification'];
      if (typeof event !== 'object' || event === null) {
        return;
      }

      if (
        (event as Record<string, unknown>)['type'] !==
        SessionNotificationType.DROID_WORKING_STATE_CHANGED
      ) {
        return;
      }

      const newState = (event as Record<string, unknown>)['newState'];
      started ||= newState !== DroidWorkingState.Idle;
      if (started && newState === DroidWorkingState.Idle) {
        unsubscribe();
        resolve();
      }
    });
  });
}

const transport = new ProcessTransport({ cwd: process.cwd() });
await transport.connect();

const client = new DroidClient({ transport });

try {
  await client.initializeSession({
    machineId: 'default',
    cwd: process.cwd(),
    autonomyLevel: AutonomyLevel.High,
  });

  const messageId = randomUUID();
  const done = waitForTurn(client);
  await client.addUserMessage({
    messageId,
    text: 'Say "hello" and nothing else.',
  });
  await done;

  try {
    const rewindInfo = await client.getRewindInfo({ messageId });
    console.log(
      `Files available to restore: ${rewindInfo.availableFiles.length}`
    );

    const rewind = await client.executeRewind({
      messageId,
      filesToRestore: [],
      filesToDelete: [],
      forkTitle: 'Rewind example',
    });
    console.log(`Rewound into session: ${rewind.newSessionId}`);
  } catch (error) {
    console.log(`Rewind unavailable: ${String(error)}`);
  }
} finally {
  await client.close();
}
