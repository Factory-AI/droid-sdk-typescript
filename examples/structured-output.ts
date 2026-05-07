/**
 * Structured output example.
 *
 * Runs a prompt with the actual Droid CLI and requests a JSON object
 * matching the provided schema.
 *
 * Usage:
 *   npx tsx examples/structured-output.ts
 *   npx tsx examples/structured-output.ts "Pick a favorite number between 1 and 42"
 */

import assert from 'node:assert/strict';

import { OutputFormatType, run } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(' ') ||
    'Pick a favorite number between 1 and 42.';

  const outputFormat = {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: {
        favoriteNumber: {
          type: 'number',
          minimum: 1,
          maximum: 42,
        },
      },
      required: ['favoriteNumber'],
    },
  };

  console.log(`Sending prompt: "${prompt}"\n`);

  const result = await run(prompt, {
    cwd: process.cwd(),
    outputFormat,
  });

  assert.ok(result.structuredOutput, 'Expected structuredOutput to be set');
  assert.equal(typeof result.structuredOutput['favoriteNumber'], 'number');

  console.log('=== Structured output ===');
  console.log(JSON.stringify(result.structuredOutput, null, 2));

  console.log('\nStructured output example passed');
}

main().catch((error: unknown) => {
  console.error('Structured output example failed:', error);
  process.exit(1);
});
