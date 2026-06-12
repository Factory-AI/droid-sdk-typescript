/**
 * Structured output example.
 *
 * Runs a prompt with the actual Droid CLI and requests a JSON object
 * matching the provided schema.
 *
 * Usage:
 *   npx tsx examples/structured-output.ts
 *   npx tsx examples/structured-output.ts "Pick a favorite number between 1 and 42"
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import assert from 'node:assert/strict';

import { OutputFormatType, run } from '@factory/droid-sdk';

type FavoriteNumber = { favoriteNumber: number };

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
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
    outputFormat,
  });

  const structuredOutput = result.structuredOutput as FavoriteNumber | null;

  assert.ok(structuredOutput, 'Expected structuredOutput to be set');
  assert.equal(typeof structuredOutput.favoriteNumber, 'number');

  console.log('=== Structured output ===');
  console.log(JSON.stringify(structuredOutput, null, 2));

  console.log('\nStructured output example passed');
}

main().catch((error: unknown) => {
  console.error('Structured output example failed:', error);
  process.exit(1);
});
