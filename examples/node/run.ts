/**
 * One-shot `run()` example.
 *
 * Sends a single prompt and prints the aggregated result. `run()` closes the
 * underlying session for you.
 *
 * Usage:
 *   npx tsx examples/node/run.ts
 *   npx tsx examples/node/run.ts "What is 2 + 2?"
 */

import { run } from '@factory/droid-sdk/node';

const result = await run(process.argv.slice(2).join(' ') || 'What is 2 + 2?');

if (!result.success) {
  throw new Error(
    result.error?.message ?? `The turn failed (${result.subtype}).`
  );
}
if (!result.text.trim()) {
  throw new Error('The turn produced no assistant output.');
}

console.log(result.text);
console.log(`\nmessages: ${result.messages.length}`);

if (result.tokenUsage) {
  console.log(
    `tokens: ${result.tokenUsage.inputTokens} in, ${result.tokenUsage.outputTokens} out`
  );
}
