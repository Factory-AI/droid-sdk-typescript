// Source-of-truth mirror of factory-mono-alpha MCP schemas.
// Verbatim copy of packages/common/src/droid/schemas/mcp.ts.

import { z } from 'zod';

import { McpServerStatus, McpServerType, SettingsLevel } from './enums.js';

// MCP primitives
export const McpServerNameSchema = z.string();
export const McpServerTypeSchema = z.enum(['stdio', 'http', 'sse']);

// Server config field schemas (used by registry and add-server requests)
export const McpHttpServerConfigFieldsSchema = z.object({
  url: z.string().optional(),
});

export const McpStdioServerConfigFieldsSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

// MCP server status (shared between LIST_MCP_SERVERS result and MCP_STATUS_CHANGED notification)
export const McpServerStatusInfoSchema = z.object({
  name: z.string(),
  status: z.nativeEnum(McpServerStatus),
  source: z.nativeEnum(SettingsLevel),
  isManaged: z.boolean(),
  error: z.string().optional(),
  toolCount: z.number().optional(),
  serverType: z.nativeEnum(McpServerType),
  hasAuthTokens: z.boolean().optional(),
  requiresAuth: z.boolean().optional(),
  pendingAuthUrl: z.string().optional(),
  pendingAuthMessage: z.string().optional(),
  pendingAuthState: z.string().optional(),
});

// MCP status summary (shared between LIST_MCP_SERVERS result and MCP_STATUS_CHANGED notification)
export const McpStatusSummarySchema = z.object({
  total: z.number(),
  connected: z.number(),
  connecting: z.number(),
  failed: z.number(),
  disabled: z.number().optional(),
});

// MCP registry server entity
const McpRegistryServerBaseSchema = z.object({
  name: McpServerNameSchema,
  description: z.string(),
  type: McpServerTypeSchema,
});

export const McpRegistryServerSchema = McpRegistryServerBaseSchema.merge(
  McpHttpServerConfigFieldsSchema
)
  .merge(McpStdioServerConfigFieldsSchema)
  .extend({
    note: z.string().optional(),
    logoUrl: z.string().optional(),
  });

// MCP tool entity
export const McpToolInfoSchema = z.object({
  serverName: McpServerNameSchema,
  name: z.string(),
  description: z.string().optional(),
  isEnabled: z.boolean(),
  isReadOnly: z.boolean().optional(),
  inputSchema: z
    .object({
      type: z.string().optional(),
      properties: z.record(z.unknown()).optional(),
      required: z.array(z.string()).optional(),
    })
    .optional(),
});
