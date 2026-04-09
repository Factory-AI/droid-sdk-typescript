/**
 * Typed stream message interfaces and notification-to-stream converter.
 *
 * Defines 22 DroidMessage types as TypeScript interfaces with a discriminated
 * `type` field, plus a notification converter and working-state tracker for
 * TurnComplete emission.
 *
 * Reference: Python SDK stream.py
 */

import type {
  McpServerStatusInfo,
  McpStatusSummary,
  MissionFeature,
  ProgressLogEntry,
  SettingsUpdatedPayload,
  TokenUsage,
  ToolProgressUpdate,
} from './schemas/index.js';

import {
  DroidWorkingState,
  McpAuthOutcome,
  MissionState,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from './schemas/index.js';

// ---------------------------------------------------------------------------
// 22 DroidMessage interfaces — discriminated on `type`
// ---------------------------------------------------------------------------

/** A delta of assistant-generated text (streaming token). */
export interface AssistantTextDelta {
  readonly type: 'assistant_text_delta';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly text: string;
}

/** A delta of assistant thinking/reasoning text. */
export interface ThinkingTextDelta {
  readonly type: 'thinking_text_delta';
  readonly messageId: string;
  readonly blockIndex: number;
  readonly text: string;
}

/** A tool invocation issued by the assistant (from create_message). */
export interface ToolUse {
  readonly type: 'tool_use';
  readonly toolName: string;
  readonly toolInput: Record<string, unknown>;
  readonly toolUseId: string;
}

/** The result returned from a tool execution. */
export interface ToolResult {
  readonly type: 'tool_result';
  readonly toolUseId: string;
  readonly content: string | unknown[];
  readonly isError: boolean;
}

/** A streaming progress update from a tool execution. */
export interface ToolProgress {
  readonly type: 'tool_progress';
  readonly toolUseId: string;
  readonly toolName: string;
  readonly content: string;
  readonly update: ToolProgressUpdate;
}

/** The droid working state has changed. */
export interface WorkingStateChanged {
  readonly type: 'working_state_changed';
  readonly state: DroidWorkingState;
}

/** Updated token usage counters for the session. */
export interface TokenUsageUpdate {
  readonly type: 'token_usage_update';
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly thinkingTokens: number;
}

/** A full assistant message was created (may contain tool_use blocks). */
export interface CreateMessage {
  readonly type: 'create_message';
  readonly messageId: string;
  readonly role: string;
  readonly content: unknown[];
  readonly parentId?: string;
}

/** A permission request was resolved. */
export interface PermissionResolved {
  readonly type: 'permission_resolved';
  readonly requestId: string;
  readonly toolUseIds: string[];
  readonly selectedOption: ToolConfirmationOutcome;
}

/** Session settings were updated. */
export interface SettingsUpdated {
  readonly type: 'settings_updated';
  readonly settings: SettingsUpdatedPayload;
}

/** The session title was updated. */
export interface SessionTitleUpdated {
  readonly type: 'session_title_updated';
  readonly title: string;
}

/** MCP server status changed. */
export interface McpStatusChanged {
  readonly type: 'mcp_status_changed';
  readonly servers: McpServerStatusInfo[];
  readonly summary: McpStatusSummary;
}

/** Mission state changed. */
export interface MissionStateChanged {
  readonly type: 'mission_state_changed';
  readonly state: MissionState;
}

/** Mission features changed. */
export interface MissionFeaturesChanged {
  readonly type: 'mission_features_changed';
  readonly features: MissionFeature[];
}

/** Mission progress entry. */
export interface MissionProgressEntry {
  readonly type: 'mission_progress_entry';
  readonly progressLog: ProgressLogEntry[];
}

/** Mission heartbeat. */
export interface MissionHeartbeat {
  readonly type: 'mission_heartbeat';
  readonly timestamp: string;
}

/** A mission worker started. */
export interface MissionWorkerStarted {
  readonly type: 'mission_worker_started';
  readonly workerSessionId: string;
}

/** A mission worker completed. */
export interface MissionWorkerCompleted {
  readonly type: 'mission_worker_completed';
  readonly workerSessionId: string;
  readonly exitCode: number;
}

/** MCP authentication is required. */
export interface McpAuthRequired {
  readonly type: 'mcp_auth_required';
  readonly serverName: string;
  readonly authUrl: string;
  readonly message: string;
  readonly state: string;
}

/** MCP authentication completed. */
export interface McpAuthCompleted {
  readonly type: 'mcp_auth_completed';
  readonly serverName: string;
  readonly outcome: McpAuthOutcome;
  readonly message: string;
}

/** An error event from the droid process. */
export interface ErrorEvent {
  readonly type: 'error';
  readonly message: string;
  readonly errorType: string;
  readonly timestamp: string;
}

/** Sentinel yielded when the agent turn finishes (returns to Idle). */
export interface TurnComplete {
  readonly type: 'turn_complete';
  readonly tokenUsage: TokenUsageUpdate | null;
}

// ---------------------------------------------------------------------------
// DroidMessage union
// ---------------------------------------------------------------------------

/** Discriminated union of all 22 stream message types. */
export type DroidMessage =
  | AssistantTextDelta
  | ThinkingTextDelta
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

// ---------------------------------------------------------------------------
// Notification payload type (matches SessionNotificationPayload)
// ---------------------------------------------------------------------------

/**
 * A notification payload object as received from the protocol layer.
 * Must have at least a `type` string field. Other properties are
 * notification-type-specific.
 */
interface NotificationPayload {
  type: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Converter: notification → DroidMessage(s)
// ---------------------------------------------------------------------------

/**
 * Convert a server session notification payload to the corresponding
 * DroidMessage(s).
 *
 * For `create_message` notifications containing tool_use content blocks,
 * a list of ToolUse messages is returned (one per tool_use block), followed
 * by a single CreateMessage. For all other notification types a single
 * DroidMessage is returned, or `null` if the notification type is unknown.
 *
 * Unknown notification types return `null` and log a warning to the console.
 *
 * @param notification - A notification payload from `SessionNotification.params.notification`.
 * @returns A single DroidMessage, an array of DroidMessages, or `null` for unknown types.
 */
export function convertNotificationToStreamMessage(
  notification: NotificationPayload
): DroidMessage | DroidMessage[] | null {
  switch (notification.type) {
    case SessionNotificationType.ASSISTANT_TEXT_DELTA:
      return {
        type: 'assistant_text_delta',
        messageId: notification.messageId as string,
        blockIndex: notification.blockIndex as number,
        text: notification.textDelta as string,
      };

    case SessionNotificationType.THINKING_TEXT_DELTA:
      return {
        type: 'thinking_text_delta',
        messageId: notification.messageId as string,
        blockIndex: notification.blockIndex as number,
        text: notification.textDelta as string,
      };

    case SessionNotificationType.TOOL_RESULT:
      return {
        type: 'tool_result',
        toolUseId: notification.toolUseId as string,
        content: normalizeToolResultContent(notification.content),
        isError: Boolean(notification.isError),
      };

    case SessionNotificationType.TOOL_PROGRESS_UPDATE: {
      const update = notification.update as ToolProgressUpdate;
      const text = update?.text ?? update?.status ?? update?.details ?? '';
      return {
        type: 'tool_progress',
        toolUseId: notification.toolUseId as string,
        toolName: notification.toolName as string,
        content: text,
        update,
      };
    }

    case SessionNotificationType.DROID_WORKING_STATE_CHANGED:
      return {
        type: 'working_state_changed',
        state: notification.newState as DroidWorkingState,
      };

    case SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED: {
      const tu = notification.tokenUsage as TokenUsage;
      return {
        type: 'token_usage_update',
        inputTokens: tu.inputTokens,
        outputTokens: tu.outputTokens,
        cacheReadTokens: tu.cacheReadTokens,
        cacheWriteTokens: tu.cacheCreationTokens,
        thinkingTokens: tu.thinkingTokens,
      };
    }

    case SessionNotificationType.CREATE_MESSAGE: {
      const msg = notification.message as {
        id: string;
        role: string;
        content: Array<{
          type: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
          [key: string]: unknown;
        }>;
      };
      const messages: DroidMessage[] = [];

      // Extract ToolUse messages from tool_use content blocks
      if (msg.content && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') {
            messages.push({
              type: 'tool_use',
              toolName: block.name as string,
              toolInput: (block.input ?? {}) as Record<string, unknown>,
              toolUseId: block.id as string,
            });
          }
        }
      }

      // Always emit CreateMessage
      messages.push({
        type: 'create_message',
        messageId: msg.id,
        role: msg.role,
        content: msg.content ?? [],
        parentId: notification.parentId as string | undefined,
      });

      return messages;
    }

    case SessionNotificationType.ERROR:
      return {
        type: 'error',
        message: notification.message as string,
        errorType: notification.errorType as string,
        timestamp: notification.timestamp as string,
      };

    case SessionNotificationType.PERMISSION_RESOLVED:
      return {
        type: 'permission_resolved',
        requestId: notification.requestId as string,
        toolUseIds: notification.toolUseIds as string[],
        selectedOption: notification.selectedOption as ToolConfirmationOutcome,
      };

    case SessionNotificationType.SETTINGS_UPDATED:
      return {
        type: 'settings_updated',
        settings: notification.settings as SettingsUpdatedPayload,
      };

    case SessionNotificationType.SESSION_TITLE_UPDATED:
      return {
        type: 'session_title_updated',
        title: notification.title as string,
      };

    case SessionNotificationType.MCP_STATUS_CHANGED:
      return {
        type: 'mcp_status_changed',
        servers: notification.servers as McpServerStatusInfo[],
        summary: notification.summary as McpStatusSummary,
      };

    case SessionNotificationType.MISSION_STATE_CHANGED:
      return {
        type: 'mission_state_changed',
        state: notification.state as MissionState,
      };

    case SessionNotificationType.MISSION_FEATURES_CHANGED:
      return {
        type: 'mission_features_changed',
        features: notification.features as MissionFeature[],
      };

    case SessionNotificationType.MISSION_PROGRESS_ENTRY:
      return {
        type: 'mission_progress_entry',
        progressLog: notification.progressLog as ProgressLogEntry[],
      };

    case SessionNotificationType.MISSION_HEARTBEAT:
      return {
        type: 'mission_heartbeat',
        timestamp: notification.timestamp as string,
      };

    case SessionNotificationType.MISSION_WORKER_STARTED:
      return {
        type: 'mission_worker_started',
        workerSessionId: notification.workerSessionId as string,
      };

    case SessionNotificationType.MISSION_WORKER_COMPLETED:
      return {
        type: 'mission_worker_completed',
        workerSessionId: notification.workerSessionId as string,
        exitCode: notification.exitCode as number,
      };

    case SessionNotificationType.MCP_AUTH_REQUIRED:
      return {
        type: 'mcp_auth_required',
        serverName: notification.serverName as string,
        authUrl: notification.authUrl as string,
        message: notification.message as string,
        state: notification.state as string,
      };

    case SessionNotificationType.MCP_AUTH_COMPLETED:
      return {
        type: 'mcp_auth_completed',
        serverName: notification.serverName as string,
        outcome: notification.outcome as McpAuthOutcome,
        message: notification.message as string,
      };

    default:
      // Unknown notification type — return null silently
      return null;
  }
}

// ---------------------------------------------------------------------------
// Working state tracker for TurnComplete emission
// ---------------------------------------------------------------------------

/**
 * Tracks working state transitions to detect when an agent turn completes
 * (transitions from a non-idle state back to idle).
 *
 * Each `stream()` call should create a fresh StreamStateTracker so that
 * multi-turn sessions track state independently.
 *
 * Rules:
 * - TurnComplete is emitted when state goes non-idle → idle
 * - Initial idle does NOT emit TurnComplete
 * - TurnComplete carries the last-seen TokenUsageUpdate (or null)
 */
export class StreamStateTracker {
  /** Whether we have ever seen a non-idle state. */
  private hasBeenNonIdle = false;

  /** Last-seen token usage update (to attach to TurnComplete). */
  private lastTokenUsage: TokenUsageUpdate | null = null;

  /**
   * Process a DroidMessage and return any additional messages that should be
   * emitted (e.g. TurnComplete sentinel).
   *
   * @param message - The DroidMessage to process.
   * @returns An array of additional messages to emit (may be empty).
   */
  processMessage(message: DroidMessage): DroidMessage[] {
    const additional: DroidMessage[] = [];

    if (message.type === 'token_usage_update') {
      this.lastTokenUsage = message;
    }

    if (message.type === 'working_state_changed') {
      if (message.state !== DroidWorkingState.Idle) {
        this.hasBeenNonIdle = true;
      } else if (this.hasBeenNonIdle) {
        // Non-idle → Idle transition: emit TurnComplete
        additional.push({
          type: 'turn_complete',
          tokenUsage: this.lastTokenUsage,
        });
        // Reset so that subsequent idle→idle does NOT emit duplicate TurnComplete
        this.hasBeenNonIdle = false;
      }
      // If state is Idle but we were never non-idle, do nothing
      // (initial idle does NOT emit TurnComplete)
    }

    return additional;
  }

  /**
   * Reset the tracker for a new turn/stream call.
   */
  reset(): void {
    this.hasBeenNonIdle = false;
    this.lastTokenUsage = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeToolResultContent(content: unknown): string | unknown[] {
  if (content == null) {
    return '';
  }
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content as unknown[];
  }
  return String(content);
}
