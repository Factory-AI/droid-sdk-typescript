/**
 * Hook execution streaming example.
 *
 * Demonstrates how to handle hook execution messages in a session stream.
 *
 * IMPORTANT: Hook messages only appear if hooks are configured in your
 * droid settings. Without configured hooks the example still runs, but
 * no `[Hook ...]` lines are printed.
 *
 * Usage:
 *   npx tsx examples/hook-execution.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt = 'Run a simple shell command using Execute tool.';

  console.log(`Sending prompt: "${prompt}"\n`);

  const session = await createSession({
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
  });

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
