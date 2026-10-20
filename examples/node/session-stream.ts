/**
 * Session streaming example.
 *
 * Sends a prompt with `session.stream()` and handles common messages from a
 * default (non-partial) stream.
 *
 * Usage:
 *   npx tsx examples/node/session-stream.ts
 *   npx tsx examples/node/session-stream.ts "What files are here?"
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  const prompt =
    process.argv.slice(2).join(' ') ||
    'What files are in the current directory?';
  let sawAssistantText = false;

  for await (const msg of session.stream(prompt)) {
    switch (msg.type) {
      case DroidMessageType.Assistant:
        sawAssistantText ||= msg.text.trim().length > 0;
        process.stdout.write(msg.text);
        break;

      case DroidMessageType.User:
        console.log('\n[user message accepted]');
        break;

      case DroidMessageType.ToolCall:
        console.log(`\n[tool] ${msg.name}`);
        break;

      case DroidMessageType.ToolResult:
        console.log(`[tool result] ${msg.isError ? 'error' : 'ok'}`);
        break;

      case DroidMessageType.Hook:
        console.log(`\n[hook] ${msg.hookId}: ${msg.status}`);
        break;

      case DroidMessageType.Error:
        console.error(`\n[error] ${msg.message}`);
        break;

      case DroidMessageType.Result:
        if (!msg.success) {
          throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
        }
        if (msg.tokenUsage) {
          console.log(
            `\n\ntokens: ${msg.tokenUsage.inputTokens} in, ${msg.tokenUsage.outputTokens} out`
          );
        }
        break;
    }
  }
  if (!sawAssistantText) {
    throw new Error(
      'No assistant text arrived. Check SDK and CLI compatibility.'
    );
  }
} finally {
  await session.close();
}
