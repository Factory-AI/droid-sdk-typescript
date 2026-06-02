/**
 * Daemon management schemas.
 * These cover daemon lifecycle operations (updates, restarts, etc.)
 * that are not tied to specific droid sessions or settings.
 */
import z from 'zod';

import {
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseFailureSchema,
  JsonRpcBaseResponseSuccessSchema,
} from '../json-rpc.js';
import { DaemonManagementMethod } from './enums.js';

// Trigger update schemas
const DaemonTriggerUpdateRequestParamsSchema = z.object({});

export const DaemonTriggerUpdateRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonManagementMethod.TRIGGER_UPDATE),
    params: DaemonTriggerUpdateRequestParamsSchema,
  }
);

export const DaemonTriggerUpdateResultSchema = z.object({
  triggered: z.boolean(),
  message: z.string().optional(),
});

export const DaemonTriggerUpdateResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonTriggerUpdateResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// Install SSH key schemas
const DaemonInstallSshKeyRequestParamsSchema = z.object({
  publicKey: z.string().min(1),
});

export const DaemonInstallSshKeyRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonManagementMethod.INSTALL_SSH_KEY),
    params: DaemonInstallSshKeyRequestParamsSchema,
  }
);

export const DaemonInstallSshKeyResultSchema = z.object({
  installed: z.boolean(),
});
