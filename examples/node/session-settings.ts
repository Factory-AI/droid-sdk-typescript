/**
 * Session settings example.
 *
 * Reads settings from a live session, updates them with `updateSettings()`,
 * and reads the updated values back.
 *
 * Usage:
 *   npx tsx examples/node/session-settings.ts
 */

import {
  AutonomyLevel,
  DroidInteractionMode,
  createSession,
} from '@factory/droid-sdk/node';

const session = await createSession({ autonomyLevel: AutonomyLevel.Low });

function printSettings(label: string): void {
  const { modelId, interactionMode, autonomyLevel } = session.settings;
  console.log(`${label}: ${modelId}, ${interactionMode}, ${autonomyLevel}`);
}

try {
  printSettings('created with');

  await session.updateSettings({
    interactionMode: DroidInteractionMode.Spec,
    autonomyLevel: AutonomyLevel.High,
  });

  printSettings('updated to  ');
} finally {
  await session.close();
}
