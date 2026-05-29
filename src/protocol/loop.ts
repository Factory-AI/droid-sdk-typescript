// Source-of-truth mirror of factory-mono-alpha loop schemas.
// Faithful copy of packages/common/src/droid/schemas/loop.ts.

import { z } from 'zod';

import { LOOP_INTERVAL_POLICY } from './constants.js';
import { DroidLoopStatus, DroidLoopStopReason } from './enums.js';

export const LoopIntervalMsSchema = z
  .number()
  .int()
  .finite()
  .safe()
  .min(LOOP_INTERVAL_POLICY.minMs)
  .max(LOOP_INTERVAL_POLICY.maxMs);

export const LoopStateSchema = z.object({
  loopId: z.string(),
  status: z.nativeEnum(DroidLoopStatus),
  intervalMs: LoopIntervalMsSchema,
  iteration: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  nextRunAt: z.number().int().nonnegative().nullable(),
  isDue: z.boolean(),
  lastRunStartedAt: z.number().int().nonnegative().optional(),
  lastRunCompletedAt: z.number().int().nonnegative().optional(),
  stopReason: z.nativeEnum(DroidLoopStopReason).optional(),
});

export const StartLoopRequestParamsSchema = z.object({
  intervalMs: LoopIntervalMsSchema,
  prompt: z.string().trim().min(1),
});

export const StopLoopRequestParamsSchema = z.object({});

export const GetLoopStatusRequestParamsSchema = z.object({});

export const RunLoopNowRequestParamsSchema = z.object({});

export const StartLoopResultSchema = z.object({
  loopState: LoopStateSchema,
});

export const StopLoopResultSchema = z.object({
  loopState: LoopStateSchema.nullable(),
});

export const GetLoopStatusResultSchema = z.object({
  loopState: LoopStateSchema.nullable(),
});

export const RunLoopNowResultSchema = z.object({
  loopState: LoopStateSchema,
});

export type LoopState = z.infer<typeof LoopStateSchema>;
export type StartLoopRequestParams = z.infer<
  typeof StartLoopRequestParamsSchema
>;
export type StartLoopResult = z.infer<typeof StartLoopResultSchema>;
export type StopLoopResult = z.infer<typeof StopLoopResultSchema>;
export type GetLoopStatusResult = z.infer<typeof GetLoopStatusResultSchema>;
export type RunLoopNowResult = z.infer<typeof RunLoopNowResultSchema>;
