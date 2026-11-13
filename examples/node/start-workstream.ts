/**
 * Start a workstream on a running daemon and leave it running.
 *
 * The orchestrator plans the goal and runs agents in the daemon, which keeps
 * the workstream going after this script exits. Without an `askUserHandler`,
 * any question the orchestrator asks is declined (see ask-user-elicitation.ts).
 * An agent's questions and permission prompts are answered only by a client
 * that attaches that agent with handlers (`droid.sessions.resume(agentId, ...)`).
 *
 * Set DROID_DAEMON_URL and FACTORY_API_KEY for an existing daemon whose account
 * has access to workstreams. Set DROID_WORKSTREAM_COMPUTER_ID to let agents also run
 * on that computer instead of only on this daemon's machine.
 * Usage: npx tsx examples/node/start-workstream.ts "<goal>" [cwd]
 */

import {
  AutonomyLevel,
  DroidMessageType,
  ReasoningEffort,
  WorkstreamMachineTargetKind,
  connectToDaemon,
} from '@factory/droid-sdk';

const url = process.env.DROID_DAEMON_URL;
const apiKey = process.env.FACTORY_API_KEY;
const computerId = process.env.DROID_WORKSTREAM_COMPUTER_ID;
if (!url || !apiKey) {
  throw new Error('Set DROID_DAEMON_URL and FACTORY_API_KEY.');
}

const [goal, cwd = process.cwd()] = process.argv.slice(2);
if (!goal) {
  throw new Error('Pass the workstream goal as the first argument.');
}

const droid = await connectToDaemon({ url, auth: { apiKey } });
try {
  // Agents on another machine reach this daemon through its relay.
  if (computerId) await droid.relay.start();
  const orchestrator = await droid.unstable.workstreams.start({
    cwd,
    title: goal.slice(0, 80),
    // Agents inherit the orchestrator's autonomy; below High they stop to ask.
    autonomyLevel: AutonomyLevel.High,
    agentReasoningEffort: ReasoningEffort.High,
    ...(computerId
      ? {
          machines: [
            {
              label: 'remote',
              target: {
                kind: WorkstreamMachineTargetKind.Computer,
                computerId,
              },
            },
          ],
          defaultMachineLabel: 'remote',
        }
      : {}),
  });
  console.log(`Workstream ${orchestrator.id} started.`);

  for await (const msg of orchestrator.stream(goal)) {
    if (msg.type === DroidMessageType.Assistant) {
      process.stdout.write(msg.text);
    } else if (msg.type === DroidMessageType.Result && !msg.success) {
      throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
    }
  }

  // Detach, not close: closing would end the workstream in the daemon.
  await orchestrator.detach();
  console.log(`\nWorkstream ${orchestrator.id} keeps running in the daemon.`);
} finally {
  droid.disconnect();
}
