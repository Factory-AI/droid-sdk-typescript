/**
 * Manual smoke test for the daemon SDK — multiple concurrent sessions.
 *
 * Spawns a local daemon, creates two sessions in separate /tmp directories,
 * and runs them concurrently over a single WebSocket connection.
 *
 * Usage:
 *   npx tsx examples/daemon-multi-session.ts
 */

import { connectDaemon, DroidMessageType } from '@factory/droid-sdk';

async function main(): Promise<void> {
  console.log('Connecting to local daemon...\n');
  const daemon = await connectDaemon({ apiKey: process.env.FACTORY_API_KEY! });
  console.log('Connected!\n');

  const frontend = await daemon.createSession({
    cwd: '/tmp/daemon-test-frontend',
  });
  const backend = await daemon.createSession({
    cwd: '/tmp/daemon-test-backend',
  });

  console.log('Two sessions created. Running concurrently...\n');

  await Promise.all([
    (async () => {
      for await (const msg of frontend.stream(
        'Create a file called hello.md with a short greeting message. Just a few lines.'
      )) {
        if (msg.type === DroidMessageType.Assistant) {
          process.stdout.write(`[frontend] ${msg.text}\n`);
        } else if (msg.type === DroidMessageType.ToolCall) {
          console.log(`[frontend] [tool] ${msg.toolUse.name}`);
        } else if (msg.type === DroidMessageType.Result) {
          console.log(`[frontend] Done in ${msg.durationMs}ms`);
        }
      }
      await frontend.close();
    })(),
    (async () => {
      for await (const msg of backend.stream(
        'Create a file called notes.md with 3 random fun facts. Keep it short.'
      )) {
        if (msg.type === DroidMessageType.Assistant) {
          process.stdout.write(`[backend] ${msg.text}\n`);
        } else if (msg.type === DroidMessageType.ToolCall) {
          console.log(`[backend] [tool] ${msg.toolUse.name}`);
        } else if (msg.type === DroidMessageType.Result) {
          console.log(`[backend] Done in ${msg.durationMs}ms`);
        }
      }
      await backend.close();
    })(),
  ]);

  await daemon.close();
  console.log(
    '\nDone. Check /tmp/daemon-test-frontend/hello.md and /tmp/daemon-test-backend/notes.md'
  );
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
