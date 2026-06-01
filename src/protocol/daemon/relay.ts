/**
 * Daemon relay schemas.
 * These cover relay connection lifecycle operations for BYOM computers.
 */
import z from 'zod';

import {
  JsonRpcBaseNotificationSchema,
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseFailureSchema,
  JsonRpcBaseResponseSuccessSchema,
} from '../json-rpc.js';
import { DaemonRelayEvent, DaemonRelayMethod } from './enums.js';

// daemon.relay.start
export const DaemonRelayStartRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonRelayMethod.START),
  params: z.object({}),
});

export const DaemonRelayStartResultSchema = z.object({
  relayUrl: z.string(),
  computerId: z.string(),
});

export const DaemonRelayStartResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonRelayStartResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// daemon.relay.stop
export const DaemonRelayStopRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonRelayMethod.STOP),
  params: z.object({}),
});

export const DaemonRelayStopResultSchema = z.object({}).strict();

export const DaemonRelayStopResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonRelayStopResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// daemon.relay.get_status
export const DaemonRelayGetStatusRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonRelayMethod.GET_STATUS),
    params: z.object({}),
  });

export const DaemonRelayGetStatusResultSchema = z.object({
  connected: z.boolean(),
  url: z.string().optional(),
  clientCount: z.number().optional(),
  computerId: z.string().optional(),
});

export const DaemonRelayGetStatusResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: DaemonRelayGetStatusResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// daemon.relay.status_changed (push notification for external state changes, e.g. unexpected disconnects)
export const DaemonRelayStatusChangedNotificationParamsSchema = z.object({
  connected: z.boolean(),
  url: z.string().optional(),
  clientCount: z.number().optional(),
  computerId: z.string().optional(),
});

export const DaemonRelayStatusChangedNotificationSchema =
  JsonRpcBaseNotificationSchema.extend({
    method: z.literal(DaemonRelayEvent.STATUS_CHANGED),
    params: DaemonRelayStatusChangedNotificationParamsSchema,
  });
