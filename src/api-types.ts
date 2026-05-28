import { z } from 'zod';

const EnvironmentVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
});

export const MachineTemplateBuildStatusSchema = z.object({
  status: z.enum(['building', 'success', 'failed']),
  failureReason: z
    .enum(['setup_script_error', 'system_error'])
    .optional(),
  buildStartedAt: z.number().int().optional(),
  builtAt: z.number().int().optional(),
  logs: z.string().optional(),
});

export type MachineTemplateBuildStatus = z.infer<
  typeof MachineTemplateBuildStatusSchema
>;

export const MachineTemplateSchema = z.object({
  templateId: z.string(),
  repoUrl: z.string(),
  templateName: z.string(),
  defaultBranch: z.string(),
  createdBy: z.string(),
  createdAt: z.number().int().optional(),
  buildStatus: MachineTemplateBuildStatusSchema.optional(),
  lastUpdatedAt: z.number().int().nullable().optional(),
  environmentVariables: z.array(EnvironmentVariableSchema).optional(),
  userEnvironmentVariablesByUser: z
    .array(EnvironmentVariableSchema)
    .optional(),
  setupScript: z.string().optional(),
});

export type MachineTemplate = z.infer<typeof MachineTemplateSchema>;

export const MachineTemplateListResponseSchema = z.object({
  templates: z.array(MachineTemplateSchema),
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

export type MachineTemplateListResponse = z.infer<
  typeof MachineTemplateListResponseSchema
>;

export interface ListMachineTemplatesOptions {
  apiKey: string;
  baseUrl?: string;
  limit?: number;
  cursor?: string;
}

export interface GetMachineTemplateOptions {
  apiKey: string;
  baseUrl?: string;
  templateId: string;
}

export const CreateSandboxResponseSchema = z.object({
  sandboxId: z.string(),
});

export type CreateSandboxResponse = z.infer<typeof CreateSandboxResponseSchema>;

export interface CreateSandboxOptions {
  apiKey: string;
  baseUrl?: string;
  workspaceId: string;
}

export const ComputerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    hostname: z.string().optional(),
    providerType: z.enum(['byom', 'e2b']),
    status: z.enum(['provisioning', 'active', 'error']).optional(),
    createdAt: z.number().int(),
    relayClientUrl: z.string().optional(),
    remoteUser: z.string().optional(),
  })
  .passthrough();

export type Computer = z.infer<typeof ComputerSchema>;

export const ComputerListResponseSchema = z.object({
  computers: z.array(ComputerSchema),
});

export type ComputerListResponse = z.infer<typeof ComputerListResponseSchema>;

export interface ListComputersOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface GetComputerOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
}
