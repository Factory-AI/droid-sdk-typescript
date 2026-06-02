import { z } from 'zod';

import {
  JsonRpcBaseNotificationSchema,
  JsonRpcBaseRequestSchema,
} from '../json-rpc.js';
import { DaemonDroidMethod, DaemonCronEvent } from './enums.js';

export const CronStatusSchema = z.enum([
  'active',
  'held',
  'paused',
  'running',
  'error',
  'expired',
  'cancelled',
]);

export const CronKindSchema = z.literal('session_prompt');

const CronSourceSchema = z.enum(['loop_command', 'cron_tool']);

const UserUpdatableCronStatusSchema = z.enum(['active', 'paused']);

export const CronScopeSchema = z.object({
  type: z.literal('session'),
  sessionId: z.string(),
  sessionCwd: z.string(),
  storageDir: z.string(),
});

export const CronCreateScopeSchema = z.object({
  type: z.literal('session'),
  sessionId: z.string(),
  sessionCwd: z.string(),
});

export const CronPayloadSchema = z.object({
  type: z.literal('prompt'),
  prompt: z.string().trim().min(1),
  target: z.object({
    type: z.literal('same_session'),
  }),
});

export const CronRecordSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  kind: CronKindSchema,
  status: CronStatusSchema,
  source: CronSourceSchema,
  scope: CronScopeSchema,
  schedule: z.object({
    expression: z.string().trim().min(1),
    recurring: z.boolean(),
    nextRunAt: z.string().optional(),
    firstFireGuardUntil: z.string().optional(),
    timezone: z.literal('UTC'),
  }),
  runPolicy: z.object({
    whenSessionInactive: z.literal('hold'),
  }),
  payload: CronPayloadSchema,
  stats: z.object({
    fireCount: z.number().int().nonnegative(),
    lastRunAt: z.string().optional(),
    lastCompletedAt: z.string().optional(),
    lastError: z.string().optional(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
  heldAt: z.string().optional(),
  holdReason: z.string().optional(),
});

export const DaemonListCronsRequestParamsSchema = z.object({
  sessionId: z.string().optional(),
  includeInactive: z.boolean().optional(),
});

export const DaemonListCronsRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.LIST_CRONS),
  params: DaemonListCronsRequestParamsSchema,
});

export const DaemonListCronsResultSchema = z.object({
  crons: z.array(CronRecordSchema),
});

export const DaemonCreateCronRequestParamsSchema = z.object({
  kind: CronKindSchema,
  source: CronSourceSchema,
  scope: CronCreateScopeSchema,
  schedule: z.object({
    expression: z.string().trim().min(1),
    recurring: z.boolean(),
  }),
  runImmediately: z.boolean().optional(),
  runPolicy: z
    .object({
      whenSessionInactive: z.literal('hold'),
    })
    .optional(),
  payload: CronPayloadSchema,
});

export const DaemonCreateCronRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.CREATE_CRON),
  params: DaemonCreateCronRequestParamsSchema,
});

export const DaemonCreateCronResultSchema = z.object({
  cron: CronRecordSchema,
});

export const DaemonDeleteCronRequestParamsSchema = z.object({
  cronId: z.string(),
  sessionId: z.string().optional(),
});

export const DaemonDeleteCronRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.DELETE_CRON),
  params: DaemonDeleteCronRequestParamsSchema,
});

export const DaemonDeleteCronResultSchema = z.object({
  deleted: z.boolean(),
});

const CronUpdatePayloadPatchSchema = z
  .object({
    prompt: z.string().trim().min(1).optional(),
  })
  .strict();

export const DaemonUpdateCronRequestParamsSchema = z.object({
  cronId: z.string(),
  status: UserUpdatableCronStatusSchema.optional(),
  schedule: z
    .object({
      expression: z.string().trim().min(1),
      recurring: z.boolean(),
    })
    .optional(),
  payload: CronUpdatePayloadPatchSchema.optional(),
});

export const DaemonUpdateCronRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.UPDATE_CRON),
  params: DaemonUpdateCronRequestParamsSchema,
});

export const DaemonUpdateCronResultSchema = z.object({
  cron: CronRecordSchema.nullable(),
});

export const DaemonHoldSessionCronsRequestParamsSchema = z.object({
  sessionId: z.string(),
  reason: z.string(),
});

export const DaemonHoldSessionCronsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.HOLD_SESSION_CRONS),
    params: DaemonHoldSessionCronsRequestParamsSchema,
  });

export const DaemonHoldSessionCronsResultSchema = z.object({
  heldCount: z.number().int().nonnegative(),
});

export const DaemonResumeSessionCronsRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonResumeSessionCronsRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.RESUME_SESSION_CRONS),
    params: DaemonResumeSessionCronsRequestParamsSchema,
  });

export const DaemonResumeSessionCronsResultSchema = z.object({
  resumedCount: z.number().int().nonnegative(),
});

export const DaemonCronStateChangedNotificationParamsSchema = z.object({
  reason: z.enum(['created', 'updated', 'deleted']),
  cronIds: z.array(z.string()),
  crons: z.array(CronRecordSchema).optional(),
});

export const DaemonCronStateChangedNotificationSchema =
  JsonRpcBaseNotificationSchema.extend({
    method: z.literal(DaemonCronEvent.STATE_CHANGED),
    params: DaemonCronStateChangedNotificationParamsSchema,
  });
