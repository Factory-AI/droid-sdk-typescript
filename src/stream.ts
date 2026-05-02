import type { TokenUsage } from './schemas/client.js';
import {
  DroidWorkingState,
  McpAuthOutcome,
  MissionState,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from './schemas/enums.js';
import type { McpServerStatusInfo, McpStatusSummary } from './schemas/mcp.js';
import type { MissionFeature, ProgressLogEntry } from './schemas/mission.js';
import {
  SessionNotificationPayloadSchema,
  type CreateMessageNotification,
  type ErrorNotification,
  type SessionNotificationPayload,
  type SettingsUpdatedPayload,
  type ToolProgressUpdate,
} from './schemas/server.js';
import type { JsonObject, JsonValue } from './schemas/shared.js';

export const DroidMessageType = {
  AssistantTextDelta: 'assistant_text_delta',
  ThinkingTextDelta: 'thinking_text_delta',
  StructuredOutput: 'structured_output',
  ToolUse: 'tool_use',
  ToolResult: 'tool_result',
  ToolProgress: 'tool_progress',
  WorkingStateChanged: 'working_state_changed',
  TokenUsageUpdate: 'token_usage_update',
  CreateMessage: 'create_message',
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
  Error: 'error',
  TurnComplete: 'turn_complete',
} as const;

export interface AssistantTextDelta {
  readonly type: 'assistant_text_delta';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly text: string;
}

export interface ThinkingTextDelta {
  readonly type: 'thinking_text_delta';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly text: string;
}

export interface StructuredOutput {
  readonly type: 'structured_output';
  readonly output: JsonObject;
}

export interface ToolUse {
  readonly type: 'tool_use';
  readonly toolName: string;
  readonly toolInput: JsonObject;
  readonly toolUseId: string;
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

export interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
  readonly errorType: ErrorNotification['errorType'];
  readonly timestamp: string;
}

/** Sentinel yielded when the agent turn finishes (returns to Idle). */
export interface TurnComplete {
  readonly type: 'turn_complete';
  readonly tokenUsage: TokenUsageUpdate | null;
}

export type DroidMessage =
  | AssistantTextDelta
  | ThinkingTextDelta
  | StructuredOutput
  | ToolUse
  | ToolResult
  | ToolProgress
  | WorkingStateChanged
  | TokenUsageUpdate
  | CreateMessage
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
  | ErrorEvent
  | TurnComplete;

export type DroidMessageType =
  (typeof DroidMessageType)[keyof typeof DroidMessageType];

export function convertNotificationToStreamMessage(
  raw: unknown
): DroidMessage | DroidMessage[] | null {
  const parsed = SessionNotificationPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }

  const notification: SessionNotificationPayload = parsed.data;

  switch (notification.type) {
    case SessionNotificationType.ASSISTANT_TEXT_DELTA:
      return {
        type: 'assistant_text_delta',
        messageId: notification.messageId,
        blockIndex: notification.blockIndex,
        text: notification.textDelta,
      };

    case SessionNotificationType.THINKING_TEXT_DELTA:
      return {
        type: 'thinking_text_delta',
        messageId: notification.messageId,
        blockIndex: notification.blockIndex,
        text: notification.textDelta,
      };

    case SessionNotificationType.STRUCTURED_OUTPUT:
      return {
        type: 'structured_output',
        output: notification.output,
      };

    case SessionNotificationType.TOOL_RESULT:
      return {
        type: 'tool_result',
        toolUseId: notification.toolUseId,
        toolName: '',
        content: normalizeToolResultContent(notification.content),
        isError: Boolean(notification.isError),
      };

    case SessionNotificationType.TOOL_PROGRESS_UPDATE: {
      const update: ToolProgressUpdate = notification.update;
      const text = update?.text ?? update?.status ?? update?.details ?? '';
      return {
        type: 'tool_progress',
        toolUseId: notification.toolUseId,
        toolName: notification.toolName,
        content: text,
        update,
      };
    }

    case SessionNotificationType.DROID_WORKING_STATE_CHANGED:
      return {
        type: 'working_state_changed',
        state: notification.newState,
      };

    case SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED: {
      const tu: TokenUsage = notification.tokenUsage;
      return {
        type: 'token_usage_update',
        inputTokens: tu.inputTokens,
        outputTokens: tu.outputTokens,
        cacheReadTokens: tu.cacheReadTokens,
        cacheCreationTokens: tu.cacheCreationTokens,
        thinkingTokens: tu.thinkingTokens,
      };
    }

    case SessionNotificationType.CREATE_MESSAGE: {
      const msg = notification.message;
      const messages: DroidMessage[] = [];

      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          messages.push({
            type: 'tool_use',
            toolName: block.name,
            toolInput: block.input,
            toolUseId: block.id,
          });
        }
      }

      messages.push({
        type: 'create_message',
        messageId: msg.id,
        role: msg.role,
        content: msg.content,
        parentId: notification.parentId,
      });

      return messages;
    }

    case SessionNotificationType.ERROR:
      return {
        type: 'error',
        message: notification.message,
        errorType: notification.errorType,
        timestamp: notification.timestamp,
      };

    case SessionNotificationType.PERMISSION_RESOLVED:
      return {
        type: 'permission_resolved',
        requestId: notification.requestId,
        toolUseIds: notification.toolUseIds,
        selectedOption: notification.selectedOption,
      };

    case SessionNotificationType.SETTINGS_UPDATED:
      return {
        type: 'settings_updated',
        settings: notification.settings,
      };

    case SessionNotificationType.SESSION_TITLE_UPDATED:
      return {
        type: 'session_title_updated',
        title: notification.title,
      };

    case SessionNotificationType.MCP_STATUS_CHANGED:
      return {
        type: 'mcp_status_changed',
        servers: notification.servers,
        summary: notification.summary,
      };

    case SessionNotificationType.MISSION_STATE_CHANGED:
      return {
        type: 'mission_state_changed',
        state: notification.state,
      };

    case SessionNotificationType.MISSION_FEATURES_CHANGED:
      return {
        type: 'mission_features_changed',
        features: notification.features,
      };

    case SessionNotificationType.MISSION_PROGRESS_ENTRY:
      return {
        type: 'mission_progress_entry',
        progressLog: notification.progressLog,
      };

    case SessionNotificationType.MISSION_HEARTBEAT:
      return {
        type: 'mission_heartbeat',
        timestamp: notification.timestamp,
      };

    case SessionNotificationType.MISSION_WORKER_STARTED:
      return {
        type: 'mission_worker_started',
        workerSessionId: notification.workerSessionId,
      };

    case SessionNotificationType.MISSION_WORKER_COMPLETED:
      return {
        type: 'mission_worker_completed',
        workerSessionId: notification.workerSessionId,
        exitCode: notification.exitCode,
      };

    case SessionNotificationType.MCP_AUTH_REQUIRED:
      return {
        type: 'mcp_auth_required',
        serverName: notification.serverName,
        authUrl: notification.authUrl,
        message: notification.message,
        state: notification.state,
      };

    case SessionNotificationType.MCP_AUTH_COMPLETED:
      return {
        type: 'mcp_auth_completed',
        serverName: notification.serverName,
        outcome: notification.outcome,
        message: notification.message,
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

  private toolNameMap = new Map<string, string>();

  private getToolName(toolUseId: string): string {
    return this.toolNameMap.get(toolUseId) ?? '';
  }

  processMessage(message: DroidMessage): {
    message: DroidMessage;
    additional: DroidMessage[];
  } {
    const additional: DroidMessage[] = [];

    if (message.type === 'tool_use') {
      this.toolNameMap.set(message.toolUseId, message.toolName);
    }

    // Enrich tool_result with toolName from prior tool_use
    if (message.type === 'tool_result') {
      message = { ...message, toolName: this.getToolName(message.toolUseId) };
    }

    if (message.type === 'token_usage_update') {
      this.lastTokenUsage = message;
    }

    if (message.type === 'working_state_changed') {
      if (message.state !== DroidWorkingState.Idle) {
        this.hasBeenNonIdle = true;
      } else if (this.hasBeenNonIdle) {
        additional.push({
          type: 'turn_complete',
          tokenUsage: this.lastTokenUsage,
        });
        this.hasBeenNonIdle = false;
      }
    }

    return { message, additional };
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
