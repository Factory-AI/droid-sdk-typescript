/**
 * Node model discovery example.
 *
 * Lists the models available to the current account and organization.
 *
 * Usage:
 *   FACTORY_API_KEY=... npx tsx examples/node/model-discovery.ts
 */

import { listModels } from '@factory/droid-sdk/node';

const apiKey = process.env.FACTORY_API_KEY;
if (!apiKey) {
  throw new Error('Set FACTORY_API_KEY.');
}

const models = await listModels({ apiKey, includeDisabled: true });

for (const model of models) {
  const status = model.disabled
    ? `disabled: ${model.disabledReason}`
    : 'available';
  console.log(
    `${model.displayName} (${model.id})\n` +
      `  status: ${status}\n` +
      `  reasoning: ${model.supportedReasoningEfforts.join(', ')}`
  );
}
