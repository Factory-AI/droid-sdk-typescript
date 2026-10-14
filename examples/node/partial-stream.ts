/**
 * Partial stream example.
 *
 * Prints assistant text as it arrives, tool progress, and cumulative session
 * token updates.
 *
 * Usage:
 *   npx tsx examples/node/partial-stream.ts
 *   npx tsx examples/node/partial-stream.ts "Explain this repository."
 */

import { DroidMessageType, createSession } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  const prompt =
    process.argv.slice(2).join(' ') || 'Explain this repository briefly.';
  let sawSuccessfulResult = false;

  for await (const event of session.stream(prompt, {
    includePartialMessages: true,
  })) {
    switch (event.type) {
      case DroidMessageType.AssistantTextDelta:
        process.stdout.write(event.text);
        break;

      case DroidMessageType.ToolProgress:
        console.log(`\n[tool progress] ${event.toolUseId}`);
        break;

      case DroidMessageType.TokenUsageUpdate:
        console.log(
          `\n[session tokens] ${event.inputTokens} in, ${event.outputTokens} out`
        );
        break;

      case DroidMessageType.Result:
        if (!event.success) {
          throw new Error(
            event.error?.message ?? `Turn ended: ${event.subtype}`
          );
        }
        sawSuccessfulResult = true;
        console.log(`\n[result] ${event.subtype}`);
        break;
    }
  }

  if (!sawSuccessfulResult) {
    throw new Error('The stream ended without a successful result.');
  }
} finally {
  await session.close();
}
