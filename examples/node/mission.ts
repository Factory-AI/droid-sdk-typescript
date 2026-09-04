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
  permissionHandler(request) {
    const missionControl =
      request.toolUses.length > 0 &&
      request.toolUses.every(
        (toolUse) =>
          toolUse.details.type === ToolConfirmationType.ProposeMission ||
          toolUse.details.type === ToolConfirmationType.StartMissionRun
      );

    return missionControl
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
  },
});

const prompt =
  process.argv[2] ??
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
        console.log(`\n[result] ${message.subtype}`);
        break;
    }
  }
} finally {
  await session.close();
}
