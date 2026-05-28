/**
 * Hook execution streaming example.
 *
 * Demonstrates how to handle hook execution messages in a session stream.
 *
 * Usage:
 *   npx tsx examples/hook-execution.ts
 */

import { DroidMessageType, createSession } from '../src/index.js';

async function main(): Promise<void> {
  const prompt = 'Run a simple shell command using Execute tool.';

  console.log(`Sending prompt: "${prompt}"\n`);

  // Note: To actually see hooks, you need to have hooks configured in your droid settings.
  const apiKey = process.env.FACTORY_API_KEY;
  if (!apiKey) {
    console.error('Set FACTORY_API_KEY environment variable.');
    process.exit(1);
  }

  const session = await createSession({ apiKey, cwd: process.cwd() });

  try {
    for await (const msg of session.stream(prompt)) {
      switch (msg.type) {
        case DroidMessageType.Assistant:
          process.stdout.write(msg.text);
          break;

        case DroidMessageType.ToolCall:
          console.log(`\n[Tool Call] ${msg.toolUse.name} (${msg.toolUse.id})`);
          break;

        case DroidMessageType.Hook:
          if (msg.status === 'started') {
            console.log(
              `  [Hook Started] ID: ${msg.hookId}, Event: ${msg.eventName}, Command: ${msg.command}`
            );
          } else {
            console.log(
              `  [Hook ${msg.status}] ID: ${msg.hookId}, Exit Code: ${msg.exitCode}`
            );
            if (msg.stdout) console.log(`    stdout: ${msg.stdout.trim()}`);
            if (msg.stderr) console.log(`    stderr: ${msg.stderr.trim()}`);
          }
          break;

        case DroidMessageType.ToolResult:
          console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
          break;

        case DroidMessageType.Result:
          console.log('\n\n--- Turn complete ---');
          break;
      }
    }
  } finally {
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
