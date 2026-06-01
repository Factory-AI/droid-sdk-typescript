import z from 'zod';

import {
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseSuccessSchema,
  JsonRpcBaseResponseFailureSchema,
} from '../json-rpc.js';
import {
  DaemonTerminalMethod,
  DaemonTerminalEvent,
  CreateTerminalError,
} from './enums.js';

// Terminal request params schemas
export const CreateTerminalRequestParamsSchema = z.object({
  terminalId: z.string(),
  cols: z.number().optional(),
  rows: z.number().optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
});

export const WriteDataRequestParamsSchema = z.object({
  terminalId: z.string(),
  data: z.string(),
});

export const ResizeRequestParamsSchema = z.object({
  terminalId: z.string(),
  cols: z.number(),
  rows: z.number(),
});

export const CloseTerminalRequestParamsSchema = z.object({
  terminalId: z.string(),
});

export const ListTerminalsRequestParamsSchema = z.object({});

// Terminal result schemas
export const CreateTerminalResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
  }),
  z.object({
    success: z.literal(false),
    error: z.nativeEnum(CreateTerminalError),
  }),
]);

export const WriteDataResultSchema = z.object({
  success: z.boolean(),
});

export const ResizeResultSchema = z.object({
  success: z.boolean(),
});

export const CloseTerminalResultSchema = z.object({
  success: z.boolean(),
});

export const TerminalInfoSchema = z.object({
  id: z.string(),
  pid: z.number().nullable(),
  cols: z.number(),
  rows: z.number(),
  createdAt: z.coerce.date(),
  state: z
    .object({
      serialized: z.string(),
      plainText: z.string(),
      cols: z.number(),
      rows: z.number(),
      timestamp: z.coerce.date(),
      cursorHidden: z.boolean().optional(),
    })
    .optional(),
});

export const ListTerminalsResultSchema = z.object({
  terminals: z.array(TerminalInfoSchema),
});

// Terminal request schemas - use TerminalMethod enum
export const CreateTerminalRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.CREATE),
  params: CreateTerminalRequestParamsSchema,
});

export const WriteDataRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.WRITE_DATA),
  params: WriteDataRequestParamsSchema,
});

export const ResizeRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.RESIZE),
  params: ResizeRequestParamsSchema,
});

export const CloseTerminalRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.CLOSE),
  params: CloseTerminalRequestParamsSchema,
});

export const ListTerminalsRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.LIST),
  params: ListTerminalsRequestParamsSchema,
});

// Terminal response schemas
export const CreateTerminalResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: CreateTerminalResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const WriteDataResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: WriteDataResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const ResizeResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: ResizeResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const CloseTerminalResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: CloseTerminalResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const ListTerminalsResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: ListTerminalsResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

// Union of all terminal request types (discriminated by method)
export const TerminalRequestSchema = z.discriminatedUnion('method', [
  CreateTerminalRequestSchema,
  WriteDataRequestSchema,
  ResizeRequestSchema,
  CloseTerminalRequestSchema,
  ListTerminalsRequestSchema,
]);

// Terminal notification schemas - match session notification pattern (no params wrapper, no sessionId)
export const TerminalDataNotificationSchema = z.object({
  type: z.literal(DaemonTerminalEvent.DATA),
  terminalId: z.string(),
  data: z.string(),
});

export const TerminalExitNotificationSchema = z.object({
  type: z.literal(DaemonTerminalEvent.EXIT),
  terminalId: z.string(),
  exitCode: z.number(),
  signal: z.string(),
});

// Union of all terminal notification types
export const TerminalNotificationSchema = z.discriminatedUnion('type', [
  TerminalDataNotificationSchema,
  TerminalExitNotificationSchema,
]);

// ============ DAEMON Terminal Request Params (with sessionId) ============

export const DaemonCreateTerminalRequestParamsSchema =
  CreateTerminalRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonWriteDataRequestParamsSchema =
  WriteDataRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonResizeRequestParamsSchema = ResizeRequestParamsSchema.extend(
  {
    sessionId: z.string(),
  }
);

export const DaemonCloseTerminalRequestParamsSchema =
  CloseTerminalRequestParamsSchema.extend({
    sessionId: z.string(),
  });

export const DaemonListTerminalsRequestParamsSchema =
  ListTerminalsRequestParamsSchema.extend({
    sessionId: z.string(),
  });

// ============ DAEMON Terminal Request Schemas ============

export const DaemonCreateTerminalRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonTerminalMethod.CREATE),
    params: DaemonCreateTerminalRequestParamsSchema,
  });

export const DaemonWriteDataRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.WRITE_DATA),
  params: DaemonWriteDataRequestParamsSchema,
});

export const DaemonResizeRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonTerminalMethod.RESIZE),
  params: DaemonResizeRequestParamsSchema,
});

export const DaemonCloseTerminalRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonTerminalMethod.CLOSE),
    params: DaemonCloseTerminalRequestParamsSchema,
  }
);

export const DaemonListTerminalsRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonTerminalMethod.LIST),
    params: DaemonListTerminalsRequestParamsSchema,
  }
);
