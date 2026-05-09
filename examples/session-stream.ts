/**
 * Simple session streaming example.
 *
 * Demonstrates using `session.send()` and `turn.stream()` to send a prompt, streaming
 * `AssistantTextDelta` messages to stdout, and handling `TurnComplete`.
 *
 * Usage:
 *   npx tsx examples/session-stream.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? 'What files are in the current directory?';

  console.log(`Sending prompt: "${prompt}"\n`);

  const session = await createSession({ cwd: process.cwd() });

  try {
    for await (const msg of (await session.send(prompt)).stream()) {
      switch (msg.type) {
        case DroidMessageType.AssistantTextDelta:
          process.stdout.write(msg.text);
          break;

        case DroidMessageType.ToolUse:
          console.log(`\n[Tool] ${msg.toolName}`);
          break;

        case DroidMessageType.ToolResult:
          console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
          break;

        case DroidMessageType.TurnComplete:
          console.log('\n\n--- Turn complete ---');
          if (msg.tokenUsage) {
            console.log(
              `Tokens — input: ${msg.tokenUsage.inputTokens}, ` +
                `output: ${msg.tokenUsage.outputTokens}`
            );
          }
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
