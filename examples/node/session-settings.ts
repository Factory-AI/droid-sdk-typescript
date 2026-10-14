/**
 * Session settings example.
 *
 * Reads settings from a live session, updates them, and changes between Auto
 * and Spec modes.
 *
 * Usage:
 *   npx tsx examples/node/session-settings.ts
 */

import { AutonomyLevel, createSession } from '@factory/droid-sdk/node';

const session = await createSession({ autonomyLevel: AutonomyLevel.Low });

function printSettings(label: string): void {
  const { modelId, interactionMode, autonomyLevel } = session.settings;
  console.log(`${label}: ${modelId}, ${interactionMode}, ${autonomyLevel}`);
}

try {
  printSettings('created with');

  await session.updateSettings({
    autonomyLevel: AutonomyLevel.High,
  });
  printSettings('updated to  ');

  await session.enterSpecMode();
  printSettings('entered Spec');

  await session.exitSpecMode();
  printSettings('exited Spec ');
} finally {
  await session.close();
}
