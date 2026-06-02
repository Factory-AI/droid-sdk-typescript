// JSON-RPC envelope/base protocol schemas.
// Note: params/result/data use z.unknown() intentionally so envelopes carry
// arbitrary payloads without typing the inner shape at this layer.

import { z } from 'zod';

import { JSONRPC_VERSION, LEGACY_FACTORY_API_VERSION } from './constants.js';
import {
  DroidInteractionMode,
  JsonRpcErrorCode,
  JsonRpcMessageType,
} from './enums.js';

const JsonRpcMessageTypeSchema = z.nativeEnum(JsonRpcMessageType);

export const DroidInteractionModeSchema = z.nativeEnum(DroidInteractionMode);

/**
 * Trace context metadata for distributed tracing propagation.
 * Follows W3C Trace Context standard for cross-service trace correlation.
 * @see https://www.w3.org/TR/trace-context/
 */
export const TraceContextMetaSchema = z.object({
  /** W3C traceparent header value (e.g., "00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01") */
  traceparent: z.string().optional(),
  /** W3C tracestate header value for vendor-specific trace data */
  tracestate: z.string().optional(),
});

export const JsonRpcEnvelopeSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  // Legacy metadata only. Do not repurpose for compatibility checks.
  factoryApiVersion: z
    .literal(LEGACY_FACTORY_API_VERSION)
    .describe('DEPRECATED - use factoryProtocolVersion for versioning instead'),
  /** Optional runtime compatibility signal; tolerate absence while old peers roll forward. */
  factoryProtocolVersion: z.string().optional(),
  /** Optional metadata for trace context propagation (MCP-style) */
  _meta: TraceContextMetaSchema.optional(),
});

export const JsonRpcProtocolVersionMismatchErrorDataSchema = z.object({
  localFactoryProtocolVersion: z.string(),
  peerFactoryProtocolVersion: z.string(),
  messageType: JsonRpcMessageTypeSchema.optional(),
  method: z.string().optional(),
  requestId: z.string().nullable().optional(),
});

export const JsonRpcErrorSchema = z.object({
  code: z.nativeEnum(JsonRpcErrorCode),
  message: z.string(),
  data: z.unknown().optional(),
});

export const BaseRequestSchema = z.object({
  type: z.literal('request'),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
});

const BaseResponseGenericSchema = z.object({
  type: z.literal('response'),
  id: z.string().nullable(),
  result: z.unknown().optional(),
  error: JsonRpcErrorSchema.optional(),
});

// id and result are required
export const BaseResponseSuccessSchema = BaseResponseGenericSchema.extend({
  id: z.string(),
  result: z.unknown(),
});
// error is required
export const BaseResponseFailureSchema = BaseResponseGenericSchema.extend({
  error: JsonRpcErrorSchema,
});

export const BaseNotificationSchema = z.object({
  type: z.literal('notification'),
  method: z.string(),
  params: z.unknown().optional(),
});

export const JsonRpcBaseRequestSchema = JsonRpcEnvelopeSchema.extend(
  BaseRequestSchema.shape
);
export const JsonRpcBaseResponseSuccessSchema = JsonRpcEnvelopeSchema.extend(
  BaseResponseSuccessSchema.shape
);
export const JsonRpcBaseResponseFailureSchema = JsonRpcEnvelopeSchema.extend(
  BaseResponseFailureSchema.shape
);
const JsonRpcBaseResponseGenericSchema = JsonRpcEnvelopeSchema.extend(
  BaseResponseGenericSchema.shape
);

export const JsonRpcBaseResponseSchema = z.union([
  JsonRpcBaseResponseFailureSchema,
  JsonRpcBaseResponseSuccessSchema,
]);

export const JsonRpcBaseNotificationSchema = JsonRpcEnvelopeSchema.extend(
  BaseNotificationSchema.shape
);

/**
 * Generic acknowledgement payload for command-style RPCs.
 */
export const CommandAckSchema = z.object({
  accepted: z.literal(true),
});

// Discriminated union for initial message type routing
// After parsing, use JsonRpcBaseResponseSchema for strict success/failure typing
export const JsonRpcMessageSchema = z.discriminatedUnion('type', [
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseGenericSchema,
  JsonRpcBaseNotificationSchema,
]);

export type TraceContextMeta = z.infer<typeof TraceContextMetaSchema>;
export type JsonRpcEnvelope = z.infer<typeof JsonRpcEnvelopeSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export type JsonRpcProtocolVersionMismatchErrorData = z.infer<
  typeof JsonRpcProtocolVersionMismatchErrorDataSchema
>;
export type JsonRpcBaseRequest = z.infer<typeof JsonRpcBaseRequestSchema>;
export type JsonRpcBaseResponseSuccess = z.infer<
  typeof JsonRpcBaseResponseSuccessSchema
>;
export type JsonRpcBaseResponseFailure = z.infer<
  typeof JsonRpcBaseResponseFailureSchema
>;
export type JsonRpcBaseResponse = z.infer<typeof JsonRpcBaseResponseSchema>;
export type JsonRpcBaseNotification = z.infer<
  typeof JsonRpcBaseNotificationSchema
>;
export type CommandAck = z.infer<typeof CommandAckSchema>;
export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;
