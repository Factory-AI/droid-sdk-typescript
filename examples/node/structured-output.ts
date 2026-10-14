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

function isCodeReview(value: unknown): value is CodeReview {
  if (
    value === null ||
    typeof value !== 'object' ||
    !('summary' in value) ||
    typeof value.summary !== 'string' ||
    !('findings' in value) ||
    !Array.isArray(value.findings)
  ) {
    return false;
  }

  return value.findings.every(
    (finding) =>
      finding !== null &&
      typeof finding === 'object' &&
      'line' in finding &&
      typeof finding.line === 'number' &&
      'severity' in finding &&
      ['low', 'medium', 'high'].includes(String(finding.severity)) &&
      'message' in finding &&
      typeof finding.message === 'string'
  );
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
        additionalProperties: false,
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

// The SDK returns `unknown`; validate it before reading fields.
if (!isCodeReview(result.structuredOutput)) {
  throw new Error('run() returned an unexpected structured output shape.');
}

console.log(JSON.stringify(result.structuredOutput, null, 2));
