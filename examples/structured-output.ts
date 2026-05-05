/**
 * Structured output example.
 *
 * Runs a prompt with the actual Droid CLI and requests a JSON object
 * matching the provided schema.
 *
 * Usage:
 *   npx tsx examples/structured-output.ts
 *   npx tsx examples/structured-output.ts "Return a TypeScript pioneer"
 */

import assert from 'node:assert/strict';

import { run } from '../src/index.js';

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(' ') ||
    'Return exactly this person: name Ada Lovelace, language TypeScript.';

  const outputFormat = {
    type: 'json_schema' as const,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        language: { type: 'string' },
      },
      required: ['name', 'language'],
    },
  };

  console.log(`Sending prompt: "${prompt}"\n`);

  const result = await run(prompt, {
    cwd: process.cwd(),
    outputFormat,
  });

  assert.ok(result.structuredOutput, 'Expected structuredOutput to be set');
  assert.equal(typeof result.structuredOutput['name'], 'string');
  assert.equal(typeof result.structuredOutput['language'], 'string');

  console.log('=== Structured output ===');
  console.log(JSON.stringify(result.structuredOutput, null, 2));

  console.log('\nStructured output example passed');
}

main().catch((error: unknown) => {
  console.error('Structured output example failed:', error);
  process.exit(1);
});
