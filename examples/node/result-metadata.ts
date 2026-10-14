/**
 * DroidResult metadata example.
 *
 * Prints the metadata `run()` returns alongside the response text.
 *
 * Usage:
 *   npx tsx examples/node/result-metadata.ts
 *   npx tsx examples/node/result-metadata.ts "Reply with metadata details."
 */

import { run } from '@factory/droid-sdk/node';

const result = await run(
  process.argv.slice(2).join(' ') ||
    'Reply with "Metadata OK" and nothing else.'
);

console.log(result.text);
console.log(`\nsession:  ${result.sessionId}`);
console.log(`duration: ${result.durationMs}ms`);
console.log(`turns:    ${result.turnCount}`);
console.log(`success:  ${String(result.success)}`);
console.log(`interrupted: ${String(result.interrupted)}`);
console.log(`messages: ${result.messages.length}`);

if (result.error) {
  console.log(`error:    ${result.error.message}`);
}

if (result.tokenUsage) {
  console.log(
    `turn tokens: ${result.tokenUsage.inputTokens} in, ${result.tokenUsage.outputTokens} out`
  );
  console.log(
    `turn cache:  ${result.tokenUsage.cacheReadTokens} read, ${result.tokenUsage.cacheCreationTokens} created`
  );
}

if (!result.success) {
  throw new Error(
    result.error?.message ?? `The turn failed (${result.subtype}).`
  );
}
