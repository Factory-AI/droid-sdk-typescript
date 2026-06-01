// Source-of-truth mirror of factory-mono-alpha CLI protocol schemas.
// Verbatim copy of packages/common/src/droid/schemas/cli.ts.

import { z } from 'zod';

import { SandboxModeSchema } from './custom-models.js';
import {
  AutonomyLevel,
  AutonomyMode,
  DroidClientMethod,
  DroidErrorType,
  DroidWorkingState,
  McpAuthOutcome,
  MissionState,
  ReasoningEffort,
  SandboxOperationType,
  SandboxViolationReason,
  SandboxViolationType,
  SessionNotificationType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from './enums.js';
import {
  DroidInteractionModeSchema,
  JsonRpcBaseNotificationSchema,
  JsonRpcBaseRequestSchema,
  JsonRpcBaseResponseFailureSchema,
  JsonRpcBaseResponseSuccessSchema,
  JsonRpcEnvelopeSchema,
} from './json-rpc.js';
import { LoopStateSchema } from './loop.js';
import { McpServerStatusInfoSchema, McpStatusSummarySchema } from './mcp.js';
import {
  FactoryDroidMessageSchema,
  ToolResultSchema,
  ToolUseSchema,
} from './messages.js';
import {
  MissionFeatureSchema,
  ProgressLogEntrySchema,
} from './mission-decomposition.js';
import { MissionModelSettingsSchema } from './model-settings.js';
import { ToolConfirmationListItemSchema } from './selectable-list-item.js';
import { TokenUsageSchema } from './session.js';

const ToolResultNotificationSchema = ToolResultSchema.extend({
  type: z.literal(SessionNotificationType.TOOL_RESULT),
  messageId: z.string(),
});

// Schema for streaming updates from subagent tool calls
export const ToolProgressUpdateSchema = z.object({
  type: z.enum(['tool_call', 'tool_result', 'error', 'status', 'message']),
  toolName: z.string().optional(),
  status: z.string().optional(),
  details: z.string().optional(),
  text: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.number().optional(),
  parameters: z.record(z.unknown()).optional(),
  valueSnippet: z.string().optional(),
  terminalId: z.string().optional(),
  fullOutput: z.string().optional(),
  /** The session ID of the spawned subagent, parsed from a system/init debug event */
  subagentSessionId: z.string().optional(),
});

const ToolProgressUpdateNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.TOOL_PROGRESS_UPDATE),
  toolUseId: z.string(),
  toolName: z.string(),
  update: ToolProgressUpdateSchema,
});

const CreateMessageNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.CREATE_MESSAGE),
  message: FactoryDroidMessageSchema,
  parentId: z.string().optional(),
  requestId: z.string().optional(),
});

const ErrorNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.ERROR),
  message: z.string(),
  errorType: z.nativeEnum(DroidErrorType),
  timestamp: z.string(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
    })
    .optional(),
});

const DroidWorkingStateChangedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.DROID_WORKING_STATE_CHANGED),
  newState: z.nativeEnum(DroidWorkingState),
});

export const SessionCompactedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.SESSION_COMPACTED),
  summaryId: z.string(),
  removedCount: z.number().nonnegative(),
  visibleBoundaryMessageId: z.string().nullable(),
});

export const LoopStateChangedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.LOOP_STATE_CHANGED),
  loopState: LoopStateSchema,
});

const PermissionResolvedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.PERMISSION_RESOLVED),
  requestId: z.string(),
  toolUseIds: z.array(z.string()), // Array to match batched permission requests
  selectedOption: z.nativeEnum(ToolConfirmationOutcome),
});

const SettingsUpdatedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.SETTINGS_UPDATED),
  requestId: z.string().optional(),
  settings: z.object({
    autonomyMode: z
      .nativeEnum(AutonomyMode)
      .optional()
      .describe('Deprecated: use interactionMode + autonomyLevel instead.'),
    interactionMode: DroidInteractionModeSchema.optional().catch(undefined),
    autonomyLevel: z.nativeEnum(AutonomyLevel).optional().catch(undefined),
    modelId: z.string().optional(),
    reasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    specModeModelId: z.string().optional(),
    specModeReasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    enabledToolIds: z.array(z.string()).optional(),
    disabledToolIds: z.array(z.string()).optional(),
    missionSettings: MissionModelSettingsSchema.optional(),
    compactionThresholdCheckEnabled: z.boolean().optional(),
  }),
});

const SessionTitleUpdatedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.SESSION_TITLE_UPDATED),
  requestId: z.string().optional(),
  title: z.string(),
});

const McpStatusChangedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MCP_STATUS_CHANGED),
  servers: z.array(McpServerStatusInfoSchema),
  summary: McpStatusSummarySchema,
});

const AssistantTextDeltaNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.ASSISTANT_TEXT_DELTA),
  messageId: z.string(),
  blockIndex: z.number(),
  textDelta: z.string(),
});

const AssistantTextCompleteNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.ASSISTANT_TEXT_COMPLETE),
  messageId: z.string(),
  blockIndex: z.number(),
});

const StructuredOutputNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.STRUCTURED_OUTPUT),
  messageId: z.string(),
  structuredOutput: z.record(z.unknown()).nullable(),
});

const ThinkingTextDeltaNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.THINKING_TEXT_DELTA),
  messageId: z.string(),
  blockIndex: z.number(),
  textDelta: z.string(),
});

const ThinkingTextCompleteNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.THINKING_TEXT_COMPLETE),
  messageId: z.string(),
  blockIndex: z.number(),
  durationMs: z.number().nonnegative().optional(),
});

export const SessionTokenUsageChangedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED),
  sessionId: z.string(),
  tokenUsage: TokenUsageSchema,
  inclusiveTokenUsage: TokenUsageSchema.optional(),
  // Latest provider-reported usage used by the compaction meter.
  lastCallTokenUsage: TokenUsageSchema.pick({
    inputTokens: true,
    cacheReadTokens: true,
  })
    .extend({
      outputTokens: TokenUsageSchema.shape.outputTokens.optional(),
    })
    .optional(),
});

// Mission notification schemas
export const MissionStateChangedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MISSION_STATE_CHANGED),
  state: z.nativeEnum(MissionState),
  updatedAt: z.string().optional(),
});

export const MissionFeaturesChangedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MISSION_FEATURES_CHANGED),
  features: z.array(MissionFeatureSchema),
});

export const MissionProgressEntryNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MISSION_PROGRESS_ENTRY),
  progressLog: z.array(ProgressLogEntrySchema),
});

export const MissionHeartbeatNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MISSION_HEARTBEAT),
  timestamp: z.string(),
});

export const MissionWorkerStartedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MISSION_WORKER_STARTED),
  workerSessionId: z.string(),
});

export const MissionWorkerCompletedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MISSION_WORKER_COMPLETED),
  workerSessionId: z.string(),
  exitCode: z.number(),
});

const McpAuthRequiredNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MCP_AUTH_REQUIRED),
  serverName: z.string(),
  authUrl: z.string(),
  message: z.string(),
  state: z.string(),
});

const McpAuthCompletedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.MCP_AUTH_COMPLETED),
  serverName: z.string(),
  outcome: z.nativeEnum(McpAuthOutcome),
  message: z.string(),
});

const HookCommandSchema = z.object({
  command: z.string(),
  timeout: z.number().optional(),
});

const HookResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  command: z.string().optional(),
  timeout: z.number().optional(),
});

export const DroidHookEventSchema = z.enum([
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'UserPromptSubmit',
  'Stop',
  'SubagentStop',
  'PreCompact',
  'SessionStart',
  'SessionEnd',
]);

const ToolCallNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.TOOL_CALL),
  toolUse: ToolUseSchema,
});

const QueuedMessagesDiscardedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.QUEUED_MESSAGES_DISCARDED),
  text: z.string(),
  requestId: z.string().optional(),
});

/**
 * Internal keep-alive notification emitted while a long-running tool
 * (e.g. Execute/pytest) is actively running without producing new streaming
 * output. Consumed by the daemon to refresh the session inactivity timeout;
 * never forwarded to external clients.
 */
const ToolExecutionHeartbeatNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.TOOL_EXECUTION_HEARTBEAT),
  toolUseId: z.string(),
  toolName: z.string(),
});

const HookExecutionStartedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.HOOK_EXECUTION_STARTED),
  hookId: z.string(),
  hookEventName: z.string(),
  hookMatcher: z.string().optional(),
  hookCommands: z.array(HookCommandSchema),
  hookToolCallId: z.string().optional(),
  isParallelExecution: z.boolean().optional(),
  parallelGroupId: z.string().optional(),
});

const HookExecutionCompletedNotificationSchema = z.object({
  type: z.literal(SessionNotificationType.HOOK_EXECUTION_COMPLETED),
  hookId: z.string(),
  hookEventName: DroidHookEventSchema.optional(),
  hookMatcher: z.string().optional(),
  hookToolCallId: z.string().optional(),
  hookStatus: z.enum(['completed', 'error']),
  hookResults: z.array(HookResultSchema).optional(),
});

export const SandboxStatusSchema = z.object({
  enabled: z.boolean(),
  mode: SandboxModeSchema.optional(),
});

export const SessionNotificationSchemaList = [
  ToolResultNotificationSchema,
  ToolProgressUpdateNotificationSchema,
  CreateMessageNotificationSchema,
  ErrorNotificationSchema,
  DroidWorkingStateChangedNotificationSchema,
  SessionCompactedNotificationSchema,
  LoopStateChangedNotificationSchema,
  PermissionResolvedNotificationSchema,
  SettingsUpdatedNotificationSchema,
  SessionTitleUpdatedNotificationSchema,
  McpStatusChangedNotificationSchema,
  AssistantTextDeltaNotificationSchema,
  AssistantTextCompleteNotificationSchema,
  StructuredOutputNotificationSchema,
  ThinkingTextDeltaNotificationSchema,
  ThinkingTextCompleteNotificationSchema,
  SessionTokenUsageChangedNotificationSchema,
  // Mission notifications
  MissionStateChangedNotificationSchema,
  MissionFeaturesChangedNotificationSchema,
  MissionProgressEntryNotificationSchema,
  MissionHeartbeatNotificationSchema,
  MissionWorkerStartedNotificationSchema,
  MissionWorkerCompletedNotificationSchema,
  McpAuthRequiredNotificationSchema,
  McpAuthCompletedNotificationSchema,
  HookExecutionStartedNotificationSchema,
  HookExecutionCompletedNotificationSchema,
  ToolCallNotificationSchema,
  QueuedMessagesDiscardedNotificationSchema,
  ToolExecutionHeartbeatNotificationSchema,
] as const;

const SessionNotificationParamsSchema = z.object({
  notification: z.discriminatedUnion('type', SessionNotificationSchemaList),
});

export const SessionNotificationSchema = JsonRpcBaseNotificationSchema.extend({
  method: z.literal(DroidClientMethod.SESSION_NOTIFICATION),
  params: SessionNotificationParamsSchema,
});

// Tool Confirmation Details schemas (matching TypeScript types in types.ts)
const EditToolConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.Edit),
  filePath: z.string(),
  fileName: z.string(),
  oldContent: z.string().optional(),
  newContent: z.string().optional(),
});

const ExecuteToolConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.Execute),
  fullCommand: z.string(),
  command: z.string(),
  extractedCommands: z.array(z.string()).optional(),
  impactLevel: z.string().optional(),
  riskLevelReason: z.string().optional(),
});

const CreateToolConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.Create),
  filePath: z.string(),
  fileName: z.string(),
  content: z.string(),
});

const AskUserConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.AskUser),
  questionnaire: z.string(),
  parsed: z
    .object({
      questions: z.array(
        z.object({
          index: z.number(),
          topic: z.string(),
          question: z.string(),
          options: z.array(z.string()),
        })
      ),
    })
    .optional(),
  parseError: z
    .object({
      message: z.string(),
      line: z.number().optional(),
    })
    .optional(),
});

const ExitSpecModeConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.ExitSpecMode),
  plan: z.string(),
  title: z.string().optional(),
});

const ProposeMissionConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.ProposeMission),
  proposal: z.string(),
  title: z.string().optional(),
});

const StartMissionRunConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.StartMissionRun),
  runningMissionCount: z.number(),
  runningMissionSessionIds: z.array(z.string()),
});

const ApplyPatchToolConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.ApplyPatch),
  filePath: z.string(),
  fileName: z.string(),
  patchContent: z.string(),
  oldContent: z.string().optional(),
  newContent: z.string().optional(),
});

const McpToolConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.McpTool),
  toolName: z.string(),
  impactLevel: z.string(),
  serverName: z.string().optional(),
  actualToolName: z.string().optional(),
});

const SandboxViolationConfirmationDetailsSchema = z.object({
  type: z.literal(ToolConfirmationType.SandboxViolation),
  violatingToolName: z.string(),
  target: z.string(),
  operationType: z.nativeEnum(SandboxOperationType),
  violationType: z.nativeEnum(SandboxViolationType),
  reason: z.string(),
  violationReason: z.nativeEnum(SandboxViolationReason).optional(),
  isOrgDeny: z.boolean(),
});

export const ToolConfirmationDetailsSchema = z.discriminatedUnion('type', [
  EditToolConfirmationDetailsSchema,
  ExecuteToolConfirmationDetailsSchema,
  CreateToolConfirmationDetailsSchema,
  AskUserConfirmationDetailsSchema,
  ExitSpecModeConfirmationDetailsSchema,
  ProposeMissionConfirmationDetailsSchema,
  StartMissionRunConfirmationDetailsSchema,
  ApplyPatchToolConfirmationDetailsSchema,
  McpToolConfirmationDetailsSchema,
  SandboxViolationConfirmationDetailsSchema,
]);

const ToolConfirmationInfoSchema = z.object({
  toolUse: ToolUseSchema,
  confirmationType: z.nativeEnum(ToolConfirmationType),
  details: ToolConfirmationDetailsSchema,
});

export const RequestPermissionRequestParamsSchema = z.object({
  toolUses: z.array(ToolConfirmationInfoSchema),
  options: z.array(ToolConfirmationListItemSchema),
});

export const RequestPermissionRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DroidClientMethod.REQUEST_PERMISSION),
  params: RequestPermissionRequestParamsSchema,
});

// ============================================================
// Ask User (multi-question user input)
// ============================================================

export const AskUserQuestionSchema = z.object({
  index: z.number(), // 1-based
  topic: z.string(),
  question: z.string(),
  options: z.array(z.string()),
});

export const AskUserRequestParamsSchema = z.object({
  /** The tool call id that initiated this AskUser request */
  toolCallId: z.string(),
  questions: z.array(AskUserQuestionSchema),
});

export const AskUserRequestSchema = JsonRpcBaseRequestSchema.extend({
  method: z.literal(DroidClientMethod.ASK_USER),
  params: AskUserRequestParamsSchema,
});

export const AskUserCollectedAnswerSchema = z.object({
  index: z.number(),
  question: z.string(),
  answer: z.string(),
});

export const AskUserResultSchema = z.object({
  /** If true, the user cancelled the questionnaire */
  cancelled: z.boolean().optional(),
  answers: z.array(AskUserCollectedAnswerSchema),
});

export const AskUserResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: AskUserResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const RequestPermissionResultSchema = z
  .object({
    selectedOption: z.nativeEnum(ToolConfirmationOutcome),
    comment: z.string().optional(),
    editedSpecContent: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.selectedOption === ToolConfirmationOutcome.ProceedEdit &&
      typeof value.editedSpecContent !== 'string'
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'editedSpecContent is required when selectedOption is proceed_edit',
        path: ['editedSpecContent'],
      });
    }
  });

export const RequestPermissionResponseSchema = z.union([
  JsonRpcBaseResponseSuccessSchema.extend({
    result: RequestPermissionResultSchema,
  }),
  JsonRpcBaseResponseFailureSchema,
]);

export const CliRequestOrNotificationSchema = JsonRpcEnvelopeSchema.and(
  z.discriminatedUnion('method', [
    SessionNotificationSchema,
    RequestPermissionRequestSchema,
    AskUserRequestSchema,
  ])
);
