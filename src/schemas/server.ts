import { z } from 'zod';

import { TokenUsageSchema } from './client.js';
import {
  AutonomyLevel,
  AutonomyMode,
  DroidClientMethod,
  DroidErrorType,
  DroidInteractionMode,
  DroidWorkingState,
  McpAuthOutcome,
  MissionState,
  ReasoningEffort,
  SessionNotificationType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from './enums.js';
import {
  McpServerStatusInfoSchema,
  McpStatusSummarySchema,
  ToolConfirmationListItemSchema,
} from './mcp.js';
import {
  FactoryDroidMessageSchema,
  ToolUseBlockSchema as MessageToolUseBlockSchema,
} from './messages.js';
import { MissionFeatureSchema, ProgressLogEntrySchema } from './mission.js';
import {
  JsonObjectSchema,
  JsonRpcNotificationSchema,
  JsonRpcRequestSchema,
  JsonRpcResponseFailureSchema,
  JsonRpcResponseSuccessSchema,
  JsonValueSchema,
  ToolSelectionOverridesSchema,
} from './shared.js';

/**
 * Tool use block — re-exports ToolUseBlockSchema from messages.ts
 * since the shape is identical (type, id, input, name, thoughtSignature).
 */
export const ToolUseBlockSchema = MessageToolUseBlockSchema;

export type ToolUseBlock = z.infer<typeof ToolUseBlockSchema>;

/** @deprecated Use ToolUseBlockSchema/ToolUseBlock for the message block shape. */
export const ToolUseSchema = ToolUseBlockSchema;

/** @deprecated Use ToolUseBlock for the message block shape. */
export type ToolUse = ToolUseBlock;

/** Error detail object within an ErrorNotification. */
export const ErrorDetailSchema = z
  .object({
    name: z.string(),
    message: z.string(),
  })
  .passthrough();

export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

/** Streaming update from subagent tool calls. */
export const ToolProgressUpdateSchema = z
  .object({
    type: z.enum(['tool_call', 'tool_result', 'error', 'status', 'message']),
    toolName: z.string().optional(),
    status: z.string().optional(),
    details: z.string().optional(),
    text: z.string().optional(),
    error: z.string().optional(),
    timestamp: z.number().optional(),
    parameters: JsonObjectSchema.optional(),
    valueSnippet: z.string().optional(),
    subagentSessionId: z.string().optional(),
  })
  .passthrough();

export type ToolProgressUpdate = z.infer<typeof ToolProgressUpdateSchema>;

/** Settings payload within SettingsUpdatedNotification. */
export const SettingsUpdatedPayloadSchema = z
  .object({
    autonomyMode: z.nativeEnum(AutonomyMode).optional(),
    interactionMode: z
      .nativeEnum(DroidInteractionMode)
      .optional()
      .catch(undefined),
    autonomyLevel: z.nativeEnum(AutonomyLevel).optional().catch(undefined),
    modelId: z.string().optional(),
    reasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    specModeModelId: z.string().optional(),
    specModeReasoningEffort: z.nativeEnum(ReasoningEffort).optional(),
    ...ToolSelectionOverridesSchema.shape,
  })
  .passthrough();

export type SettingsUpdatedPayload = z.infer<
  typeof SettingsUpdatedPayloadSchema
>;

/** Tool result notification. */
export const ToolResultNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.TOOL_RESULT),
    messageId: z.string(),
    toolUseId: z.string(),
    content: JsonValueSchema.optional(),
    isError: z.boolean().optional(),
    id: z.string().optional(),
  })
  .passthrough();

export type ToolResultNotification = z.infer<
  typeof ToolResultNotificationSchema
>;

/** Tool progress update notification. */
export const ToolProgressUpdateNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.TOOL_PROGRESS_UPDATE),
    toolUseId: z.string(),
    toolName: z.string(),
    update: ToolProgressUpdateSchema,
  })
  .passthrough();

export type ToolProgressUpdateNotification = z.infer<
  typeof ToolProgressUpdateNotificationSchema
>;

/** Create message notification. */
export const CreateMessageNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.CREATE_MESSAGE),
    message: FactoryDroidMessageSchema,
    parentId: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

export type CreateMessageNotification = z.infer<
  typeof CreateMessageNotificationSchema
>;

/** Error notification. */
export const ErrorNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.ERROR),
    message: z.string(),
    errorType: z.nativeEnum(DroidErrorType),
    timestamp: z.string(),
    error: ErrorDetailSchema.optional(),
  })
  .passthrough();

export type ErrorNotification = z.infer<typeof ErrorNotificationSchema>;

/** Droid working state changed notification. */
export const DroidWorkingStateChangedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.DROID_WORKING_STATE_CHANGED),
    newState: z.nativeEnum(DroidWorkingState),
  })
  .passthrough();

export type DroidWorkingStateChangedNotification = z.infer<
  typeof DroidWorkingStateChangedNotificationSchema
>;

/** Permission resolved notification. */
export const PermissionResolvedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.PERMISSION_RESOLVED),
    requestId: z.string(),
    toolUseIds: z.array(z.string()),
    selectedOption: z.nativeEnum(ToolConfirmationOutcome),
  })
  .passthrough();

export type PermissionResolvedNotification = z.infer<
  typeof PermissionResolvedNotificationSchema
>;

/** Settings updated notification. */
export const SettingsUpdatedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.SETTINGS_UPDATED),
    settings: SettingsUpdatedPayloadSchema,
  })
  .passthrough();

export type SettingsUpdatedNotification = z.infer<
  typeof SettingsUpdatedNotificationSchema
>;

/** Session title updated notification. */
export const SessionTitleUpdatedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.SESSION_TITLE_UPDATED),
    title: z.string(),
  })
  .passthrough();

export type SessionTitleUpdatedNotification = z.infer<
  typeof SessionTitleUpdatedNotificationSchema
>;

/** MCP status changed notification. */
export const McpStatusChangedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MCP_STATUS_CHANGED),
    servers: z.array(McpServerStatusInfoSchema),
    summary: McpStatusSummarySchema,
  })
  .passthrough();

export type McpStatusChangedNotification = z.infer<
  typeof McpStatusChangedNotificationSchema
>;

/** Assistant text delta notification (streaming token). */
export const AssistantTextDeltaNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.ASSISTANT_TEXT_DELTA),
    messageId: z.string(),
    blockIndex: z.number(),
    textDelta: z.string(),
  })
  .passthrough();

export type AssistantTextDeltaNotification = z.infer<
  typeof AssistantTextDeltaNotificationSchema
>;

/** Thinking text delta notification (streaming thinking token). */
export const ThinkingTextDeltaNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.THINKING_TEXT_DELTA),
    messageId: z.string(),
    blockIndex: z.number(),
    textDelta: z.string(),
  })
  .passthrough();

export type ThinkingTextDeltaNotification = z.infer<
  typeof ThinkingTextDeltaNotificationSchema
>;

/** Session token usage changed notification. */
export const SessionTokenUsageChangedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED),
    sessionId: z.string(),
    tokenUsage: TokenUsageSchema,
  })
  .passthrough();

export type SessionTokenUsageChangedNotification = z.infer<
  typeof SessionTokenUsageChangedNotificationSchema
>;

/** Mission state changed notification. */
export const MissionStateChangedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MISSION_STATE_CHANGED),
    state: z.nativeEnum(MissionState),
  })
  .passthrough();

export type MissionStateChangedNotification = z.infer<
  typeof MissionStateChangedNotificationSchema
>;

/** Mission features changed notification. */
export const MissionFeaturesChangedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MISSION_FEATURES_CHANGED),
    features: z.array(MissionFeatureSchema),
  })
  .passthrough();

export type MissionFeaturesChangedNotification = z.infer<
  typeof MissionFeaturesChangedNotificationSchema
>;

/** Mission progress entry notification. */
export const MissionProgressEntryNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MISSION_PROGRESS_ENTRY),
    progressLog: z.array(ProgressLogEntrySchema),
  })
  .passthrough();

export type MissionProgressEntryNotification = z.infer<
  typeof MissionProgressEntryNotificationSchema
>;

/** Mission heartbeat notification. */
export const MissionHeartbeatNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MISSION_HEARTBEAT),
    timestamp: z.string(),
  })
  .passthrough();

export type MissionHeartbeatNotification = z.infer<
  typeof MissionHeartbeatNotificationSchema
>;

/** Mission worker started notification. */
export const MissionWorkerStartedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MISSION_WORKER_STARTED),
    workerSessionId: z.string(),
  })
  .passthrough();

export type MissionWorkerStartedNotification = z.infer<
  typeof MissionWorkerStartedNotificationSchema
>;

/** Mission worker completed notification. */
export const MissionWorkerCompletedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MISSION_WORKER_COMPLETED),
    workerSessionId: z.string(),
    exitCode: z.number(),
  })
  .passthrough();

export type MissionWorkerCompletedNotification = z.infer<
  typeof MissionWorkerCompletedNotificationSchema
>;

/** MCP authentication required notification. */
export const McpAuthRequiredNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MCP_AUTH_REQUIRED),
    serverName: z.string(),
    authUrl: z.string(),
    message: z.string(),
    state: z.string(),
  })
  .passthrough();

export type McpAuthRequiredNotification = z.infer<
  typeof McpAuthRequiredNotificationSchema
>;

/** MCP authentication completed notification. */
export const McpAuthCompletedNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.MCP_AUTH_COMPLETED),
    serverName: z.string(),
    outcome: z.nativeEnum(McpAuthOutcome),
    message: z.string(),
  })
  .passthrough();

export type McpAuthCompletedNotification = z.infer<
  typeof McpAuthCompletedNotificationSchema
>;

/** Structured output validation error emitted by Droid. */
export const StructuredOutputErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  })
  .passthrough();

export type StructuredOutputError = z.infer<typeof StructuredOutputErrorSchema>;

/** Backend-validated structured output for the completed turn. */
export const StructuredOutputNotificationSchema = z
  .object({
    type: z.literal(SessionNotificationType.STRUCTURED_OUTPUT),
    messageId: z.string(),
    structuredOutput: JsonObjectSchema.nullable(),
    structuredOutputError: StructuredOutputErrorSchema.nullable(),
  })
  .passthrough();

export type StructuredOutputNotification = z.infer<
  typeof StructuredOutputNotificationSchema
>;

/** List of all session notification schemas (for discriminatedUnion). */
export const SessionNotificationSchemaList = [
  ToolResultNotificationSchema,
  ToolProgressUpdateNotificationSchema,
  CreateMessageNotificationSchema,
  ErrorNotificationSchema,
  DroidWorkingStateChangedNotificationSchema,
  PermissionResolvedNotificationSchema,
  SettingsUpdatedNotificationSchema,
  SessionTitleUpdatedNotificationSchema,
  McpStatusChangedNotificationSchema,
  AssistantTextDeltaNotificationSchema,
  ThinkingTextDeltaNotificationSchema,
  SessionTokenUsageChangedNotificationSchema,
  MissionStateChangedNotificationSchema,
  MissionFeaturesChangedNotificationSchema,
  MissionProgressEntryNotificationSchema,
  MissionHeartbeatNotificationSchema,
  MissionWorkerStartedNotificationSchema,
  MissionWorkerCompletedNotificationSchema,
  McpAuthRequiredNotificationSchema,
  McpAuthCompletedNotificationSchema,
  StructuredOutputNotificationSchema,
] as const;

/** Discriminated union over all session notification types. */
export const SessionNotificationPayloadSchema = z.discriminatedUnion(
  'type',
  SessionNotificationSchemaList
);

export type SessionNotificationPayload = z.infer<
  typeof SessionNotificationPayloadSchema
>;

/** Parameters for session notification (wraps the discriminated union). */
const _SessionNotificationParamsSchema = z
  .object({
    notification: SessionNotificationPayloadSchema,
  })
  .passthrough();

/* eslint-disable @typescript-eslint/consistent-type-assertions -- Zod workaround for deep type inference */
export const SessionNotificationParamsSchema: z.ZodType<
  SessionNotificationParams,
  z.ZodTypeDef,
  unknown
> = _SessionNotificationParamsSchema as z.ZodType<
  SessionNotificationParams,
  z.ZodTypeDef,
  unknown
>;
/* eslint-enable @typescript-eslint/consistent-type-assertions */

export type SessionNotificationParams = {
  notification: SessionNotificationPayload;
  [key: string]: unknown;
};

/** Full session notification with JSON-RPC envelope. */
const _SessionNotificationSchema = JsonRpcNotificationSchema.extend({
  method: z.literal(DroidClientMethod.SESSION_NOTIFICATION),
  params: SessionNotificationParamsSchema,
});

/* eslint-disable @typescript-eslint/consistent-type-assertions -- Zod workaround for deep type inference */
export const SessionNotificationSchema: z.ZodType<
  SessionNotification,
  z.ZodTypeDef,
  unknown
> = _SessionNotificationSchema as z.ZodType<
  SessionNotification,
  z.ZodTypeDef,
  unknown
>;
/* eslint-enable @typescript-eslint/consistent-type-assertions */

export type SessionNotification = z.output<typeof JsonRpcNotificationSchema> & {
  method: 'droid.session_notification';
  params: SessionNotificationParams;
};

export const EditToolConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.Edit),
    filePath: z.string(),
    fileName: z.string(),
    oldContent: z.string().optional(),
    newContent: z.string().optional(),
  })
  .passthrough();

export type EditToolConfirmationDetails = z.infer<
  typeof EditToolConfirmationDetailsSchema
>;

export const ExecuteToolConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.Execute),
    fullCommand: z.string(),
    command: z.string(),
    extractedCommands: z.array(z.string()).optional(),
    impactLevel: z.string().optional(),
  })
  .passthrough();

export type ExecuteToolConfirmationDetails = z.infer<
  typeof ExecuteToolConfirmationDetailsSchema
>;

export const CreateToolConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.Create),
    filePath: z.string(),
    fileName: z.string(),
    content: z.string(),
  })
  .passthrough();

export type CreateToolConfirmationDetails = z.infer<
  typeof CreateToolConfirmationDetailsSchema
>;

export const AskUserQuestionSchema = z
  .object({
    index: z.number(),
    topic: z.string(),
    question: z.string(),
    options: z.array(z.string()),
  })
  .passthrough();

export type AskUserQuestion = z.infer<typeof AskUserQuestionSchema>;

export const AskUserConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.AskUser),
    questionnaire: z.string(),
    parsed: z
      .object({
        questions: z.array(AskUserQuestionSchema),
      })
      .optional(),
    parseError: z
      .object({
        message: z.string(),
        line: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

export type AskUserConfirmationDetails = z.infer<
  typeof AskUserConfirmationDetailsSchema
>;

export const ExitSpecModeConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.ExitSpecMode),
    plan: z.string(),
    title: z.string().optional(),
    optionNames: z.array(z.string()).optional(),
  })
  .passthrough();

export type ExitSpecModeConfirmationDetails = z.infer<
  typeof ExitSpecModeConfirmationDetailsSchema
>;

export const ProposeMissionConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.ProposeMission),
    proposal: z.string(),
    title: z.string().optional(),
  })
  .passthrough();

export type ProposeMissionConfirmationDetails = z.infer<
  typeof ProposeMissionConfirmationDetailsSchema
>;

export const StartMissionRunConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.StartMissionRun),
    runningMissionCount: z.number(),
    runningMissionSessionIds: z.array(z.string()),
  })
  .passthrough();

export type StartMissionRunConfirmationDetails = z.infer<
  typeof StartMissionRunConfirmationDetailsSchema
>;

export const ApplyPatchToolConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.ApplyPatch),
    filePath: z.string(),
    fileName: z.string(),
    patchContent: z.string(),
    oldContent: z.string().optional(),
    newContent: z.string().optional(),
  })
  .passthrough();

export type ApplyPatchToolConfirmationDetails = z.infer<
  typeof ApplyPatchToolConfirmationDetailsSchema
>;

export const McpToolConfirmationDetailsSchema = z
  .object({
    type: z.literal(ToolConfirmationType.McpTool),
    toolName: z.string(),
    impactLevel: z.string(),
  })
  .passthrough();

export type McpToolConfirmationDetails = z.infer<
  typeof McpToolConfirmationDetailsSchema
>;

/** Discriminated union over tool confirmation detail types. */
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
]);

export type ToolConfirmationDetails = z.infer<
  typeof ToolConfirmationDetailsSchema
>;

/** Tool confirmation information (toolUse + confirmationType + details). */
export const ToolConfirmationInfoSchema = z
  .object({
    toolUse: ToolUseSchema,
    confirmationType: z.nativeEnum(ToolConfirmationType),
    details: ToolConfirmationDetailsSchema,
  })
  .passthrough();

export type ToolConfirmationInfo = z.infer<typeof ToolConfirmationInfoSchema>;

/** Parameters for droid.request_permission request. */
export const RequestPermissionRequestParamsSchema = z
  .object({
    toolUses: z.array(ToolConfirmationInfoSchema),
    options: z.array(ToolConfirmationListItemSchema),
  })
  .passthrough();

export type RequestPermissionRequestParams = z.infer<
  typeof RequestPermissionRequestParamsSchema
>;

/** Request for permission from the server (server → client). */
export const RequestPermissionRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidClientMethod.REQUEST_PERMISSION),
  params: RequestPermissionRequestParamsSchema,
});

export type RequestPermissionRequest = z.infer<
  typeof RequestPermissionRequestSchema
>;

export type RequestPermissionSelection =
  | ToolConfirmationOutcome
  | `${ToolConfirmationOutcome}`;

export type RequestPermissionHandlerResult =
  | RequestPermissionSelection
  | {
      selectedOption: RequestPermissionSelection;
      comment?: string;
    };

/** Result for droid.request_permission response. */
export const RequestPermissionResultSchema = z
  .object({
    selectedOption: z.nativeEnum(ToolConfirmationOutcome),
    comment: z.string().optional(),
  })
  .strict();

export type RequestPermissionResult = z.infer<
  typeof RequestPermissionResultSchema
>;

/** Response to droid.request_permission. */
export const RequestPermissionResponseSchema = z.union([
  JsonRpcResponseSuccessSchema.extend({
    result: RequestPermissionResultSchema,
  }),
  JsonRpcResponseFailureSchema,
]);

export type RequestPermissionResponse = z.infer<
  typeof RequestPermissionResponseSchema
>;

/** Parameters for droid.ask_user request. */
export const AskUserRequestParamsSchema = z
  .object({
    toolCallId: z.string(),
    questions: z.array(AskUserQuestionSchema),
  })
  .passthrough();

export type AskUserRequestParams = z.infer<typeof AskUserRequestParamsSchema>;

/** Ask user request from the server (server → client). */
export const AskUserRequestSchema = JsonRpcRequestSchema.extend({
  method: z.literal(DroidClientMethod.ASK_USER),
  params: AskUserRequestParamsSchema,
});

export type AskUserRequest = z.infer<typeof AskUserRequestSchema>;

/** A collected answer from the user. */
export const AskUserCollectedAnswerSchema = z
  .object({
    index: z.number(),
    question: z.string(),
    answer: z.string(),
  })
  .strict();

export type AskUserCollectedAnswer = z.infer<
  typeof AskUserCollectedAnswerSchema
>;

/** Result for droid.ask_user response. */
export const AskUserResultSchema = z
  .object({
    cancelled: z.boolean().optional(),
    answers: z.array(AskUserCollectedAnswerSchema),
  })
  .strict();

export type AskUserResult = z.infer<typeof AskUserResultSchema>;

/** Response to droid.ask_user. */
export const AskUserResponseSchema = z.union([
  JsonRpcResponseSuccessSchema.extend({ result: AskUserResultSchema }),
  JsonRpcResponseFailureSchema,
]);

export type AskUserResponse = z.infer<typeof AskUserResponseSchema>;

/** Union over all 3 server → client methods. */
const _CliRequestOrNotificationSchema = z.union([
  SessionNotificationSchema,
  RequestPermissionRequestSchema,
  AskUserRequestSchema,
]);

/* eslint-disable @typescript-eslint/consistent-type-assertions -- Zod workaround for deep type inference */
export const CliRequestOrNotificationSchema: z.ZodType<
  CliRequestOrNotification,
  z.ZodTypeDef,
  unknown
> = _CliRequestOrNotificationSchema as z.ZodType<
  CliRequestOrNotification,
  z.ZodTypeDef,
  unknown
>;
/* eslint-enable @typescript-eslint/consistent-type-assertions */

export type CliRequestOrNotification =
  | SessionNotification
  | RequestPermissionRequest
  | AskUserRequest;
