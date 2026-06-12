import { z } from 'zod';

import {
  McpServerStatus,
  McpServerType,
  SettingsLevel,
  ToolConfirmationOutcome,
} from './enums.js';
import { JsonObjectSchema } from './shared.js';

export const McpStdioServerConfigFieldsSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
});

export type McpStdioServerConfigFields = z.infer<
  typeof McpStdioServerConfigFieldsSchema
>;

export const McpHttpServerConfigFieldsSchema = z.object({
  url: z.string().optional(),
});

export type McpHttpServerConfigFields = z.infer<
  typeof McpHttpServerConfigFieldsSchema
>;

export const McpSseServerConfigFieldsSchema = z.object({
  url: z.string(),
  headers: z.record(z.string()).optional(),
});

export type McpSseServerConfigFields = z.infer<
  typeof McpSseServerConfigFieldsSchema
>;

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

/** JSON Schema subset for MCP tool input parameters. */
export const McpToolInputSchemaSchema = z
  .object({
    type: z.string().optional(),
    properties: JsonObjectSchema.optional(),
    required: z.array(z.string()).optional(),
  })
  .passthrough();

export type McpToolInputSchema = z.infer<typeof McpToolInputSchemaSchema>;

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

export const ToolConfirmationListItemSchema = z
  .object({
    label: z.string(),
    // Accept values beyond ToolConfirmationOutcome so newer CLI versions can
    // offer options the SDK does not know about yet.
    value: z.union([z.nativeEnum(ToolConfirmationOutcome), z.string()]),
  })
  .passthrough();

export type ToolConfirmationListItem = z.infer<
  typeof ToolConfirmationListItemSchema
>;
