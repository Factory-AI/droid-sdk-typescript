// Source-of-truth mirror of factory-mono-alpha droid crons tool-input schemas.
// Verbatim copy of packages/common/src/droid/schemas/crons.ts.

import { z } from 'zod';

const CronExpressionSchema = z
  .string()
  .trim()
  .regex(/^(\S+\s+){4}\S+$/, 'Expected a standard 5-field cron expression');

export const CronCreateToolInputSchema = z.object({
  expression: CronExpressionSchema.describe(
    'Standard 5-field cron expression in local time.'
  ),
  job: z.object({
    type: z.literal('prompt'),
    prompt: z.string().trim().min(1),
  }),
  target: z
    .object({
      type: z.literal('same_session'),
    })
    .optional(),
  recurring: z.boolean().describe('true for recurring tasks, false for once'),
});

export const CronDeleteToolInputSchema = z.object({
  cronId: z.string().length(8),
});

export const CronListToolInputSchema = z.object({});
