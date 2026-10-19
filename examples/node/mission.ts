/**
 * Mission example.
 *
 * Starts a mission, approves its planning and execution steps, and prints
 * orchestrator and worker progress.
 * This example can change files in the current directory. Use a test project.
 *
 * Usage:
 *   npx tsx examples/node/mission.ts
 *   npx tsx examples/node/mission.ts "Document the authentication flow"
 */

import { randomUUID } from 'node:crypto';

import {
  AutonomyLevel,
  DecompSessionType,
  DroidInteractionMode,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

const session = await createSession({
  interactionMode: DroidInteractionMode.Mission,
  autonomyLevel: AutonomyLevel.High,
  // Droid exposes ProposeMission and StartMissionRun only to sessions with an
  // orchestrator mission-session tag. interactionMode alone does not add them.
  tags: [
    {
      name: 'mission-session',
      metadata: {
        role: DecompSessionType.Orchestrator,
        missionId: randomUUID(),
      },
    },
  ],
  permissionHandler({ toolUses, options }) {
    const confirmations = toolUses.flatMap((toolUse) =>
      toolUse.details.type === ToolConfirmationType.Script
        ? toolUse.details.calls.map((call) => call.confirmation)
        : [toolUse.details]
    );
    const missionControl =
      confirmations.length > 0 &&
      confirmations.every(
        (details) =>
          details.type === ToolConfirmationType.ProposeMission ||
          details.type === ToolConfirmationType.StartMissionRun
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
  'Use a mission to add CONTRIBUTING.md with setup and test instructions for this repository. Implement and verify the documentation, not just a proposal.';

let sawWorker = false;

try {
  for await (const message of session.stream(prompt, {
    includePartialMessages: true,
  })) {
    switch (message.type) {
      case DroidMessageType.AssistantTextDelta:
        process.stdout.write(message.text);
        break;

      case DroidMessageType.MissionStateChanged:
        console.log(`\n[mission] ${message.state}`);
        break;

      case DroidMessageType.MissionWorkerStarted:
        sawWorker = true;
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
  if (!sawWorker) {
    throw new Error(
      'No mission worker started. The turn did not demonstrate mission execution.'
    );
  }
} finally {
  await session.close();
}
