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

export interface CreateComputerOptions {
  apiKey: string;
  baseUrl?: string;
  name: string;
  remoteUser: string;
  provider?: 'byom' | 'e2b';
  hostId?: string;
  repos?: string[];
  autoInstallDeps?: boolean;
  serviceAccountId?: string;
}

export interface GetComputerByNameOptions {
  apiKey: string;
  baseUrl?: string;
  name: string;
}

export interface UpdateComputerOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
  name?: string;
  remoteUser?: string;
  hostId?: string;
}

export interface DeleteComputerOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
}

export interface RestartComputerOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
}

export interface RefreshComputerOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
}

export const RefreshComputerResponseSchema = z.object({
  configured: z.number().int(),
});

export type RefreshComputerResponse = z.infer<
  typeof RefreshComputerResponseSchema
>;

export const ComputerMetricSchema = z.object({
  timestamp: z.string(),
  cpuUsedPct: z.number(),
  cpuCount: z.number(),
  memUsed: z.number(),
  memTotal: z.number(),
  diskUsed: z.number(),
  diskTotal: z.number(),
});

export type ComputerMetric = z.infer<typeof ComputerMetricSchema>;

export const ComputerMetricsResponseSchema = z.array(ComputerMetricSchema);

export type ComputerMetricsResponse = z.infer<
  typeof ComputerMetricsResponseSchema
>;

export interface GetComputerMetricsOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
  start?: string;
}

export interface RetryInstallDepsOptions {
  apiKey: string;
  baseUrl?: string;
  computerId: string;
}

export const RemoteSessionSchema = z.object({
  sessionId: z.string(),
  title: z.string().optional(),
  status: z.enum(['idle', 'pending', 'running']),
  messageCount: z.number().int(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  completedAt: z.number().int().optional(),
  computerId: z.string().optional(),
});

export type RemoteSession = z.infer<typeof RemoteSessionSchema>;

export const RemoteSessionListResponseSchema = z.object({
  sessions: z.array(RemoteSessionSchema),
  pagination: z.object({
    hasMore: z.boolean(),
    nextCursor: z.string().nullable(),
  }),
});

export type RemoteSessionListResponse = z.infer<
  typeof RemoteSessionListResponseSchema
>;

export interface ListRemoteSessionsOptions {
  apiKey: string;
  baseUrl?: string;
  computerId?: string;
  limit?: number;
  cursor?: string;
}


