// Source-of-truth mirror of factory-mono-alpha daemon commands schema.
// Verbatim copy of packages/common/src/daemon/schemas/commands.ts.

import { z } from 'zod';

import { CustomCommandInfoSchema } from '../client.js';
import { JsonRpcBaseRequestSchema } from '../json-rpc.js';
import { DaemonDroidMethod } from './enums.js';

// LIST_COMMANDS - get all custom slash commands for a session
const DaemonListCommandsRequestParamsSchema = z.object({
  sessionId: z.string(),
});

export const DaemonListCommandsRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.LIST_COMMANDS),
  params: DaemonListCommandsRequestParamsSchema,
});

export const DaemonListCommandsResultSchema = z.object({
  commands: z.array(CustomCommandInfoSchema),
});
