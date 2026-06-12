/**
 * Daemon: multiple concurrent sessions.
 *
 * Connects to a local daemon, creates two sessions in separate /tmp
 * directories, and runs them concurrently over a single WebSocket
 * connection.
 *
 * Usage:
 *   npx tsx examples/daemon-multi-session.ts
 *
 * Requirements: droid CLI installed, plus a real FACTORY_API_KEY.
 * Daemon authentication has no stored-credential fallback, so this
 * example skips itself when the env var is unset.
 */

import { connectDaemon, DroidMessageType } from '@factory/droid-sdk';

async function main(): Promise<void> {
  if (!process.env.FACTORY_API_KEY) {
    console.log(
      'FACTORY_API_KEY is not set. Daemon authentication requires a real ' +
        'API key (stored CLI credentials are not used). Skipping.'
    );
    return;
  }

  console.log('Connecting to local daemon...\n');
  const daemon = await connectDaemon({ apiKey: process.env.FACTORY_API_KEY });
  console.log('Connected!\n');

  try {
    const frontend = await daemon.createSession({
      cwd: '/tmp/daemon-test-frontend',
    });
    const backend = await daemon.createSession({
      cwd: '/tmp/daemon-test-backend',
    });

    console.log('Two sessions created. Running concurrently...\n');

    await Promise.all([
      (async () => {
        try {
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
        } finally {
          await frontend.close();
        }
      })(),
      (async () => {
        try {
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
        } finally {
          await backend.close();
        }
      })(),
    ]);
  } finally {
    await daemon.close();
  }

  console.log(
    '\nDone. Check /tmp/daemon-test-frontend/hello.md and /tmp/daemon-test-backend/notes.md'
  );
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
