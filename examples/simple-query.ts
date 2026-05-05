/**
 * Simple one-shot query example.
 *
 * Demonstrates using `query()` to send a single prompt, streaming
 * `AssistantTextDelta` messages to stdout, and handling `TurnComplete`.
 *
 * Usage:
 *   npx tsx examples/simple-query.ts
 */

import { DroidMessageType, query } from '../src/index.js';

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? 'What files are in the current directory?';

  console.log(`Sending prompt: "${prompt}"\n`);

  const stream = query({
    prompt,
    cwd: process.cwd(),
  });

  for await (const msg of stream) {
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
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
