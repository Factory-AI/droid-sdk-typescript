import z from 'zod';

import {
  AddMcpServerRequestParamsSchema,
  AuthenticateMcpServerRequestParamsSchema,
  CancelMcpAuthRequestParamsSchema,
  ClearMcpAuthRequestParamsSchema,
  ListMcpRegistryRequestParamsSchema,
  ListMcpRegistryResultSchema,
  ListMcpServersRequestParamsSchema,
  ListMcpServersResultSchema,
  ListMcpToolsRequestParamsSchema,
  ListMcpToolsResultSchema,
  RemoveMcpServerRequestParamsSchema,
  ToggleMcpServerRequestParamsSchema,
  ToggleMcpToolRequestParamsSchema,
} from '../client.js';
import { McpServerStatus } from '../enums.js';
import { JsonRpcBaseRequestSchema } from '../json-rpc.js';
import { McpRegistryServerSchema, McpToolInfoSchema } from '../mcp.js';
import { DaemonDroidMethod, McpConfigSource } from './enums.js';

// MCP Server Config Schema (matches @factory/mcp)
const McpStdioServerConfigSchema = z.object({
  type: z.literal('stdio').optional().default('stdio'),
  command: z.string(),
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()).optional(),
  disabled: z.boolean().optional().default(false),
});

export const McpOAuthConfigSchema = z.object({
  scopes: z.array(z.string().trim().min(1)).optional(),
  clientId: z.string().trim().min(1).optional(),
  clientSecret: z
    .string()
    .min(1)
    .refine((secret) => secret.trim().length > 0, {
      message: 'clientSecret cannot be blank',
    })
    .optional(),
  callbackPort: z.number().int().min(1).max(65535).optional(),
});

export const McpHttpServerConfigSchema = z.object({
  type: z.literal('http'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  oauth: McpOAuthConfigSchema.optional(),
  disabled: z.boolean().optional().default(false),
});

const McpSseServerConfigSchema = z.object({
  type: z.literal('sse'),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  oauth: McpOAuthConfigSchema.optional(),
  disabled: z.boolean().optional().default(false),
});

export const McpServerConfigSchema = z.union([
  McpStdioServerConfigSchema,
  McpHttpServerConfigSchema,
  McpSseServerConfigSchema,
]);

// Server info with source and status
export const McpServerInfoSchema = z.object({
  name: z.string(),
  config: McpServerConfigSchema,
  source: z.nativeEnum(McpConfigSource),
  status: z.nativeEnum(McpServerStatus).optional(),
  error: z.string().optional(),
});

// Simple success result used by multiple MCP operations
export const McpSuccessResultSchema = z.object({
  success: z.boolean(),
});

// GET_MCP_CONFIG
export const DaemonGetMcpConfigRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.GET_MCP_CONFIG),
  params: z.object({}),
});

export const DaemonGetMcpConfigResultSchema = z.object({
  servers: z.array(McpServerInfoSchema),
});

// UPDATE_MCP_CONFIG
export const DaemonUpdateMcpConfigRequestParamsSchema = z.object({
  action: z.enum(['add', 'remove', 'enable', 'disable']),
  serverNames: z.array(z.string()),
  serverConfig: McpServerConfigSchema.optional(),
});

export const DaemonUpdateMcpConfigRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.UPDATE_MCP_CONFIG),
    params: DaemonUpdateMcpConfigRequestParamsSchema,
  });

export const DaemonUpdateMcpConfigResultSchema = z.object({
  success: z.boolean(),
  servers: z.array(McpServerInfoSchema),
  error: z.string().optional(),
});

// TOGGLE_MCP_SERVER - proxied to CLI session
export const DaemonToggleMcpServerRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.TOGGLE_MCP_SERVER),
    params: ToggleMcpServerRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  });

// AUTHENTICATE_MCP_SERVER - proxied to CLI session for OAuth flow
export const DaemonAuthenticateMcpServerRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.AUTHENTICATE_MCP_SERVER),
    params: AuthenticateMcpServerRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  });

// CANCEL_MCP_AUTH - proxied to CLI session to cancel pending OAuth flow
export const DaemonCancelMcpAuthRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.CANCEL_MCP_AUTH),
    params: CancelMcpAuthRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  }
);

// CLEAR_MCP_AUTH - proxied to CLI session to clear OAuth tokens
export const DaemonClearMcpAuthRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.CLEAR_MCP_AUTH),
  params: ClearMcpAuthRequestParamsSchema.extend({
    sessionId: z.string(),
  }),
});

// ADD_MCP_SERVER - proxied to CLI session to add MCP server to config
export const DaemonAddMcpServerRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.ADD_MCP_SERVER),
  params: AddMcpServerRequestParamsSchema.extend({
    sessionId: z.string(),
  }),
});

// REMOVE_MCP_SERVER - proxied to CLI session to remove MCP server from config
export const DaemonRemoveMcpServerRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.REMOVE_MCP_SERVER),
    params: RemoveMcpServerRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  });

// LIST_MCP_REGISTRY - proxied to CLI session to list available MCP servers
export const DaemonListMcpRegistryRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_MCP_REGISTRY),
    params: ListMcpRegistryRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  });

export const DaemonMcpRegistryServerSchema = McpRegistryServerSchema.extend({});

export const DaemonListMcpRegistryResultSchema =
  ListMcpRegistryResultSchema.extend({});

// LIST_MCP_TOOLS - get all tools with enabled/disabled state
export const DaemonListMcpToolsRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DaemonDroidMethod.LIST_MCP_TOOLS),
  params: ListMcpToolsRequestParamsSchema.extend({
    sessionId: z.string(),
  }),
});

export const DaemonMcpToolInfoSchema = McpToolInfoSchema.extend({});

export const DaemonListMcpToolsResultSchema = ListMcpToolsResultSchema.extend(
  {}
);

// TOGGLE_MCP_TOOL - enable/disable a specific tool
export const DaemonToggleMcpToolRequestSchema = JsonRpcBaseRequestSchema.extend(
  {
    method: z.literal(DaemonDroidMethod.TOGGLE_MCP_TOOL),
    params: ToggleMcpToolRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  }
);

// LIST_MCP_SERVERS - get current MCP server statuses for a session
export const DaemonListMcpServersRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.LIST_MCP_SERVERS),
    params: ListMcpServersRequestParamsSchema.extend({
      sessionId: z.string(),
    }),
  });

export const DaemonListMcpServersResultSchema =
  ListMcpServersResultSchema.extend({});

// SUBMIT_MCP_AUTH_CODE - relay OAuth auth code from frontend to CLI for remote sessions
const DaemonSubmitMcpAuthCodeRequestParamsSchema = z.object({
  sessionId: z.string(),
  serverName: z.string(),
  code: z.string(),
  state: z.string(),
});

export const DaemonSubmitMcpAuthCodeRequestSchema =
  JsonRpcBaseRequestSchema.extend({
    method: z.literal(DaemonDroidMethod.SUBMIT_MCP_AUTH_CODE),
    params: DaemonSubmitMcpAuthCodeRequestParamsSchema,
  });
