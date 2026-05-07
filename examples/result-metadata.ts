/**
 * DroidResult metadata example.
 *
 * Runs a prompt with the actual Droid CLI and prints the aggregated `run()`
 * result metadata: sessionId, durationMs, turnCount, success, error, and token
 * usage.
 *
 * Usage:
 *   npx tsx examples/result-metadata.ts
 *   npx tsx examples/result-metadata.ts "Reply with metadata details."
 */

import assert from 'node:assert/strict';

import { run } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt =
    process.argv.slice(2).join(' ') ||
    'Reply with "Metadata OK" and nothing else.';

  console.log(`Sending prompt: "${prompt}"\n`);

  const result = await run(prompt, {
    cwd: process.cwd(),
  });

  assert.equal(typeof result.sessionId, 'string');
  assert.ok(result.sessionId.length > 0);
  assert.equal(typeof result.durationMs, 'number');
  assert.ok(result.durationMs >= 0);
  assert.equal(typeof result.turnCount, 'number');
  assert.ok(result.turnCount >= 1);
  assert.equal(typeof result.success, 'boolean');
  assert.ok(Array.isArray(result.messages));

  console.log('=== Result ===');
  console.log(result.text);

  console.log('\n=== Metadata ===');
  console.log(`Session ID: ${result.sessionId}`);
  console.log(`Duration: ${result.durationMs}ms`);
  console.log(`Turn count: ${result.turnCount}`);
  console.log(`Success: ${String(result.success)}`);
  console.log(`Messages received: ${result.messages.length}`);

  if (result.error) {
    console.log(`Error: ${result.error.message}`);
  }

  if (result.tokenUsage) {
    console.log(
      `Tokens — input: ${result.tokenUsage.inputTokens}, ` +
        `output: ${result.tokenUsage.outputTokens}`
    );
  }
}

main().catch((error: unknown) => {
  console.error('Error:', error);
  process.exit(1);
});
