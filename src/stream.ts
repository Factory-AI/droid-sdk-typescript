import type { TokenUsage } from './schemas/client.js';
import {
  DroidWorkingState,
  McpAuthOutcome,
  MissionState,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from './schemas/enums.js';
import type { McpServerStatusInfo, McpStatusSummary } from './schemas/mcp.js';
import {
  FactoryDroidMessageRole,
  type FactoryDroidMessage,
  type ToolUseBlock,
} from './schemas/messages.js';
import type { MissionFeature, ProgressLogEntry } from './schemas/mission.js';
import {
  SessionNotificationPayloadSchema,
  type CreateMessageNotification,
  type ErrorNotification,
  type SessionNotificationPayload,
  type SettingsUpdatedPayload,
  type StructuredOutputError as ServerStructuredOutputError,
  type ToolProgressUpdate,
} from './schemas/server.js';
import {
  JsonObjectSchema,
  type JsonObject,
  type JsonValue,
} from './schemas/shared.js';

export const DroidMessageType = {
  Assistant: 'assistant',
  User: 'user',
  ToolCall: 'tool_call',
  AssistantTextDelta: 'assistant_text_delta',
  AssistantTextComplete: 'assistant_text_complete',
  ThinkingTextDelta: 'thinking_text_delta',
  ThinkingTextComplete: 'thinking_text_complete',
  ToolCallDelta: 'tool_call_delta',
  ToolResult: 'tool_result',
  ToolProgress: 'tool_progress',
  WorkingStateChanged: 'working_state_changed',
  TokenUsageUpdate: 'token_usage_update',
  PermissionResolved: 'permission_resolved',
  SettingsUpdated: 'settings_updated',
  SessionTitleUpdated: 'session_title_updated',
  McpStatusChanged: 'mcp_status_changed',
  MissionStateChanged: 'mission_state_changed',
  MissionFeaturesChanged: 'mission_features_changed',
  MissionProgressEntry: 'mission_progress_entry',
  MissionHeartbeat: 'mission_heartbeat',
  MissionWorkerStarted: 'mission_worker_started',
  MissionWorkerCompleted: 'mission_worker_completed',
  McpAuthRequired: 'mcp_auth_required',
  McpAuthCompleted: 'mcp_auth_completed',
  Hook: 'hook',
  Error: 'error',
  Result: 'result',
} as const;

export interface AssistantTextDelta {
  readonly type: 'assistant_text_delta';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly text: string;
}

export interface AssistantTextComplete {
  readonly type: 'assistant_text_complete';
  readonly messageId: string;
  readonly blockIndex: number;
}

export interface ThinkingTextDelta {
  readonly type: 'thinking_text_delta';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly text: string;
}

export interface ThinkingTextComplete {
  readonly type: 'thinking_text_complete';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly durationMs?: number;
}

export interface ToolCallDelta {
  readonly type: 'tool_call_delta';
  readonly toolUse: ToolUseBlock;
}

export interface ToolUse {
  readonly type: 'tool_use';
  readonly toolName: string;
  readonly toolInput: JsonObject;
  readonly toolUseId: string;
}

export interface DroidToolCallMessage {
  readonly type: 'tool_call';
  readonly toolUse: ToolUseBlock;
}

export interface DroidAssistantMessage {
  readonly type: 'assistant';
  readonly message: FactoryDroidMessage;
  readonly text: string;
}

export interface DroidUserMessage {
  readonly type: 'user';
  readonly message: FactoryDroidMessage;
}

export interface ToolResult {
  readonly type: 'tool_result';
  readonly toolUseId: string;
  readonly toolName: string;
  readonly content: string | JsonValue[];
  readonly isError: boolean;
}

export interface ToolProgress {
  readonly type: 'tool_progress';
  readonly toolUseId: string;
  readonly toolName: string;
  readonly content: string;
  readonly update: ToolProgressUpdate;
}

export interface WorkingStateChanged {
  readonly type: 'working_state_changed';
  readonly state: DroidWorkingState;
}

export type TokenUsageUpdate = Readonly<
  {
    type: 'token_usage_update';
  } & TokenUsage
>;

export interface CreateMessage {
  readonly type: 'create_message';
  readonly messageId: CreateMessageNotification['message']['id'];
  readonly role: CreateMessageNotification['message']['role'];
  readonly content: CreateMessageNotification['message']['content'];
  readonly parentId?: CreateMessageNotification['parentId'];
}

export interface PermissionResolved {
  readonly type: 'permission_resolved';
  readonly requestId: string;
  readonly toolUseIds: string[];
  readonly selectedOption: ToolConfirmationOutcome;
}

export interface SettingsUpdated {
  readonly type: 'settings_updated';
  readonly settings: SettingsUpdatedPayload;
}

export interface SessionTitleUpdated {
  readonly type: 'session_title_updated';
  readonly title: string;
}

export interface McpStatusChanged {
  readonly type: 'mcp_status_changed';
  readonly servers: McpServerStatusInfo[];
  readonly summary: McpStatusSummary;
}

export interface MissionStateChanged {
  readonly type: 'mission_state_changed';
  readonly state: MissionState;
}

export interface MissionFeaturesChanged {
  readonly type: 'mission_features_changed';
  readonly features: MissionFeature[];
}

export interface MissionProgressEntry {
  readonly type: 'mission_progress_entry';
  readonly progressLog: ProgressLogEntry[];
}

export interface MissionHeartbeat {
  readonly type: 'mission_heartbeat';
  readonly timestamp: string;
}

export interface MissionWorkerStarted {
  readonly type: 'mission_worker_started';
  readonly workerSessionId: string;
}

export interface MissionWorkerCompleted {
  readonly type: 'mission_worker_completed';
  readonly workerSessionId: string;
  readonly exitCode: number;
}

export interface McpAuthRequired {
  readonly type: 'mcp_auth_required';
  readonly serverName: string;
  readonly authUrl: string;
  readonly message: string;
  readonly state: string;
}

export interface McpAuthCompleted {
  readonly type: 'mcp_auth_completed';
  readonly serverName: string;
  readonly outcome: McpAuthOutcome;
  readonly message: string;
}

export interface HookExecution {
  readonly type: 'hook';
  readonly hookId: string;
  readonly eventName?: string;
  readonly matcher?: string;
  readonly toolCallId?: string;
  readonly command?: string;
  readonly timeout?: number;
  readonly status: 'started' | 'completed' | 'error';
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}

export interface StructuredOutputFields {
  readonly structuredOutput: JsonObject | null;
  readonly structuredOutputError: ServerStructuredOutputError | null;
}

export interface StructuredOutput extends StructuredOutputFields {
  readonly type: 'structured_output';
  readonly messageId: string;
}

export interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
  readonly errorType: ErrorNotification['errorType'];
  readonly timestamp: string;
}

export type DroidErrorMessage = ErrorEvent;

export type DroidToolResultMessage = ToolResult;

export type DroidResultSubtype =
  | 'success'
  | 'error_during_execution'
  | 'error_structured_output';

interface DroidResultBase {
  readonly type: 'result';
  readonly sessionId: string;
  readonly durationMs: number;
  readonly numTurns: number;
  readonly result: string;
  readonly tokenUsage: TokenUsage | null;
  /** Stream messages emitted before this result. */
  readonly messages: DroidStreamEvent[];
  readonly text: string;
  readonly turnCount: number;
  readonly success: boolean;
}

export interface DroidResultSuccessMessage extends DroidResultBase {
  readonly subtype: 'success';
  readonly isError: false;
  readonly structuredOutput?: unknown;
  readonly structuredOutputError?: null;
  readonly error: null;
}

export interface DroidResultErrorMessage extends DroidResultBase {
  readonly subtype: 'error_during_execution' | 'error_structured_output';
  readonly isError: true;
  readonly errors: string[];
  readonly structuredOutput?: unknown;
  readonly structuredOutputError?: ServerStructuredOutputError | null;
  readonly error: ErrorEvent | null;
}

export type DroidResultMessage =
  | DroidResultSuccessMessage
  | DroidResultErrorMessage;

export type DroidStreamMessage =
  | DroidAssistantMessage
  | DroidUserMessage
  | DroidToolCallMessage
  | ToolResult
  | HookExecution
  | ErrorEvent
  | DroidResultMessage;

export type DroidStreamEvent =
  | DroidStreamMessage
  | AssistantTextDelta
  | AssistantTextComplete
  | ThinkingTextDelta
  | ThinkingTextComplete
  | ToolCallDelta
  | ToolProgress
  | WorkingStateChanged
  | TokenUsageUpdate
  | PermissionResolved
  | SettingsUpdated
  | SessionTitleUpdated
  | McpStatusChanged
  | MissionStateChanged
  | MissionFeaturesChanged
  | MissionProgressEntry
  | MissionHeartbeat
  | MissionWorkerStarted
  | MissionWorkerCompleted
  | McpAuthRequired
  | McpAuthCompleted
  | HookExecution;

export type InternalDroidMessage =
  | DroidStreamEvent
  | ToolUse
  | CreateMessage
  | StructuredOutput;

export type DroidMessage = DroidStreamEvent;

export type DroidMessageType =
  (typeof DroidMessageType)[keyof typeof DroidMessageType];

export function convertNotificationToStreamMessage(
  raw: unknown
): InternalDroidMessage | InternalDroidMessage[] | null {
  const parsed = SessionNotificationPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const notification: SessionNotificationPayload = parsed.data;

  switch (notification.type) {
    case SessionNotificationType.ASSISTANT_TEXT_DELTA:
      return {
        type: DroidMessageType.AssistantTextDelta,
        messageId: notification.messageId,
        blockIndex: notification.blockIndex,
        text: notification.textDelta,
      };

    case SessionNotificationType.ASSISTANT_TEXT_COMPLETE:
      return {
        type: DroidMessageType.AssistantTextComplete,
        messageId: notification.messageId,
        blockIndex: notification.blockIndex,
      };

    case SessionNotificationType.THINKING_TEXT_DELTA:
      return {
        type: DroidMessageType.ThinkingTextDelta,
        messageId: notification.messageId,
        blockIndex: notification.blockIndex,
        text: notification.textDelta,
      };

    case SessionNotificationType.THINKING_TEXT_COMPLETE:
      return {
        type: DroidMessageType.ThinkingTextComplete,
        messageId: notification.messageId,
        blockIndex: notification.blockIndex,
        durationMs: notification.durationMs,
      };

    case SessionNotificationType.TOOL_CALL:
      return {
        type: DroidMessageType.ToolCallDelta,
        toolUse: notification.toolUse,
      };

    case SessionNotificationType.TOOL_RESULT:
      return {
        type: DroidMessageType.ToolResult,
        toolUseId: notification.toolUseId,
        toolName: '',
        content: normalizeToolResultContent(notification.content),
        isError: Boolean(notification.isError),
      };

    case SessionNotificationType.TOOL_PROGRESS_UPDATE: {
      const update: ToolProgressUpdate = notification.update;
      const text = update?.text ?? update?.status ?? update?.details ?? '';
      return {
        type: DroidMessageType.ToolProgress,
        toolUseId: notification.toolUseId,
        toolName: notification.toolName,
        content: text,
        update,
      };
    }

    case SessionNotificationType.DROID_WORKING_STATE_CHANGED:
      return {
        type: DroidMessageType.WorkingStateChanged,
        state: notification.newState,
      };

    case SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED: {
      const tu: TokenUsage = notification.tokenUsage;
      return {
        type: DroidMessageType.TokenUsageUpdate,
        inputTokens: tu.inputTokens,
        outputTokens: tu.outputTokens,
        cacheReadTokens: tu.cacheReadTokens,
        cacheCreationTokens: tu.cacheCreationTokens,
        thinkingTokens: tu.thinkingTokens,
      };
    }

    case SessionNotificationType.CREATE_MESSAGE: {
      const msg = notification.message;
      const messages: InternalDroidMessage[] = [];

      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          messages.push({
            type: DroidMessageType.ToolCall,
            toolUse: block,
          });
        }
      }

      if (msg.role === FactoryDroidMessageRole.Assistant) {
        messages.push({
          type: DroidMessageType.Assistant,
          message: msg,
          text: extractTextFromMessage(msg),
        });
      } else if (msg.role === FactoryDroidMessageRole.User) {
        messages.push({
          type: DroidMessageType.User,
          message: msg,
        });
      } else {
        messages.push({
          type: 'create_message',
          messageId: msg.id,
          role: msg.role,
          content: msg.content,
          parentId: notification.parentId,
        });
      }

      return messages;
    }

    case SessionNotificationType.ERROR:
      return {
        type: DroidMessageType.Error,
        message: notification.message,
        errorType: notification.errorType,
        timestamp: notification.timestamp,
      };

    case SessionNotificationType.PERMISSION_RESOLVED:
      return {
        type: DroidMessageType.PermissionResolved,
        requestId: notification.requestId,
        toolUseIds: notification.toolUseIds,
        selectedOption: notification.selectedOption,
      };

    case SessionNotificationType.SETTINGS_UPDATED:
      return {
        type: DroidMessageType.SettingsUpdated,
        settings: notification.settings,
      };

    case SessionNotificationType.SESSION_TITLE_UPDATED:
      return {
        type: DroidMessageType.SessionTitleUpdated,
        title: notification.title,
      };

    case SessionNotificationType.MCP_STATUS_CHANGED:
      return {
        type: DroidMessageType.McpStatusChanged,
        servers: notification.servers,
        summary: notification.summary,
      };

    case SessionNotificationType.MISSION_STATE_CHANGED:
      return {
        type: DroidMessageType.MissionStateChanged,
        state: notification.state,
      };

    case SessionNotificationType.MISSION_FEATURES_CHANGED:
      return {
        type: DroidMessageType.MissionFeaturesChanged,
        features: notification.features,
      };

    case SessionNotificationType.MISSION_PROGRESS_ENTRY:
      return {
        type: DroidMessageType.MissionProgressEntry,
        progressLog: notification.progressLog,
      };

    case SessionNotificationType.MISSION_HEARTBEAT:
      return {
        type: DroidMessageType.MissionHeartbeat,
        timestamp: notification.timestamp,
      };

    case SessionNotificationType.MISSION_WORKER_STARTED:
      return {
        type: DroidMessageType.MissionWorkerStarted,
        workerSessionId: notification.workerSessionId,
      };

    case SessionNotificationType.MISSION_WORKER_COMPLETED:
      return {
        type: DroidMessageType.MissionWorkerCompleted,
        workerSessionId: notification.workerSessionId,
        exitCode: notification.exitCode,
      };

    case SessionNotificationType.MCP_AUTH_REQUIRED:
      return {
        type: DroidMessageType.McpAuthRequired,
        serverName: notification.serverName,
        authUrl: notification.authUrl,
        message: notification.message,
        state: notification.state,
      };

    case SessionNotificationType.MCP_AUTH_COMPLETED:
      return {
        type: DroidMessageType.McpAuthCompleted,
        serverName: notification.serverName,
        outcome: notification.outcome,
        message: notification.message,
      };

    case SessionNotificationType.HOOK_EXECUTION_STARTED:
      return notification.hookCommands.map((hookCommand) => ({
        type: DroidMessageType.Hook,
        hookId: notification.hookId,
        eventName: notification.hookEventName,
        matcher: notification.hookMatcher,
        toolCallId: notification.hookToolCallId,
        command: hookCommand.command,
        timeout: hookCommand.timeout,
        status: 'started',
      }));

    case SessionNotificationType.HOOK_EXECUTION_COMPLETED:
      return (notification.hookResults ?? []).map((hookResult) => ({
        type: DroidMessageType.Hook,
        hookId: notification.hookId,
        eventName: notification.hookEventName,
        matcher: notification.hookMatcher,
        toolCallId: notification.hookToolCallId,
        command: hookResult.command,
        timeout: hookResult.timeout,
        status: notification.hookStatus,
        exitCode: hookResult.exitCode,
        stdout: hookResult.stdout,
        stderr: hookResult.stderr,
      }));

    case SessionNotificationType.STRUCTURED_OUTPUT:
      return {
        type: 'structured_output',
        messageId: notification.messageId,
        structuredOutput: notification.structuredOutput,
        structuredOutputError: notification.structuredOutputError,
      };

    default:
      return null;
  }
}

/**
 * Tracks working state to detect turn completion (non-idle → idle transition).
 * Create a fresh instance per `stream()` call.
 */
export class StreamStateTracker {
  private hasBeenNonIdle = false;

  private lastTokenUsage: TokenUsageUpdate | null = null;

  private fullText = '';

  private finalAssistantText = '';

  private structuredOutput: JsonObject | null = null;

  private structuredOutputError: ServerStructuredOutputError | null = null;

  private errors: ErrorEvent[] = [];

  private numTurns = 0;

  private emittedMessages: DroidStreamEvent[] = [];

  private toolNameMap = new Map<string, string>();

  constructor(
    private readonly options: {
      sessionId?: string;
      startedAt?: number;
      hasOutputFormat?: boolean;
    } = {}
  ) {}

  private getToolName(toolUseId: string): string {
    return this.toolNameMap.get(toolUseId) ?? '';
  }

  processMessage(message: InternalDroidMessage): {
    message: InternalDroidMessage | null;
    additional: InternalDroidMessage[];
  } {
    const additional: InternalDroidMessage[] = [];

    if (message.type === 'tool_use') {
      this.toolNameMap.set(message.toolUseId, message.toolName);
    }

    if (message.type === DroidMessageType.ToolCall) {
      this.toolNameMap.set(message.toolUse.id, message.toolUse.name);
    }

    if (message.type === DroidMessageType.ToolCallDelta) {
      this.toolNameMap.set(message.toolUse.id, message.toolUse.name);
    }

    // Enrich tool_result with toolName from prior tool_use
    if (message.type === DroidMessageType.ToolResult) {
      message = { ...message, toolName: this.getToolName(message.toolUseId) };
    }

    if (message.type === DroidMessageType.AssistantTextDelta) {
      this.fullText += message.text;
    }

    if (message.type === DroidMessageType.Assistant) {
      this.finalAssistantText = message.text;
      if (this.fullText.length === 0) {
        this.fullText = message.text;
      }
    }

    if (message.type === DroidMessageType.TokenUsageUpdate) {
      this.lastTokenUsage = message;
    }

    if (message.type === DroidMessageType.Error) {
      this.errors.push(message);
    }

    if (message.type === 'structured_output') {
      this.structuredOutput = message.structuredOutput;
      this.structuredOutputError = message.structuredOutputError;
      return { message: null, additional };
    }

    if (message.type === DroidMessageType.WorkingStateChanged) {
      if (message.state !== DroidWorkingState.Idle) {
        this.hasBeenNonIdle = true;
      } else if (this.hasBeenNonIdle) {
        this.numTurns++;
        additional.push(this.createResultMessage());
        this.hasBeenNonIdle = false;
        this.resetTurnState();
      }
    }

    if (message.type !== DroidMessageType.WorkingStateChanged) {
      this.trackEmittedMessage(message);
    }

    return { message, additional };
  }

  private createResultMessage(): DroidResultMessage {
    if (
      this.options.hasOutputFormat &&
      this.structuredOutput === null &&
      this.structuredOutputError === null
    ) {
      this.structuredOutput =
        parseJsonObject(this.finalAssistantText || this.fullText) ?? null;
    }

    const tokenUsage = this.lastTokenUsage
      ? stripTokenUsageType(this.lastTokenUsage)
      : null;
    const result = this.finalAssistantText || this.fullText;
    const base = {
      type: DroidMessageType.Result,
      sessionId: this.options.sessionId ?? '',
      durationMs: Date.now() - (this.options.startedAt ?? Date.now()),
      numTurns: this.numTurns,
      result,
      tokenUsage,
      messages: [...this.emittedMessages],
      text: result,
      turnCount: this.numTurns,
    };

    if (this.structuredOutputError) {
      return {
        ...base,
        subtype: 'error_structured_output',
        isError: true,
        success: false,
        errors: [this.structuredOutputError.message],
        structuredOutput: this.structuredOutput,
        structuredOutputError: this.structuredOutputError,
        error: null,
      };
    }

    if (this.errors.length > 0) {
      return {
        ...base,
        subtype: 'error_during_execution',
        isError: true,
        success: false,
        errors: this.errors.map((error) => error.message),
        structuredOutput: this.structuredOutput,
        structuredOutputError: null,
        error: this.errors[0] ?? null,
      };
    }

    return {
      ...base,
      subtype: 'success',
      isError: false,
      success: true,
      structuredOutput: this.structuredOutput,
      structuredOutputError: null,
      error: null,
    };
  }

  private trackEmittedMessage(message: InternalDroidMessage): void {
    if (isDefaultStreamMessage(message)) {
      this.emittedMessages.push(message);
    }
  }

  private resetTurnState(): void {
    this.lastTokenUsage = null;
    this.fullText = '';
    this.finalAssistantText = '';
    this.structuredOutput = null;
    this.structuredOutputError = null;
    this.errors = [];
    this.emittedMessages = [];
  }
}

export function isPartialMessage(message: InternalDroidMessage): boolean {
  return (
    message.type === DroidMessageType.AssistantTextDelta ||
    message.type === DroidMessageType.AssistantTextComplete ||
    message.type === DroidMessageType.ThinkingTextDelta ||
    message.type === DroidMessageType.ThinkingTextComplete ||
    message.type === DroidMessageType.ToolCallDelta ||
    message.type === DroidMessageType.ToolProgress
  );
}

export function isInternalMessage(message: InternalDroidMessage): boolean {
  return (
    message.type === 'structured_output' ||
    message.type === 'tool_use' ||
    message.type === 'create_message'
  );
}

export function isDefaultStreamMessage(
  message: InternalDroidMessage
): message is DroidStreamMessage {
  return (
    message.type === DroidMessageType.Assistant ||
    message.type === DroidMessageType.User ||
    message.type === DroidMessageType.ToolCall ||
    message.type === DroidMessageType.ToolResult ||
    message.type === DroidMessageType.Hook ||
    message.type === DroidMessageType.Error ||
    message.type === DroidMessageType.Result
  );
}

function stripTokenUsageType(message: TokenUsageUpdate): TokenUsage {
  const {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    thinkingTokens,
  } = message;
  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    thinkingTokens,
  };
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(text);
    const result = JsonObjectSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function normalizeToolResultContent(
  content: JsonValue | undefined
): string | JsonValue[] {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content;
  }
  return String(content);
}

function extractTextFromMessage(message: FactoryDroidMessage): string {
  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}
