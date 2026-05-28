/**
 * One-off integration smoke test for JSON output against Droid.
 *
 * Usage:
 *   npx tsx examples/droid-dev-structured-output.ts
 *   DROID_EXEC_PATH=/path/to/droid npx tsx examples/droid-dev-structured-output.ts
 */

import { run } from '@factory/droid-sdk';
import { z } from 'zod';

const PersonSchema = z.object({
  name: z.literal('Ada Lovelace'),
  language: z.literal('TypeScript'),
  score: z.number(),
});

async function main(): Promise<void> {
  const execPath = process.env['DROID_EXEC_PATH'] ?? 'droid';

  const result = await run(
    [
      'Return a structured object for Ada Lovelace.',
      'Use name "Ada Lovelace", language "TypeScript", and score 99.',
      'Return only valid JSON and do not include markdown fences.',
    ].join(' '),
    {
      apiKey: process.env.FACTORY_API_KEY!,
      execPath,
      cwd: process.cwd(),
    }
  );

  const parsed = PersonSchema.parse(JSON.parse(result.text));

  console.log(`droid executable: ${execPath}`);
  console.log('structured output:', JSON.stringify(parsed, null, 2));
  console.log(`messages received: ${result.messages.length}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
