import { z } from 'zod';

import { DroidLoopStatus, DroidLoopStopReason } from './enums.js';

// Bounds are frozen at the values shipped with the deprecated loop protocol
// surface; they intentionally do not track the live LOOP_INTERVAL_POLICY.
const DEPRECATED_LOOP_INTERVAL_MIN_MS = 5_000;
const DEPRECATED_LOOP_INTERVAL_MAX_MS = 24 * 60 * 60 * 1_000;

/** @deprecated Loop scheduling now uses daemon cron schemas. */
const LoopIntervalMsSchema = z
  .number()
  .int()
  .finite()
  .safe()
  .min(DEPRECATED_LOOP_INTERVAL_MIN_MS)
  .max(DEPRECATED_LOOP_INTERVAL_MAX_MS);

/** @deprecated Loop scheduling now uses daemon cron schemas. */
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

export type LoopState = z.infer<typeof LoopStateSchema>;
