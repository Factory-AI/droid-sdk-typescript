/**
 * Model selection example.
 *
 * Runs one turn with a configured model ID.
 *
 * Usage:
 *   FACTORY_API_KEY=... npx tsx examples/node/model-selection.ts model-id
 */

import { run } from '@factory/droid-sdk/node';

const modelId = process.argv[2];
if (!modelId) {
  throw new Error('Pass a model ID from model-discovery.ts.');
}

const result = await run('Summarize this repository.', {
  modelId,
});

if (!result.success) {
  throw new Error(result.error?.message ?? `Turn ended: ${result.subtype}`);
}
if (!result.text.trim()) {
  throw new Error('The turn produced no assistant output.');
}

console.log(`model: ${modelId}`);
console.log(result.text);
