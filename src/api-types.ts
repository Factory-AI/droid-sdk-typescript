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
