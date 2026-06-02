import { z } from 'zod';

import {
  AutonomyLevel,
  AutonomyMode,
  ContextStatsAccuracy,
  DecompSessionType,
  DroidInteractionMode,
  DroidServerMethod,
  McpServerType,
  ModelProvider,
  MissionState,
  ReasoningEffort,
  SettingsLevel,
  SkillLocation,
} from './enums.js';
import {
  McpRegistryServerSchema,
  McpServerStatusInfoSchema,
  McpStatusSummarySchema,
  McpToolInfoSchema,
} from './mcp.js';
import { Base64ImageSourceSchema, DocumentSourceSchema } from './messages.js';
import { MissionFeatureSchema, ProgressLogEntrySchema } from './mission.js';
import {
  createResponseSchema,
  EmptyResultSchema,
  JsonObjectSchema,
  type JsonRpcResponseFailure,
  JsonRpcRequestSchema,
  JsonRpcResponseSuccessSchema,
  SuccessResultSchema,
  ToolSelectionOverridesSchema,
} from './shared.js';

const SessionModeRequestFieldsShape = {
  modelId: z.string().optional(),
  autonomyMode: z.nativeEnum(AutonomyMode).optional(),
  interactionMode: z.nativeEnum(DroidInteractionMode).optional(),
  autonomyLevel: z.nativeEnum(AutonomyLevel).optional(),
};

export const SessionTagSchema = z
  .object({
    name: z.string(),
    metadata: z.record(z.string()).optional(),
  })
  .strict();

export type SessionTag = z.infer<typeof SessionTagSchema>;

export const SessionSourceSchema = z
  .object({
    platform: z.string(),
  })
  .passthrough();

export type SessionSource = z.infer<typeof SessionSourceSchema>;

export const StdioMcpConfigSchema = z
  .object({
    name: z.string(),
    command: z.string(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional().default({}),
  })
  .strict();

export type StdioMcpConfig = z.infer<typeof StdioMcpConfigSchema>;

export const HttpHeaderSchema = z
  .object({
    name: z.string(),
    value: z.string(),
  })
  .strict();

export type HttpHeader = z.infer<typeof HttpHeaderSchema>;

export const HttpMcpConfigSchema = z
  .object({
    type: z.literal('http'),
    name: z.string(),
    url: z.string().url(),
    headers: HttpHeaderSchema.array().default([]),
  })
  .strict();

export type HttpMcpConfig = z.infer<typeof HttpMcpConfigSchema>;

export const SseMcpConfigSchema = z
  .object({
    type: z.literal('sse'),
    name: z.string(),
    url: z.string().url(),
    headers: HttpHeaderSchema.array().default([]),
  })
  .strict();

export type SseMcpConfig = z.infer<typeof SseMcpConfigSchema>;

export const McpServerConfigSchema = z.union([
  StdioMcpConfigSchema,
  HttpMcpConfigSchema,
  SseMcpConfigSchema,
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/** Session settings returned in init/load results. */
export const SessionSettingsSchema = z
  .object({
    modelId: z.string(),
    reasoningEffort: z.nativeEnum(ReasoningEffort),
    autonomyMode: z.nativeEnum(AutonomyMode).optional(),
    interactionMode: z
      .nativeEnum(DroidInteractionMode)
      .optional()
      .catch(undefined),
    autonomyLevel: z.nativeEnum(AutonomyLevel).optional().catch(undefined),
    specModeModelId: z.string().optional(),
    specModeReasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    ...ToolSelectionOverridesSchema.shape,
  })
  .passthrough();

export type SessionSettings = z.infer<typeof SessionSettingsSchema>;

export const GitRepoInfoSchema = z
  .object({
    owner: z.string().optional(),
    repoName: z.string(),
  })
  .passthrough();

export type GitRepoInfo = z.infer<typeof GitRepoInfoSchema>;

/** Available model configuration returned in session init/load responses. */
export const AvailableModelConfigSchema = z
  .object({
    id: z.string(),
    modelId: z.string().optional(),
    displayName: z.string(),
    shortDisplayName: z.string(),
    modelProvider: z.nativeEnum(ModelProvider),
    supportedReasoningEfforts: z.array(z.nativeEnum(ReasoningEffort)),
    defaultReasoningEffort: z.nativeEnum(ReasoningEffort),
    isCustom: z.boolean().default(false),
    noImageSupport: z.boolean().optional(),
    supportsPDFs: z.boolean().optional(),
    tier: z.string().optional(),
    tokenMultiplier: z.number().optional(),
    promoLabel: z.string().optional(),
    featureFlag: JsonObjectSchema.optional(),
    usesUSBasedInference: z.boolean().optional(),
  })
  .passthrough();

export type AvailableModelConfig = z.infer<typeof AvailableModelConfigSchema>;

export const TokenUsageSchema = z
  .object({
    inputTokens: z.number(),
    outputTokens: z.number(),
    cacheCreationTokens: z.number(),
    cacheReadTokens: z.number(),
    thinkingTokens: z.number(),
  })
  .passthrough();

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/** Current context window utilization for the active session. */
export const ContextStatsSchema = z
  .object({
    used: z.number(),
    remaining: z.number(),
    limit: z.number(),
    accuracy: z.nativeEnum(ContextStatsAccuracy),
    updatedAt: z.string(),
  })
  .passthrough();

export type ContextStats = z.infer<typeof ContextStatsSchema>;

export const WorkerStateInfoSchema = z
  .object({
    startedAt: z.string(),
    completedAt: z.string().optional(),
    exitCode: z.number().optional(),
  })
  .passthrough();

export type WorkerStateInfo = z.infer<typeof WorkerStateInfoSchema>;

export const SkillResourceSchema = z
  .object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['reference', 'asset']),
  })
  .passthrough();

export type SkillResource = z.infer<typeof SkillResourceSchema>;

export const SkillInfoSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
    location: z.nativeEnum(SkillLocation),
    filePath: z.string(),
    enabled: z.boolean().optional(),
    userInvocable: z.boolean().optional(),
    version: z.string().optional(),
    content: z.string().optional(),
    resources: z.array(SkillResourceSchema).optional(),
  })
  .passthrough();

export type SkillInfo = z.infer<typeof SkillInfoSchema>;

export const InitializeSessionRequestParamsSchema = z
  .object({
    machineId: z.string(),
    cwd: z.string(),
    workspaceId: z.string().optional(),
    sessionId: z.string().optional(),
    mcpServers: z.array(McpServerConfigSchema).optional(),
    ...SessionModeRequestFieldsShape,
    reasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    specModeModelId: z.string().optional(),
    specModeReasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    decompSessionType: z.nativeEnum(DecompSessionType).optional(),
    decompMissionId: z.string().optional(),
    skipPermissionsUnsafe: z.boolean().optional(),
    ...ToolSelectionOverridesSchema.shape,
    sessionLocation: z.string().optional(),
    sessionSource: SessionSourceSchema.optional(),
    tags: z.array(SessionTagSchema).optional(),
    mcpOAuthCallbackUri: z.string().optional(),
  })
  .strict();

export type InitializeSessionRequestParams = z.infer<
  typeof InitializeSessionRequestParamsSchema
>;

export const LoadSessionRequestParamsSchema = z
  .object({
    sessionId: z.string(),
    mcpServers: z.array(McpServerConfigSchema).optional(),
    mcpOAuthCallbackUri: z.string().optional(),
  })
  .strict();

export type LoadSessionRequestParams = z.infer<
  typeof LoadSessionRequestParamsSchema
>;

export const OutputFormatType = {
  JsonSchema: 'json_schema',
} as const;

export type OutputFormatType =
  (typeof OutputFormatType)[keyof typeof OutputFormatType];

export const OutputFormatSchema = z
  .object({
    type: z.literal(OutputFormatType.JsonSchema),
    schema: JsonObjectSchema,
  })
  .strict();

export type OutputFormat = z.infer<typeof OutputFormatSchema>;

export const AddUserMessageRequestParamsSchema = z
  .object({
    messageId: z.string().optional(),
    text: z.string(),
    images: z.array(Base64ImageSourceSchema).optional(),
    files: z.array(DocumentSourceSchema).optional(),
    outputFormat: OutputFormatSchema.optional(),
  })
  .strict();

export type AddUserMessageRequestParams = z.infer<
  typeof AddUserMessageRequestParamsSchema
>;

export const InterruptSessionRequestParamsSchema = z.object({}).strict();

export type InterruptSessionRequestParams = z.infer<
  typeof InterruptSessionRequestParamsSchema
>;

export const CloseSessionRequestParamsSchema = z
  .object({
    reason: z
      .enum(['clear', 'logout', 'prompt_input_exit', 'other'])
      .optional(),
  })
  .strict();

export type CloseSessionRequestParams = z.infer<
  typeof CloseSessionRequestParamsSchema
>;

export const KillWorkerSessionRequestParamsSchema = z
  .object({
    workerSessionId: z.string(),
  })
  .strict();

export type KillWorkerSessionRequestParams = z.infer<
  typeof KillWorkerSessionRequestParamsSchema
>;

export const UpdateSessionSettingsRequestParamsSchema = z
  .object({
    ...SessionModeRequestFieldsShape,
    reasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    specModeModelId: z.string().nullable().optional(),
    specModeReasoningEffort: z
      .nativeEnum(ReasoningEffort)
      .nullable()
      .optional(),
    ...ToolSelectionOverridesSchema.shape,
  })
  .strict();

export type UpdateSessionSettingsRequestParams = z.infer<
  typeof UpdateSessionSettingsRequestParamsSchema
>;

export const ToggleMcpServerRequestParamsSchema = z
  .object({
    serverName: z.string(),
    enabled: z.boolean(),
    settingsLevel: z.literal(SettingsLevel.User),
  })
  .strict();

export type ToggleMcpServerRequestParams = z.infer<
  typeof ToggleMcpServerRequestParamsSchema
>;

export const AuthenticateMcpServerRequestParamsSchema = z
  .object({
    serverName: z.string(),
  })
  .strict();

export type AuthenticateMcpServerRequestParams = z.infer<
  typeof AuthenticateMcpServerRequestParamsSchema
>;

export const CancelMcpAuthRequestParamsSchema = z
  .object({
    serverName: z.string(),
  })
  .strict();

export type CancelMcpAuthRequestParams = z.infer<
  typeof CancelMcpAuthRequestParamsSchema
>;

export const ClearMcpAuthRequestParamsSchema = z
  .object({
    serverName: z.string(),
  })
  .strict();

export type ClearMcpAuthRequestParams = z.infer<
  typeof ClearMcpAuthRequestParamsSchema
>;

export const SubmitMcpAuthCodeRequestParamsSchema = z
  .object({
    serverName: z.string(),
    code: z.string(),
    state: z.string(),
  })
  .strict();

export type SubmitMcpAuthCodeRequestParams = z.infer<
  typeof SubmitMcpAuthCodeRequestParamsSchema
>;

export const AddMcpServerRequestParamsSchema = z
  .object({
    name: z.string(),
    type: z.nativeEnum(McpServerType),
    url: z.string().optional(),
    headers: z.record(z.string()).optional(),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
  })
  .strict();

export type AddMcpServerRequestParams = z.infer<
  typeof AddMcpServerRequestParamsSchema
>;

export const RemoveMcpServerRequestParamsSchema = z
  .object({
    serverName: z.string(),
    settingsLevel: z.literal(SettingsLevel.User),
  })
  .strict();

export type RemoveMcpServerRequestParams = z.infer<
  typeof RemoveMcpServerRequestParamsSchema
>;

export const ListMcpRegistryRequestParamsSchema = z.object({}).strict();

export type ListMcpRegistryRequestParams = z.infer<
  typeof ListMcpRegistryRequestParamsSchema
>;

export const ListMcpToolsRequestParamsSchema = z.object({}).strict();

export type ListMcpToolsRequestParams = z.infer<
  typeof ListMcpToolsRequestParamsSchema
>;

export const ExecToolInfoSchema = z
  .object({
    id: z.string(),
    llmId: z.string(),
    displayName: z.string(),
    description: z.string(),
    category: z.enum(['read', 'edit', 'execute', 'other']),
    defaultAllowed: z.boolean(),
    currentlyAllowed: z.boolean(),
  })
  .passthrough();

export type ExecToolInfo = z.infer<typeof ExecToolInfoSchema>;

export const ListToolsRequestParamsSchema = z
  .object({
    ...SessionModeRequestFieldsShape,
    specModeModelId: z.string().nullable().optional(),
    skipPermissionsUnsafe: z.boolean().optional(),
    ...ToolSelectionOverridesSchema.shape,
    depth: z.number().int().min(0).optional(),
  })
  .strict();

export type ListToolsRequestParams = z.infer<
  typeof ListToolsRequestParamsSchema
>;

export const ListMcpServersRequestParamsSchema = z.object({}).strict();

export type ListMcpServersRequestParams = z.infer<
  typeof ListMcpServersRequestParamsSchema
>;

export const ToggleMcpToolRequestParamsSchema = z
  .object({
    serverName: z.string(),
    toolName: z.string(),
    enabled: z.boolean(),
  })
  .strict();

export type ToggleMcpToolRequestParams = z.infer<
  typeof ToggleMcpToolRequestParamsSchema
>;

export const ListSkillsRequestParamsSchema = z.object({}).strict();

export type ListSkillsRequestParams = z.infer<
  typeof ListSkillsRequestParamsSchema
>;

export const SubmitBugReportRequestParamsSchema = z
  .object({
    userComment: z.string(),
    clientLogs: z.string().optional(),
  })
  .strict();

export type SubmitBugReportRequestParams = z.infer<
  typeof SubmitBugReportRequestParamsSchema
>;

export const RewindFileSnapshotSchema = z
  .object({
    filePath: z.string(),
    contentHash: z.string(),
    size: z.number(),
  })
  .passthrough();

export type RewindFileSnapshot = z.infer<typeof RewindFileSnapshotSchema>;

export const RewindFileCreationSchema = z
  .object({
    filePath: z.string(),
  })
  .passthrough();

export type RewindFileCreation = z.infer<typeof RewindFileCreationSchema>;

export const RewindEvictedFileSchema = z
  .object({
    filePath: z.string(),
    reason: z.string(),
  })
  .passthrough();

export type RewindEvictedFile = z.infer<typeof RewindEvictedFileSchema>;

export const GetRewindInfoRequestParamsSchema = z
  .object({
    messageId: z.string(),
  })
  .passthrough();

export type GetRewindInfoRequestParams = z.infer<
  typeof GetRewindInfoRequestParamsSchema
>;

export const ExecuteRewindRequestParamsSchema = z
  .object({
    messageId: z.string(),
    filesToRestore: z.array(RewindFileSnapshotSchema),
    filesToDelete: z.array(RewindFileCreationSchema),
    forkTitle: z.string(),
  })
  .passthrough();

export type ExecuteRewindRequestParams = z.infer<
  typeof ExecuteRewindRequestParamsSchema
>;

export const CompactSessionRequestParamsSchema = z
  .object({
    customInstructions: z.string().optional(),
  })
  .passthrough();

export type CompactSessionRequestParams = z.infer<
  typeof CompactSessionRequestParamsSchema
>;

export const RenameSessionRequestParamsSchema = z
  .object({
    title: z.string(),
  })
  .passthrough();

export type RenameSessionRequestParams = z.infer<
  typeof RenameSessionRequestParamsSchema
>;

export const ForkSessionRequestParamsSchema = z.object({}).passthrough();

export type ForkSessionRequestParams = z.infer<
  typeof ForkSessionRequestParamsSchema
>;

export const GetContextStatsRequestParamsSchema = z.object({}).passthrough();

export type GetContextStatsRequestParams = z.infer<
  typeof GetContextStatsRequestParamsSchema
>;

export const InitializeSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.INITIALIZE_SESSION),
  params: InitializeSessionRequestParamsSchema,
});

export type InitializeSessionRequest = z.infer<
  typeof InitializeSessionRequestSchema
>;

export const LoadSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.LOAD_SESSION),
  params: LoadSessionRequestParamsSchema,
});

export type LoadSessionRequest = z.infer<typeof LoadSessionRequestSchema>;

export const AddUserMessageRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.ADD_USER_MESSAGE),
  params: AddUserMessageRequestParamsSchema,
});

export type AddUserMessageRequest = z.infer<typeof AddUserMessageRequestSchema>;

export const InterruptSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.INTERRUPT_SESSION),
  params: InterruptSessionRequestParamsSchema,
});

export type InterruptSessionRequest = z.infer<
  typeof InterruptSessionRequestSchema
>;

export const CloseSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.CLOSE_SESSION),
  params: CloseSessionRequestParamsSchema,
});

export type CloseSessionRequest = z.infer<typeof CloseSessionRequestSchema>;

export const KillWorkerSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.KILL_WORKER_SESSION),
  params: KillWorkerSessionRequestParamsSchema,
});

export type KillWorkerSessionRequest = z.infer<
  typeof KillWorkerSessionRequestSchema
>;

export const UpdateSessionSettingsRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.UPDATE_SESSION_SETTINGS),
  params: UpdateSessionSettingsRequestParamsSchema,
});

export type UpdateSessionSettingsRequest = z.infer<
  typeof UpdateSessionSettingsRequestSchema
>;

export const ToggleMcpServerRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.TOGGLE_MCP_SERVER),
  params: ToggleMcpServerRequestParamsSchema,
});

export type ToggleMcpServerRequest = z.infer<
  typeof ToggleMcpServerRequestSchema
>;

export const AuthenticateMcpServerRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.AUTHENTICATE_MCP_SERVER),
  params: AuthenticateMcpServerRequestParamsSchema,
});

export type AuthenticateMcpServerRequest = z.infer<
  typeof AuthenticateMcpServerRequestSchema
>;

export const CancelMcpAuthRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.CANCEL_MCP_AUTH),
  params: CancelMcpAuthRequestParamsSchema,
});

export type CancelMcpAuthRequest = z.infer<typeof CancelMcpAuthRequestSchema>;

export const ClearMcpAuthRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.CLEAR_MCP_AUTH),
  params: ClearMcpAuthRequestParamsSchema,
});

export type ClearMcpAuthRequest = z.infer<typeof ClearMcpAuthRequestSchema>;

export const SubmitMcpAuthCodeRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.SUBMIT_MCP_AUTH_CODE),
  params: SubmitMcpAuthCodeRequestParamsSchema,
});

export type SubmitMcpAuthCodeRequest = z.infer<
  typeof SubmitMcpAuthCodeRequestSchema
>;

export const AddMcpServerRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.ADD_MCP_SERVER),
  params: AddMcpServerRequestParamsSchema,
});

export type AddMcpServerRequest = z.infer<typeof AddMcpServerRequestSchema>;

export const RemoveMcpServerRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.REMOVE_MCP_SERVER),
  params: RemoveMcpServerRequestParamsSchema,
});

export type RemoveMcpServerRequest = z.infer<
  typeof RemoveMcpServerRequestSchema
>;

export const ListMcpRegistryRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.LIST_MCP_REGISTRY),
  params: ListMcpRegistryRequestParamsSchema,
});

export type ListMcpRegistryRequest = z.infer<
  typeof ListMcpRegistryRequestSchema
>;

export const ListMcpToolsRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.LIST_MCP_TOOLS),
  params: ListMcpToolsRequestParamsSchema,
});

export type ListMcpToolsRequest = z.infer<typeof ListMcpToolsRequestSchema>;

export const ListToolsRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.LIST_TOOLS),
  params: ListToolsRequestParamsSchema,
});

export type ListToolsRequest = z.infer<typeof ListToolsRequestSchema>;

export const ListMcpServersRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.LIST_MCP_SERVERS),
  params: ListMcpServersRequestParamsSchema,
});

export type ListMcpServersRequest = z.infer<typeof ListMcpServersRequestSchema>;

export const ToggleMcpToolRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.TOGGLE_MCP_TOOL),
  params: ToggleMcpToolRequestParamsSchema,
});

export type ToggleMcpToolRequest = z.infer<typeof ToggleMcpToolRequestSchema>;

export const ListSkillsRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.LIST_SKILLS),
  params: ListSkillsRequestParamsSchema,
});

export type ListSkillsRequest = z.infer<typeof ListSkillsRequestSchema>;

export const SubmitBugReportRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.SUBMIT_BUG_REPORT),
  params: SubmitBugReportRequestParamsSchema,
});

export type SubmitBugReportRequest = z.infer<
  typeof SubmitBugReportRequestSchema
>;

export const GetRewindInfoRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.GET_REWIND_INFO),
  params: GetRewindInfoRequestParamsSchema,
});

export type GetRewindInfoRequest = z.infer<typeof GetRewindInfoRequestSchema>;

export const ExecuteRewindRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.EXECUTE_REWIND),
  params: ExecuteRewindRequestParamsSchema,
});

export type ExecuteRewindRequest = z.infer<typeof ExecuteRewindRequestSchema>;

export const CompactSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.COMPACT_SESSION),
  params: CompactSessionRequestParamsSchema,
});

export type CompactSessionRequest = z.infer<typeof CompactSessionRequestSchema>;

export const ForkSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.FORK_SESSION),
  params: ForkSessionRequestParamsSchema,
});

export type ForkSessionRequest = z.infer<typeof ForkSessionRequestSchema>;

export const GetContextStatsRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.GET_CONTEXT_STATS),
  params: GetContextStatsRequestParamsSchema,
});

export type GetContextStatsRequest = z.infer<
  typeof GetContextStatsRequestSchema
>;

export const RenameSessionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidServerMethod.RENAME_SESSION),
  params: RenameSessionRequestParamsSchema,
});

export type RenameSessionRequest = z.infer<typeof RenameSessionRequestSchema>;

/** Discriminated union over all client→server request types. */
export const ClientRequestSchema = z.discriminatedUnion('method', [
  InitializeSessionRequestSchema,
  LoadSessionRequestSchema,
  AddUserMessageRequestSchema,
  CloseSessionRequestSchema,
  InterruptSessionRequestSchema,
  KillWorkerSessionRequestSchema,
  UpdateSessionSettingsRequestSchema,
  ToggleMcpServerRequestSchema,
  AuthenticateMcpServerRequestSchema,
  CancelMcpAuthRequestSchema,
  ClearMcpAuthRequestSchema,
  SubmitMcpAuthCodeRequestSchema,
  AddMcpServerRequestSchema,
  RemoveMcpServerRequestSchema,
  ListMcpRegistryRequestSchema,
  ListMcpToolsRequestSchema,
  ListToolsRequestSchema,
  ListMcpServersRequestSchema,
  ToggleMcpToolRequestSchema,
  ListSkillsRequestSchema,
  SubmitBugReportRequestSchema,
  GetRewindInfoRequestSchema,
  ExecuteRewindRequestSchema,
  CompactSessionRequestSchema,
  ForkSessionRequestSchema,
  GetContextStatsRequestSchema,
  RenameSessionRequestSchema,
]);

export type ClientRequest = z.infer<typeof ClientRequestSchema>;

export const MissionSnapshotSchema = z
  .object({
    state: z.nativeEnum(MissionState),
    features: z.array(MissionFeatureSchema),
    progressLog: z.array(ProgressLogEntrySchema),
    workerSessionIds: z.array(z.string()),
    workerStates: z.record(WorkerStateInfoSchema).optional(),
    tokenUsage: TokenUsageSchema.optional(),
    tokenUsageBySessionId: z.record(TokenUsageSchema).optional(),
  })
  .passthrough();

export type MissionSnapshot = z.infer<typeof MissionSnapshotSchema>;

export const InitializeSessionResultSchema = z
  .object({
    sessionId: z.string(),
    session: JsonObjectSchema,
    mcpServers: z.array(McpServerConfigSchema).optional(),
    settings: SessionSettingsSchema,
    gitRepo: GitRepoInfoSchema.optional(),
    availableModels: z.array(AvailableModelConfigSchema).optional(),
  })
  .passthrough();

export type InitializeSessionResult = z.infer<
  typeof InitializeSessionResultSchema
>;

export const LoadSessionResultSchema = z
  .object({
    session: JsonObjectSchema,
    mcpServers: z.array(McpServerConfigSchema).optional(),
    pendingPermissions: z.array(JsonObjectSchema).optional(),
    pendingAskUserRequests: z.array(JsonObjectSchema).optional(),
    settings: SessionSettingsSchema,
    isAgentLoopInProgress: z.boolean().optional(),
    queuedMessages: z.array(JsonObjectSchema).optional(),
    gitRepo: GitRepoInfoSchema.optional(),
    cwd: z.string().optional(),
    callingSessionId: z.string().optional(),
    callingToolUseId: z.string().optional(),
    availableModels: z.array(AvailableModelConfigSchema).optional(),
    tokenUsage: TokenUsageSchema.optional(),
    mission: MissionSnapshotSchema.optional(),
    decompSessionType: z.nativeEnum(DecompSessionType).optional(),
  })
  .passthrough();

export type LoadSessionResult = z.infer<typeof LoadSessionResultSchema>;

export const AddUserMessageResultSchema = EmptyResultSchema;

export type AddUserMessageResult = z.infer<typeof AddUserMessageResultSchema>;

export const InterruptSessionResultSchema = EmptyResultSchema;

export type InterruptSessionResult = z.infer<
  typeof InterruptSessionResultSchema
>;

export const CloseSessionResultSchema = EmptyResultSchema;

export type CloseSessionResult = z.infer<typeof CloseSessionResultSchema>;

export const KillWorkerSessionResultSchema = EmptyResultSchema;

export type KillWorkerSessionResult = z.infer<
  typeof KillWorkerSessionResultSchema
>;

export const UpdateSessionSettingsResultSchema = EmptyResultSchema;

export type UpdateSessionSettingsResult = z.infer<
  typeof UpdateSessionSettingsResultSchema
>;

export const ToggleMcpServerResultSchema = SuccessResultSchema;

export type ToggleMcpServerResult = z.infer<typeof ToggleMcpServerResultSchema>;

export const AuthenticateMcpServerResultSchema = SuccessResultSchema;

export type AuthenticateMcpServerResult = z.infer<
  typeof AuthenticateMcpServerResultSchema
>;

export const CancelMcpAuthResultSchema = SuccessResultSchema;

export type CancelMcpAuthResult = z.infer<typeof CancelMcpAuthResultSchema>;

export const ClearMcpAuthResultSchema = SuccessResultSchema;

export type ClearMcpAuthResult = z.infer<typeof ClearMcpAuthResultSchema>;

export const SubmitMcpAuthCodeResultSchema = SuccessResultSchema;

export type SubmitMcpAuthCodeResult = z.infer<
  typeof SubmitMcpAuthCodeResultSchema
>;

export const AddMcpServerResultSchema = SuccessResultSchema;

export type AddMcpServerResult = z.infer<typeof AddMcpServerResultSchema>;

export const RemoveMcpServerResultSchema = SuccessResultSchema;

export type RemoveMcpServerResult = z.infer<typeof RemoveMcpServerResultSchema>;

export const ListMcpRegistryResultSchema = z
  .object({ servers: z.array(McpRegistryServerSchema) })
  .passthrough();

export type ListMcpRegistryResult = z.infer<typeof ListMcpRegistryResultSchema>;

export const ListMcpToolsResultSchema = z
  .object({ tools: z.array(McpToolInfoSchema) })
  .passthrough();

export type ListMcpToolsResult = z.infer<typeof ListMcpToolsResultSchema>;

export const ListToolsResultSchema = z
  .object({ tools: z.array(ExecToolInfoSchema) })
  .passthrough();

export type ListToolsResult = z.infer<typeof ListToolsResultSchema>;

export const ListMcpServersResultSchema = z
  .object({
    servers: z.array(McpServerStatusInfoSchema),
    summary: McpStatusSummarySchema,
  })
  .passthrough();

export type ListMcpServersResult = z.infer<typeof ListMcpServersResultSchema>;

export const ToggleMcpToolResultSchema = SuccessResultSchema;

export type ToggleMcpToolResult = z.infer<typeof ToggleMcpToolResultSchema>;

export const ListSkillsResultSchema = z
  .object({ skills: z.array(SkillInfoSchema) })
  .passthrough();

export type ListSkillsResult = z.infer<typeof ListSkillsResultSchema>;

export const SubmitBugReportResultSchema = z
  .object({ bugReportId: z.string() })
  .passthrough();

export type SubmitBugReportResult = z.infer<typeof SubmitBugReportResultSchema>;

export const GetRewindInfoResultSchema = z
  .object({
    availableFiles: z.array(RewindFileSnapshotSchema),
    createdFiles: z.array(RewindFileCreationSchema),
    evictedFiles: z.array(RewindEvictedFileSchema),
  })
  .passthrough();

export type GetRewindInfoResult = z.infer<typeof GetRewindInfoResultSchema>;

export const ExecuteRewindResultSchema = z
  .object({
    newSessionId: z.string(),
    restoredCount: z.number(),
    deletedCount: z.number(),
    failedRestoreCount: z.number(),
    failedDeleteCount: z.number(),
  })
  .passthrough();

export type ExecuteRewindResult = z.infer<typeof ExecuteRewindResultSchema>;

export const CompactSessionResultSchema = z
  .object({
    newSessionId: z.string(),
    removedCount: z.number(),
  })
  .passthrough();

export type CompactSessionResult = z.infer<typeof CompactSessionResultSchema>;

export const ForkSessionResultSchema = z
  .object({
    newSessionId: z.string(),
  })
  .passthrough();

export type ForkSessionResult = z.infer<typeof ForkSessionResultSchema>;

export const GetContextStatsResultSchema = ContextStatsSchema;

export type GetContextStatsResult = z.infer<typeof GetContextStatsResultSchema>;

export const ContextBreakdownCategorySchema = z
  .object({
    name: z.string(),
    tokens: z.number(),
    colorKey: z.string(),
  })
  .passthrough();

export const ContextBreakdownResultSchema = z
  .object({
    modelId: z.string(),
    modelDisplayName: z.string(),
    contextBudget: z.number(),
    usedTokens: z.number(),
    freeTokens: z.number(),
    categories: z.array(ContextBreakdownCategorySchema),
  })
  .passthrough();

export type ContextBreakdownResult = z.infer<
  typeof ContextBreakdownResultSchema
>;

export const RenameSessionResultSchema = SuccessResultSchema;

export type RenameSessionResult = z.infer<typeof RenameSessionResultSchema>;

export const InitializeSessionResponseSchema = createResponseSchema(
  InitializeSessionResultSchema
);
export type InitializeSessionResponse = z.infer<
  typeof InitializeSessionResponseSchema
>;

/** Concrete type for LoadSessionResponse (avoids TS7056 deep inference). */
export type LoadSessionResponse =
  | (Omit<z.infer<typeof JsonRpcResponseSuccessSchema>, 'result'> & {
      result: LoadSessionResult;
    })
  | JsonRpcResponseFailure;

const _LoadSessionResponseSchema = createResponseSchema(
  LoadSessionResultSchema
);

export const LoadSessionResponseSchema: z.ZodType<
  LoadSessionResponse,
  z.ZodTypeDef,
  unknown
> = _LoadSessionResponseSchema as z.ZodType<
  LoadSessionResponse,
  z.ZodTypeDef,
  unknown
>;

export const AddUserMessageResponseSchema = createResponseSchema(
  AddUserMessageResultSchema
);
export type AddUserMessageResponse = z.infer<
  typeof AddUserMessageResponseSchema
>;

export const InterruptSessionResponseSchema = createResponseSchema(
  InterruptSessionResultSchema
);
export type InterruptSessionResponse = z.infer<
  typeof InterruptSessionResponseSchema
>;

export const CloseSessionResponseSchema = createResponseSchema(
  CloseSessionResultSchema
);
export type CloseSessionResponse = z.infer<typeof CloseSessionResponseSchema>;

export const KillWorkerSessionResponseSchema = createResponseSchema(
  KillWorkerSessionResultSchema
);
export type KillWorkerSessionResponse = z.infer<
  typeof KillWorkerSessionResponseSchema
>;

export const UpdateSessionSettingsResponseSchema = createResponseSchema(
  UpdateSessionSettingsResultSchema
);
export type UpdateSessionSettingsResponse = z.infer<
  typeof UpdateSessionSettingsResponseSchema
>;

export const ToggleMcpServerResponseSchema = createResponseSchema(
  ToggleMcpServerResultSchema
);
export type ToggleMcpServerResponse = z.infer<
  typeof ToggleMcpServerResponseSchema
>;

export const AuthenticateMcpServerResponseSchema = createResponseSchema(
  AuthenticateMcpServerResultSchema
);
export type AuthenticateMcpServerResponse = z.infer<
  typeof AuthenticateMcpServerResponseSchema
>;

export const CancelMcpAuthResponseSchema = createResponseSchema(
  CancelMcpAuthResultSchema
);
export type CancelMcpAuthResponse = z.infer<typeof CancelMcpAuthResponseSchema>;

export const ClearMcpAuthResponseSchema = createResponseSchema(
  ClearMcpAuthResultSchema
);
export type ClearMcpAuthResponse = z.infer<typeof ClearMcpAuthResponseSchema>;

export const SubmitMcpAuthCodeResponseSchema = createResponseSchema(
  SubmitMcpAuthCodeResultSchema
);
export type SubmitMcpAuthCodeResponse = z.infer<
  typeof SubmitMcpAuthCodeResponseSchema
>;

export const AddMcpServerResponseSchema = createResponseSchema(
  AddMcpServerResultSchema
);
export type AddMcpServerResponse = z.infer<typeof AddMcpServerResponseSchema>;

export const RemoveMcpServerResponseSchema = createResponseSchema(
  RemoveMcpServerResultSchema
);
export type RemoveMcpServerResponse = z.infer<
  typeof RemoveMcpServerResponseSchema
>;

export const ListMcpRegistryResponseSchema = createResponseSchema(
  ListMcpRegistryResultSchema
);
export type ListMcpRegistryResponse = z.infer<
  typeof ListMcpRegistryResponseSchema
>;

export const ListMcpToolsResponseSchema = createResponseSchema(
  ListMcpToolsResultSchema
);
export type ListMcpToolsResponse = z.infer<typeof ListMcpToolsResponseSchema>;

export const ListToolsResponseSchema = createResponseSchema(
  ListToolsResultSchema
);
export type ListToolsResponse = z.infer<typeof ListToolsResponseSchema>;

export const ListMcpServersResponseSchema = createResponseSchema(
  ListMcpServersResultSchema
);
export type ListMcpServersResponse = z.infer<
  typeof ListMcpServersResponseSchema
>;

export const ToggleMcpToolResponseSchema = createResponseSchema(
  ToggleMcpToolResultSchema
);
export type ToggleMcpToolResponse = z.infer<typeof ToggleMcpToolResponseSchema>;

export const ListSkillsResponseSchema = createResponseSchema(
  ListSkillsResultSchema
);
export type ListSkillsResponse = z.infer<typeof ListSkillsResponseSchema>;

export const SubmitBugReportResponseSchema = createResponseSchema(
  SubmitBugReportResultSchema
);
export type SubmitBugReportResponse = z.infer<
  typeof SubmitBugReportResponseSchema
>;

export const GetRewindInfoResponseSchema = createResponseSchema(
  GetRewindInfoResultSchema
);
export type GetRewindInfoResponse = z.infer<typeof GetRewindInfoResponseSchema>;

export const ExecuteRewindResponseSchema = createResponseSchema(
  ExecuteRewindResultSchema
);
export type ExecuteRewindResponse = z.infer<typeof ExecuteRewindResponseSchema>;

export const CompactSessionResponseSchema = createResponseSchema(
  CompactSessionResultSchema
);
export type CompactSessionResponse = z.infer<
  typeof CompactSessionResponseSchema
>;

export const ForkSessionResponseSchema = createResponseSchema(
  ForkSessionResultSchema
);
export type ForkSessionResponse = z.infer<typeof ForkSessionResponseSchema>;

export const GetContextStatsResponseSchema = createResponseSchema(
  GetContextStatsResultSchema
);
export type GetContextStatsResponse = z.infer<
  typeof GetContextStatsResponseSchema
>;

export const RenameSessionResponseSchema = createResponseSchema(
  RenameSessionResultSchema
);
export type RenameSessionResponse = z.infer<typeof RenameSessionResponseSchema>;
