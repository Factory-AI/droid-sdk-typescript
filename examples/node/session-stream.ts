/**
 * Session streaming example.
 *
 * Sends a prompt with `session.stream()` and handles each message type:
 * assistant text, tool calls, tool results, and the final result.
 *
 * Usage:
 *   npx tsx examples/node/session-stream.ts
 *   npx tsx examples/node/session-stream.ts "What files are here?"
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  const prompt = process.argv[2] ?? 'What files are in the current directory?';

  for await (const msg of session.stream(prompt)) {
    switch (msg.type) {
      case DroidMessageType.Assistant:
        process.stdout.write(msg.text);
        break;

      case DroidMessageType.ToolCall:
        console.log(`\n[tool] ${msg.name}`);
        break;

      case DroidMessageType.ToolResult:
        console.log(`[tool result] ${msg.isError ? 'error' : 'ok'}`);
        break;

      case DroidMessageType.Result:
        if (msg.tokenUsage) {
          console.log(
            `\n\ntokens: ${msg.tokenUsage.inputTokens} in, ${msg.tokenUsage.outputTokens} out`
          );
        }
        break;
    }
  }
} finally {
  await session.close();
}
