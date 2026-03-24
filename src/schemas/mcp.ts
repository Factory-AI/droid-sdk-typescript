/**
 * MCP entity schemas for the Factory Droid protocol.
 *
 * Ported from: packages/common/src/droid/schemas/mcp.ts
 */

import { z } from "zod";

import { McpServerStatus, McpServerType, SettingsLevel, ToolConfirmationOutcome } from "./enums.js";

// ---------------------------------------------------------------------------
// MCP server config field schemas
// ---------------------------------------------------------------------------

/** Stdio MCP server configuration fields. */
export const McpStdioServerConfigFieldsSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export type McpStdioServerConfigFields = z.infer<
  typeof McpStdioServerConfigFieldsSchema
>;

/** HTTP MCP server configuration fields. */
export const McpHttpServerConfigFieldsSchema = z.object({
  url: z.string().optional(),
});

export type McpHttpServerConfigFields = z.infer<
  typeof McpHttpServerConfigFieldsSchema
>;

/** SSE MCP server configuration fields. */
export const McpSseServerConfigFieldsSchema = z.object({
  url: z.string(),
  headers: z.record(z.string()).optional(),
});

export type McpSseServerConfigFields = z.infer<
  typeof McpSseServerConfigFieldsSchema
>;

// ---------------------------------------------------------------------------
// MCP server status and summary
// ---------------------------------------------------------------------------

/** MCP server status information. */
export const McpServerStatusInfoSchema = z
  .object({
    name: z.string(),
    status: z.nativeEnum(McpServerStatus),
    source: z.nativeEnum(SettingsLevel),
    isManaged: z.boolean(),
    error: z.string().optional(),
    toolCount: z.number().optional(),
    serverType: z.nativeEnum(McpServerType).optional(),
    hasAuthTokens: z.boolean().optional(),
  })
  .passthrough();

export type McpServerStatusInfo = z.infer<typeof McpServerStatusInfoSchema>;

/** MCP status summary. */
export const McpStatusSummarySchema = z
  .object({
    total: z.number(),
    connected: z.number(),
    connecting: z.number(),
    failed: z.number(),
    disabled: z.number().optional(),
  })
  .passthrough();

export type McpStatusSummary = z.infer<typeof McpStatusSummarySchema>;

// ---------------------------------------------------------------------------
// MCP registry server
// ---------------------------------------------------------------------------

/** MCP registry server entity. */
export const McpRegistryServerSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    type: z.nativeEnum(McpServerType),
    // Stdio config fields
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    // HTTP config fields
    url: z.string().optional(),
    // Additional metadata
    note: z.string().optional(),
    logoUrl: z.string().optional(),
  })
  .passthrough();

export type McpRegistryServer = z.infer<typeof McpRegistryServerSchema>;

// ---------------------------------------------------------------------------
// MCP tool info
// ---------------------------------------------------------------------------

/** JSON Schema subset for MCP tool input parameters. */
export const McpToolInputSchemaSchema = z
  .object({
    type: z.string().optional(),
    properties: z.record(z.unknown()).optional(),
    required: z.array(z.string()).optional(),
  })
  .passthrough();

export type McpToolInputSchema = z.infer<typeof McpToolInputSchemaSchema>;

/** MCP tool information entity. */
export const McpToolInfoSchema = z
  .object({
    serverName: z.string(),
    name: z.string(),
    description: z.string().optional(),
    isEnabled: z.boolean(),
    isReadOnly: z.boolean().optional(),
    inputSchema: McpToolInputSchemaSchema.optional(),
  })
  .passthrough();

export type McpToolInfo = z.infer<typeof McpToolInfoSchema>;

// ---------------------------------------------------------------------------
// Tool confirmation list item
// ---------------------------------------------------------------------------

/** Selectable list item for tool confirmation prompts. */
export const ToolConfirmationListItemSchema = z
  .object({
    label: z.string(),
    value: z.nativeEnum(ToolConfirmationOutcome),
  })
  .passthrough();

export type ToolConfirmationListItem = z.infer<
  typeof ToolConfirmationListItemSchema
>;
