/**
 * JSON-RPC 2.0 base schemas for the Factory Droid protocol.
 *
 * Ported from: packages/common/src/shared/schemas.ts
 */

import { z } from 'zod';

import { JSONRPC_VERSION, LEGACY_FACTORY_API_VERSION } from './constants.js';
import { JsonRpcErrorCode } from './enums.js';

// ---------------------------------------------------------------------------
// Trace context metadata
// ---------------------------------------------------------------------------

/** Trace context metadata for distributed tracing propagation. */
export const TraceContextMetaSchema = z.object({
  traceparent: z.string().optional(),
  tracestate: z.string().optional(),
});

export type TraceContextMeta = z.infer<typeof TraceContextMetaSchema>;

/** Shared tool selection override fields reused across client/server schemas. */
export const ToolSelectionOverridesSchema = z.object({
  enabledToolIds: z.array(z.string()).optional(),
  disabledToolIds: z.array(z.string()).optional(),
});

export type ToolSelectionOverrides = z.infer<
  typeof ToolSelectionOverridesSchema
>;

// ---------------------------------------------------------------------------
// JSON-RPC envelope
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 envelope with Factory protocol extensions. */
export const JsonRpcEnvelopeSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  factoryApiVersion: z.literal(LEGACY_FACTORY_API_VERSION),
  factoryProtocolVersion: z.string().optional(),
  _meta: TraceContextMetaSchema.optional(),
});

export type JsonRpcEnvelope = z.infer<typeof JsonRpcEnvelopeSchema>;

// ---------------------------------------------------------------------------
// JSON-RPC error
// ---------------------------------------------------------------------------

/** JSON-RPC 2.0 error object. */
export const JsonRpcErrorSchema = z.object({
  code: z.nativeEnum(JsonRpcErrorCode),
  message: z.string(),
  data: z.unknown().optional(),
});

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

// ---------------------------------------------------------------------------
// Base message schemas (without envelope)
// ---------------------------------------------------------------------------

/** Base JSON-RPC request. */
export const BaseRequestSchema = z.object({
  type: z.literal('request'),
  id: z.string(),
  method: z.string(),
  params: z.unknown().optional(),
});

export type BaseRequest = z.infer<typeof BaseRequestSchema>;

/** Base JSON-RPC success response. */
export const BaseResponseSuccessSchema = z.object({
  type: z.literal('response'),
  id: z.string(),
  result: z.unknown(),
});

export type BaseResponseSuccess = z.infer<typeof BaseResponseSuccessSchema>;

/** Base JSON-RPC failure response. */
export const BaseResponseFailureSchema = z.object({
  type: z.literal('response'),
  id: z.string().nullable(),
  error: JsonRpcErrorSchema,
});

export type BaseResponseFailure = z.infer<typeof BaseResponseFailureSchema>;

/** Base JSON-RPC notification. */
export const BaseNotificationSchema = z.object({
  type: z.literal('notification'),
  method: z.string(),
  params: z.unknown().optional(),
});

export type BaseNotification = z.infer<typeof BaseNotificationSchema>;

// ---------------------------------------------------------------------------
// Combined models (Envelope + Base)
// ---------------------------------------------------------------------------

/** Full JSON-RPC request with envelope fields. */
export const JsonRpcRequestSchema = JsonRpcEnvelopeSchema.extend(
  BaseRequestSchema.shape
);

export type JsonRpcRequest = z.infer<typeof JsonRpcRequestSchema>;

/** Full JSON-RPC success response with envelope fields. */
export const JsonRpcResponseSuccessSchema = JsonRpcEnvelopeSchema.extend(
  BaseResponseSuccessSchema.shape
);

export type JsonRpcResponseSuccess = z.infer<
  typeof JsonRpcResponseSuccessSchema
>;

/** Full JSON-RPC failure response with envelope fields. */
export const JsonRpcResponseFailureSchema = JsonRpcEnvelopeSchema.extend(
  BaseResponseFailureSchema.shape
);

export type JsonRpcResponseFailure = z.infer<
  typeof JsonRpcResponseFailureSchema
>;

/** Full JSON-RPC notification with envelope fields. */
export const JsonRpcNotificationSchema = JsonRpcEnvelopeSchema.extend(
  BaseNotificationSchema.shape
);

export type JsonRpcNotification = z.infer<typeof JsonRpcNotificationSchema>;

/** JSON-RPC response (success or failure). */
export const JsonRpcResponseSchema = z.union([
  JsonRpcResponseFailureSchema,
  JsonRpcResponseSuccessSchema,
]);

export type JsonRpcResponse = z.infer<typeof JsonRpcResponseSchema>;

/** Discriminated union for initial message type routing. */
export const JsonRpcMessageSchema = z.discriminatedUnion('type', [
  JsonRpcRequestSchema,
  JsonRpcEnvelopeSchema.extend({
    type: z.literal('response'),
    id: z.string().nullable(),
    result: z.unknown().optional(),
    error: JsonRpcErrorSchema.optional(),
  }),
  JsonRpcNotificationSchema,
]);

export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;
