/**
 * Structured output example.
 *
 * Defines the expected output once with zod, sends it to Droid as a JSON
 * schema via `outputFormat`, and validates `result.structuredOutput` with the
 * same schema.
 *
 * Usage:
 *   npx tsx examples/node/structured-output.ts
 */

import { OutputFormatType, run } from '@factory/droid-sdk/node';
// `zod/v4` provides `z.toJSONSchema()`. sdk-mcp-tool.ts imports `zod` instead,
// because the SDK `tool()` helper expects zod v3 schemas.
import { z } from 'zod/v4';

const CodeReviewSchema = z.strictObject({
  summary: z.string(),
  findings: z.array(
    z.strictObject({
      line: z.number(),
      severity: z.enum(['low', 'medium', 'high']),
      message: z.string(),
    })
  ),
});

const result = await run(
  `Review this code for correctness issues:

function getDisplayName(user) {
  return user.profile.name.trim();
}`,
  {
    outputFormat: {
      type: OutputFormatType.JsonSchema,
      // Droid validates schemas as JSON Schema draft-07; zod defaults to 2020-12.
      schema: z.toJSONSchema(CodeReviewSchema, { target: 'draft-7' }),
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
const parsed = CodeReviewSchema.safeParse(result.structuredOutput);
if (!parsed.success) {
  throw new Error(
    `Unexpected structured output:\n${z.prettifyError(parsed.error)}`
  );
}

const review = parsed.data;
console.log(review.summary);
for (const finding of review.findings) {
  console.log(
    `- line ${finding.line} [${finding.severity}] ${finding.message}`
  );
}
