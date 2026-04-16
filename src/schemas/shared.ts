import { z } from 'zod';

import { JSONRPC_VERSION, LEGACY_FACTORY_API_VERSION } from './constants.js';
import { JsonRpcErrorCode } from './enums.js';

/** JSON-compatible primitive values. */
export type JsonPrimitive = string | number | boolean | null;

/** JSON-compatible object values. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** JSON-compatible array values. */
export type JsonArray = JsonValue[];

/** Recursive JSON-compatible value. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

export const JsonObjectSchema: z.ZodType<JsonObject> =
  z.record(JsonValueSchema);

export const JsonArraySchema: z.ZodType<JsonArray> = z.array(JsonValueSchema);

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

/** JSON-RPC 2.0 envelope with Factory protocol extensions. */
export const JsonRpcEnvelopeSchema = z.object({
  jsonrpc: z.literal(JSONRPC_VERSION),
  factoryApiVersion: z.literal(LEGACY_FACTORY_API_VERSION),
  factoryProtocolVersion: z.string().optional(),
  _meta: TraceContextMetaSchema.optional(),
});

export type JsonRpcEnvelope = z.infer<typeof JsonRpcEnvelopeSchema>;

/** JSON-RPC 2.0 error object. */
export const JsonRpcErrorSchema = z.object({
  code: z.nativeEnum(JsonRpcErrorCode),
  message: z.string(),
  data: JsonValueSchema.optional(),
});

export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;

/** Base JSON-RPC request. */
export const BaseRequestSchema = z.object({
  type: z.literal('request'),
  id: z.string(),
  method: z.string(),
  params: JsonValueSchema.optional(),
});

export type BaseRequest = z.infer<typeof BaseRequestSchema>;

/** Base JSON-RPC success response. */
export const BaseResponseSuccessSchema = z.object({
  type: z.literal('response'),
  id: z.string(),
  result: JsonValueSchema,
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
  params: JsonValueSchema.optional(),
});

export type BaseNotification = z.infer<typeof BaseNotificationSchema>;

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
    result: JsonValueSchema.optional(),
    error: JsonRpcErrorSchema.optional(),
  }),
  JsonRpcNotificationSchema,
]);

export type JsonRpcMessage = z.infer<typeof JsonRpcMessageSchema>;
