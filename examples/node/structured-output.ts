/**
 * Structured output example.
 *
 * Passes a JSON schema via `outputFormat` and reads the parsed object back
 * from `result.structuredOutput`.
 *
 * Usage:
 *   npx tsx examples/node/structured-output.ts
 */

import { OutputFormatType, run } from '@factory/droid-sdk/node';

interface CodeReview {
  summary: string;
  findings: Array<{
    line: number;
    severity: 'low' | 'medium' | 'high';
    message: string;
  }>;
}

const result = await run(
  `Review this code for correctness issues:

function getDisplayName(user) {
  return user.profile.name.trim();
}`,
  {
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          findings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                line: { type: 'number' },
                severity: {
                  type: 'string',
                  enum: ['low', 'medium', 'high'],
                },
                message: { type: 'string' },
              },
              required: ['line', 'severity', 'message'],
            },
          },
        },
        required: ['summary', 'findings'],
      },
    },
  }
);

if (!result.success) {
  const detail =
    result.structuredOutputError?.message ??
    result.error?.message ??
    'Unknown error';
  throw new Error(`run() failed (${result.subtype}): ${detail}`);
}

// A successful run can still omit structured output, for example when the
// model answers in prose instead of the requested schema.
if (!result.structuredOutput) {
  throw new Error('run() succeeded but returned no structured output.');
}

const review = result.structuredOutput as CodeReview;

console.log(JSON.stringify(review, null, 2));
