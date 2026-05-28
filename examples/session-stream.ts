/**
 * Simple session streaming example.
 *
 * Demonstrates using `session.stream()` to send a prompt, streaming
 * full assistant/tool messages, and handling the final `result`.
 *
 * Usage:
 *   npx tsx examples/session-stream.ts
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? 'What files are in the current directory?';

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
          console.log(`\n[Tool] ${msg.toolUse.name}`);
          break;

        case DroidMessageType.ToolResult:
          console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
          break;

        case DroidMessageType.Result:
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
