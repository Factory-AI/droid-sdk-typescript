/**
 * Mission example.
 *
 * Starts a mission, approves its planning and execution steps, and prints
 * orchestrator and worker progress.
 *
 * Usage:
 *   npx tsx examples/node/mission.ts
 *   npx tsx examples/node/mission.ts "Document the authentication flow"
 */

import {
  AutonomyLevel,
  DroidInteractionMode,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

const session = await createSession({
  interactionMode: DroidInteractionMode.Mission,
  autonomyLevel: AutonomyLevel.High,
  permissionHandler({ toolUses, options }) {
    const missionControl =
      toolUses.length > 0 &&
      toolUses.every(
        (toolUse) =>
          toolUse.details.type === ToolConfirmationType.ProposeMission ||
          toolUse.details.type === ToolConfirmationType.StartMissionRun
      );
    const outcome = missionControl
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;

    if (!options.some((option) => option.value === outcome)) {
      throw new Error(`Outcome not offered: ${outcome}`);
    }
    return outcome;
  },
});

const prompt =
  process.argv.slice(2).join(' ') ||
  'Review this repository and propose one useful documentation improvement.';

try {
  for await (const message of session.stream(prompt, {
    includePartialMessages: true,
  })) {
    switch (message.type) {
      case DroidMessageType.Assistant:
        process.stdout.write(message.text);
        break;

      case DroidMessageType.MissionStateChanged:
        console.log(`\n[mission] ${message.state}`);
        break;

      case DroidMessageType.MissionWorkerStarted:
        console.log(`[worker started] ${message.workerSessionId}`);
        break;

      case DroidMessageType.MissionWorkerCompleted:
        console.log(
          `[worker completed] ${message.workerSessionId} (exit ${message.exitCode})`
        );
        break;

      case DroidMessageType.Result:
        if (!message.success) {
          throw new Error(
            message.error?.message ?? `Turn ended: ${message.subtype}`
          );
        }
        console.log(`\n[result] ${message.subtype}`);
        break;
    }
  }
} finally {
  await session.close();
}
