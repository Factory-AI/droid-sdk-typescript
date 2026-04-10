import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DroidErrorType,
  DroidWorkingState,
  FeatureStatus,
  McpAuthOutcome,
  McpServerStatus,
  MissionState,
  SessionNotificationType,
  SettingsLevel,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import {
  convertNotificationToStreamMessage,
  StreamStateTracker,
} from '../src/stream.js';
import type {
  AssistantTextDelta,
  ThinkingTextDelta,
  ToolUse,
  ToolResult,
  ToolProgress,
  WorkingStateChanged,
  TokenUsageUpdate,
  CreateMessage,
  PermissionResolved,
  SettingsUpdated,
  SessionTitleUpdated,
  McpStatusChanged,
  MissionStateChanged,
  MissionFeaturesChanged,
  MissionProgressEntry,
  MissionHeartbeat,
  MissionWorkerStarted,
  MissionWorkerCompleted,
  McpAuthRequired,
  McpAuthCompleted,
  ErrorEvent,
  TurnComplete,
  DroidMessage,
} from '../src/stream.js';

// ---------------------------------------------------------------------------
// Helpers for creating notification payloads
// ---------------------------------------------------------------------------

function makeNotification(type: string, payload: Record<string, unknown>) {
  return { type, ...payload };
}

// ---------------------------------------------------------------------------
// DroidMessage type definitions
// ---------------------------------------------------------------------------

describe('DroidMessage types', () => {
  it('AssistantTextDelta has correct structure', () => {
    const msg: AssistantTextDelta = {
      type: 'assistant_text_delta',
      messageId: 'msg-1',
      blockIndex: 0,
      text: 'Hello',
    };
    expect(msg.type).toBe('assistant_text_delta');
    expect(msg.text).toBe('Hello');
    expect(msg.messageId).toBe('msg-1');
    expect(msg.blockIndex).toBe(0);
  });

  it('ThinkingTextDelta has correct structure', () => {
    const msg: ThinkingTextDelta = {
      type: 'thinking_text_delta',
      messageId: 'msg-2',
      blockIndex: 1,
      text: 'Let me think...',
    };
    expect(msg.type).toBe('thinking_text_delta');
    expect(msg.text).toBe('Let me think...');
  });

  it('ToolUse has correct structure', () => {
    const msg: ToolUse = {
      type: 'tool_use',
      toolName: 'read_file',
      toolInput: { path: '/tmp/test.txt' },
      toolUseId: 'tu-1',
    };
    expect(msg.type).toBe('tool_use');
    expect(msg.toolName).toBe('read_file');
    expect(msg.toolInput).toEqual({ path: '/tmp/test.txt' });
    expect(msg.toolUseId).toBe('tu-1');
  });

  it('ToolResult has correct structure', () => {
    const msg: ToolResult = {
      type: 'tool_result',
      toolUseId: 'tu-1',
      toolName: 'read_file',
      content: 'file contents here',
      isError: false,
    };
    expect(msg.type).toBe('tool_result');
    expect(msg.toolName).toBe('read_file');
    expect(msg.content).toBe('file contents here');
    expect(msg.isError).toBe(false);
  });

  it('ToolProgress has correct structure', () => {
    const msg: ToolProgress = {
      type: 'tool_progress',
      toolUseId: 'tu-1',
      toolName: 'execute',
      content: 'Running...',
      update: { type: 'status', status: 'Running...' },
    };
    expect(msg.type).toBe('tool_progress');
    expect(msg.toolName).toBe('execute');
    expect(msg.content).toBe('Running...');
  });

  it('WorkingStateChanged has correct structure', () => {
    const msg: WorkingStateChanged = {
      type: 'working_state_changed',
      state: DroidWorkingState.ExecutingTool,
    };
    expect(msg.type).toBe('working_state_changed');
    expect(msg.state).toBe(DroidWorkingState.ExecutingTool);
  });

  it('TokenUsageUpdate has correct structure', () => {
    const msg: TokenUsageUpdate = {
      type: 'token_usage_update',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 5,
      thinkingTokens: 20,
    };
    expect(msg.type).toBe('token_usage_update');
    expect(msg.inputTokens).toBe(100);
    expect(msg.outputTokens).toBe(50);
    expect(msg.cacheReadTokens).toBe(10);
    expect(msg.cacheCreationTokens).toBe(5);
    expect(msg.thinkingTokens).toBe(20);
  });

  it('CreateMessage has correct structure', () => {
    const msg: CreateMessage = {
      type: 'create_message',
      messageId: 'msg-3',
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      parentId: 'msg-2',
    };
    expect(msg.type).toBe('create_message');
    expect(msg.messageId).toBe('msg-3');
    expect(msg.role).toBe('assistant');
    expect(msg.parentId).toBe('msg-2');
  });

  it('PermissionResolved has correct structure', () => {
    const msg: PermissionResolved = {
      type: 'permission_resolved',
      requestId: 'req-1',
      toolUseIds: ['tu-1', 'tu-2'],
      selectedOption: ToolConfirmationOutcome.ProceedOnce,
    };
    expect(msg.type).toBe('permission_resolved');
    expect(msg.selectedOption).toBe(ToolConfirmationOutcome.ProceedOnce);
  });

  it('SettingsUpdated has correct structure', () => {
    const msg: SettingsUpdated = {
      type: 'settings_updated',
      settings: { modelId: 'claude-opus-4' },
    };
    expect(msg.type).toBe('settings_updated');
    expect(msg.settings.modelId).toBe('claude-opus-4');
  });

  it('SessionTitleUpdated has correct structure', () => {
    const msg: SessionTitleUpdated = {
      type: 'session_title_updated',
      title: 'My Session',
    };
    expect(msg.type).toBe('session_title_updated');
    expect(msg.title).toBe('My Session');
  });

  it('McpStatusChanged has correct structure', () => {
    const msg: McpStatusChanged = {
      type: 'mcp_status_changed',
      servers: [
        {
          name: 'test-server',
          status: McpServerStatus.Connected,
          source: SettingsLevel.User,
          isManaged: false,
        },
      ],
      summary: { total: 1, connected: 1, connecting: 0, failed: 0 },
    };
    expect(msg.type).toBe('mcp_status_changed');
    expect(msg.servers).toHaveLength(1);
  });

  it('MissionStateChanged has correct structure', () => {
    const msg: MissionStateChanged = {
      type: 'mission_state_changed',
      state: MissionState.Running,
    };
    expect(msg.type).toBe('mission_state_changed');
    expect(msg.state).toBe(MissionState.Running);
  });

  it('MissionFeaturesChanged has correct structure', () => {
    const msg: MissionFeaturesChanged = {
      type: 'mission_features_changed',
      features: [
        {
          id: 'feat-1',
          description: 'A feature',
          status: FeatureStatus.Pending,
          skillName: 'sdk-worker',
          preconditions: [],
          expectedBehavior: [],
          verificationSteps: [],
        },
      ],
    };
    expect(msg.type).toBe('mission_features_changed');
    expect(msg.features).toHaveLength(1);
  });

  it('MissionProgressEntry has correct structure', () => {
    const msg: MissionProgressEntry = {
      type: 'mission_progress_entry',
      progressLog: [],
    };
    expect(msg.type).toBe('mission_progress_entry');
    expect(msg.progressLog).toEqual([]);
  });

  it('MissionHeartbeat has correct structure', () => {
    const msg: MissionHeartbeat = {
      type: 'mission_heartbeat',
      timestamp: '2025-01-01T00:00:00Z',
    };
    expect(msg.type).toBe('mission_heartbeat');
    expect(msg.timestamp).toBe('2025-01-01T00:00:00Z');
  });

  it('MissionWorkerStarted has correct structure', () => {
    const msg: MissionWorkerStarted = {
      type: 'mission_worker_started',
      workerSessionId: 'ws-1',
    };
    expect(msg.type).toBe('mission_worker_started');
    expect(msg.workerSessionId).toBe('ws-1');
  });

  it('MissionWorkerCompleted has correct structure', () => {
    const msg: MissionWorkerCompleted = {
      type: 'mission_worker_completed',
      workerSessionId: 'ws-1',
      exitCode: 0,
    };
    expect(msg.type).toBe('mission_worker_completed');
    expect(msg.exitCode).toBe(0);
  });

  it('McpAuthRequired has correct structure', () => {
    const msg: McpAuthRequired = {
      type: 'mcp_auth_required',
      serverName: 'my-server',
      authUrl: 'https://auth.example.com',
      message: 'Please authenticate',
      state: 'pending',
    };
    expect(msg.type).toBe('mcp_auth_required');
    expect(msg.authUrl).toBe('https://auth.example.com');
  });

  it('McpAuthCompleted has correct structure', () => {
    const msg: McpAuthCompleted = {
      type: 'mcp_auth_completed',
      serverName: 'my-server',
      outcome: McpAuthOutcome.Success,
      message: 'Authenticated',
    };
    expect(msg.type).toBe('mcp_auth_completed');
    expect(msg.outcome).toBe(McpAuthOutcome.Success);
  });

  it('ErrorEvent has correct structure', () => {
    const msg: ErrorEvent = {
      type: 'error',
      message: 'Something went wrong',
      errorType: DroidErrorType.SESSION_ERROR,
      timestamp: '2025-01-01T00:00:00Z',
    };
    expect(msg.type).toBe('error');
    expect(msg.message).toBe('Something went wrong');
    expect(msg.errorType).toBe(DroidErrorType.SESSION_ERROR);
  });

  it('TurnComplete has correct structure', () => {
    const msg: TurnComplete = {
      type: 'turn_complete',
      tokenUsage: null,
    };
    expect(msg.type).toBe('turn_complete');
    expect(msg.tokenUsage).toBeNull();
  });

  it('TurnComplete with token usage', () => {
    const tokenUsage: TokenUsageUpdate = {
      type: 'token_usage_update',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheCreationTokens: 5,
      thinkingTokens: 20,
    };
    const msg: TurnComplete = {
      type: 'turn_complete',
      tokenUsage,
    };
    expect(msg.tokenUsage).not.toBeNull();
    expect(msg.tokenUsage!.inputTokens).toBe(100);
  });

  it('DroidMessage union type allows all 22 types', () => {
    // Verify each type is assignable to DroidMessage
    const messages: DroidMessage[] = [
      {
        type: 'assistant_text_delta',
        messageId: 'm1',
        blockIndex: 0,
        text: 'hi',
      },
      {
        type: 'thinking_text_delta',
        messageId: 'm1',
        blockIndex: 0,
        text: 'hmm',
      },
      { type: 'tool_use', toolName: 'x', toolInput: {}, toolUseId: 'tu1' },
      {
        type: 'tool_result',
        toolUseId: 'tu1',
        toolName: 'x',
        content: '',
        isError: false,
      },
      {
        type: 'tool_progress',
        toolUseId: 'tu1',
        toolName: 'x',
        content: '...',
        update: { type: 'status' },
      },
      { type: 'working_state_changed', state: DroidWorkingState.Idle },
      {
        type: 'token_usage_update',
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        thinkingTokens: 0,
      },
      {
        type: 'create_message',
        messageId: 'm1',
        role: 'assistant',
        content: [],
      },
      {
        type: 'permission_resolved',
        requestId: 'r1',
        toolUseIds: [],
        selectedOption: ToolConfirmationOutcome.Cancel,
      },
      { type: 'settings_updated', settings: {} },
      { type: 'session_title_updated', title: 't' },
      {
        type: 'mcp_status_changed',
        servers: [],
        summary: { total: 0, connected: 0, connecting: 0, failed: 0 },
      },
      { type: 'mission_state_changed', state: MissionState.Running },
      { type: 'mission_features_changed', features: [] },
      { type: 'mission_progress_entry', progressLog: [] },
      { type: 'mission_heartbeat', timestamp: 't' },
      { type: 'mission_worker_started', workerSessionId: 'ws1' },
      { type: 'mission_worker_completed', workerSessionId: 'ws1', exitCode: 0 },
      {
        type: 'mcp_auth_required',
        serverName: 's',
        authUrl: 'u',
        message: 'm',
        state: 'p',
      },
      {
        type: 'mcp_auth_completed',
        serverName: 's',
        outcome: McpAuthOutcome.Success,
        message: 'm',
      },
      { type: 'error', message: 'err', errorType: 'Error', timestamp: 't' },
      { type: 'turn_complete', tokenUsage: null },
    ];
    expect(messages).toHaveLength(22);
  });
});

// ---------------------------------------------------------------------------
// convertNotificationToStreamMessage
// ---------------------------------------------------------------------------

describe('convertNotificationToStreamMessage', () => {
  describe('assistant_text_delta', () => {
    it('converts to AssistantTextDelta', () => {
      const notification = makeNotification(
        SessionNotificationType.ASSISTANT_TEXT_DELTA,
        { messageId: 'msg-1', blockIndex: 0, textDelta: 'Hello' }
      );
      const result = convertNotificationToStreamMessage(notification);
      expect(result).not.toBeNull();
      const msg = result as AssistantTextDelta;
      expect(msg.type).toBe('assistant_text_delta');
      expect(msg.text).toBe('Hello');
      expect(msg.messageId).toBe('msg-1');
      expect(msg.blockIndex).toBe(0);
    });
  });

  describe('thinking_text_delta', () => {
    it('converts to ThinkingTextDelta', () => {
      const notification = makeNotification(
        SessionNotificationType.THINKING_TEXT_DELTA,
        { messageId: 'msg-2', blockIndex: 1, textDelta: 'Thinking...' }
      );
      const result = convertNotificationToStreamMessage(notification);
      expect(result).not.toBeNull();
      const msg = result as ThinkingTextDelta;
      expect(msg.type).toBe('thinking_text_delta');
      expect(msg.text).toBe('Thinking...');
      expect(msg.messageId).toBe('msg-2');
      expect(msg.blockIndex).toBe(1);
    });
  });

  describe('tool_result', () => {
    it('converts string content', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_RESULT,
        {
          messageId: 'msg-1',
          toolUseId: 'tu-1',
          content: 'result text',
          isError: false,
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolResult;
      expect(result.type).toBe('tool_result');
      expect(result.toolUseId).toBe('tu-1');
      expect(result.content).toBe('result text');
      expect(result.isError).toBe(false);
    });

    it('converts null content to empty string', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_RESULT,
        { messageId: 'msg-1', toolUseId: 'tu-1', content: null, isError: false }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolResult;
      expect(result.content).toBe('');
    });

    it('converts undefined content to empty string', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_RESULT,
        { messageId: 'msg-1', toolUseId: 'tu-1', isError: false }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolResult;
      expect(result.content).toBe('');
    });

    it('converts array content', () => {
      const content = [{ type: 'text', text: 'hello' }];
      const notification = makeNotification(
        SessionNotificationType.TOOL_RESULT,
        { messageId: 'msg-1', toolUseId: 'tu-1', content, isError: false }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolResult;
      expect(result.content).toEqual(content);
    });

    it('converts non-string non-array content to string', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_RESULT,
        { messageId: 'msg-1', toolUseId: 'tu-1', content: 42, isError: false }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolResult;
      expect(result.content).toBe('42');
    });

    it('sets isError from notification', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_RESULT,
        {
          messageId: 'msg-1',
          toolUseId: 'tu-1',
          content: 'error',
          isError: true,
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolResult;
      expect(result.isError).toBe(true);
    });
  });

  describe('tool_progress_update', () => {
    it('converts with text field', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_PROGRESS_UPDATE,
        {
          toolUseId: 'tu-1',
          toolName: 'execute',
          update: { type: 'status', text: 'Running command...' },
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolProgress;
      expect(result.type).toBe('tool_progress');
      expect(result.toolName).toBe('execute');
      expect(result.toolUseId).toBe('tu-1');
      expect(result.content).toBe('Running command...');
    });

    it('falls back to status field', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_PROGRESS_UPDATE,
        {
          toolUseId: 'tu-1',
          toolName: 'execute',
          update: { type: 'status', status: 'In progress' },
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolProgress;
      expect(result.content).toBe('In progress');
    });

    it('falls back to details field', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_PROGRESS_UPDATE,
        {
          toolUseId: 'tu-1',
          toolName: 'execute',
          update: { type: 'status', details: 'Detail info' },
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolProgress;
      expect(result.content).toBe('Detail info');
    });

    it('falls back to empty string when no text/status/details', () => {
      const notification = makeNotification(
        SessionNotificationType.TOOL_PROGRESS_UPDATE,
        {
          toolUseId: 'tu-1',
          toolName: 'execute',
          update: { type: 'status' },
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolProgress;
      expect(result.content).toBe('');
    });

    it('includes the full update object', () => {
      const update = {
        type: 'tool_call' as const,
        text: 'running',
        toolName: 'exec',
      };
      const notification = makeNotification(
        SessionNotificationType.TOOL_PROGRESS_UPDATE,
        { toolUseId: 'tu-1', toolName: 'execute', update }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as ToolProgress;
      expect(result.update).toStrictEqual(update);
    });
  });

  describe('droid_working_state_changed', () => {
    it('converts to WorkingStateChanged', () => {
      const notification = makeNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.ExecutingTool }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as WorkingStateChanged;
      expect(result.type).toBe('working_state_changed');
      expect(result.state).toBe(DroidWorkingState.ExecutingTool);
    });

    it('handles Idle state', () => {
      const notification = makeNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.Idle }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as WorkingStateChanged;
      expect(result.state).toBe(DroidWorkingState.Idle);
    });
  });

  describe('session_token_usage_changed', () => {
    it('converts to TokenUsageUpdate with field mapping', () => {
      const notification = makeNotification(
        SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
        {
          sessionId: 'sess-1',
          tokenUsage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadTokens: 10,
            cacheCreationTokens: 5,
            thinkingTokens: 20,
          },
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as TokenUsageUpdate;
      expect(result.type).toBe('token_usage_update');
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.cacheReadTokens).toBe(10);
      expect(result.cacheCreationTokens).toBe(5);
      expect(result.thinkingTokens).toBe(20);
    });
  });

  describe('create_message', () => {
    it('converts message with tool_use blocks to ToolUse + CreateMessage', () => {
      const notification = makeNotification(
        SessionNotificationType.CREATE_MESSAGE,
        {
          message: {
            id: 'msg-1',
            role: 'assistant',
            createdAt: 1000,
            updatedAt: 1000,
            content: [
              {
                type: 'tool_use',
                id: 'tu-1',
                name: 'read_file',
                input: { path: '/tmp/test' },
              },
              {
                type: 'tool_use',
                id: 'tu-2',
                name: 'write_file',
                input: { path: '/tmp/out', content: 'data' },
              },
            ],
          },
          parentId: 'parent-1',
        }
      );
      const result = convertNotificationToStreamMessage(notification);
      expect(Array.isArray(result)).toBe(true);
      const messages = result as DroidMessage[];
      // 2 ToolUse + 1 CreateMessage
      expect(messages).toHaveLength(3);

      // First two are ToolUse messages
      const tu1 = messages[0] as ToolUse;
      expect(tu1.type).toBe('tool_use');
      expect(tu1.toolName).toBe('read_file');
      expect(tu1.toolUseId).toBe('tu-1');
      expect(tu1.toolInput).toEqual({ path: '/tmp/test' });

      const tu2 = messages[1] as ToolUse;
      expect(tu2.type).toBe('tool_use');
      expect(tu2.toolName).toBe('write_file');
      expect(tu2.toolUseId).toBe('tu-2');

      // Last is CreateMessage
      const cm = messages[2] as CreateMessage;
      expect(cm.type).toBe('create_message');
      expect(cm.messageId).toBe('msg-1');
      expect(cm.role).toBe('assistant');
      expect(cm.parentId).toBe('parent-1');
    });

    it('converts message without tool_use blocks to just CreateMessage', () => {
      const notification = makeNotification(
        SessionNotificationType.CREATE_MESSAGE,
        {
          message: {
            id: 'msg-1',
            role: 'assistant',
            createdAt: 1000,
            updatedAt: 1000,
            content: [{ type: 'text', text: 'hello' }],
          },
        }
      );
      const result = convertNotificationToStreamMessage(notification);
      expect(Array.isArray(result)).toBe(true);
      const messages = result as DroidMessage[];
      // Only CreateMessage (no ToolUse blocks)
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('create_message');
    });

    it('handles empty content array', () => {
      const notification = makeNotification(
        SessionNotificationType.CREATE_MESSAGE,
        {
          message: {
            id: 'msg-1',
            role: 'assistant',
            createdAt: 1000,
            updatedAt: 1000,
            content: [],
          },
        }
      );
      const result = convertNotificationToStreamMessage(notification);
      expect(Array.isArray(result)).toBe(true);
      const messages = result as DroidMessage[];
      expect(messages).toHaveLength(1);
      expect(messages[0].type).toBe('create_message');
    });
  });

  describe('error', () => {
    it('converts to ErrorEvent', () => {
      const notification = makeNotification(SessionNotificationType.ERROR, {
        message: 'Something went wrong',
        errorType: DroidErrorType.SESSION_ERROR,
        timestamp: '2025-01-01T00:00:00Z',
      });
      const result = convertNotificationToStreamMessage(
        notification
      ) as ErrorEvent;
      expect(result.type).toBe('error');
      expect(result.message).toBe('Something went wrong');
      expect(result.errorType).toBe(DroidErrorType.SESSION_ERROR);
      expect(result.timestamp).toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('permission_resolved', () => {
    it('converts to PermissionResolved', () => {
      const notification = makeNotification(
        SessionNotificationType.PERMISSION_RESOLVED,
        {
          requestId: 'req-1',
          toolUseIds: ['tu-1'],
          selectedOption: ToolConfirmationOutcome.ProceedOnce,
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as PermissionResolved;
      expect(result.type).toBe('permission_resolved');
      expect(result.requestId).toBe('req-1');
      expect(result.toolUseIds).toEqual(['tu-1']);
      expect(result.selectedOption).toBe(ToolConfirmationOutcome.ProceedOnce);
    });
  });

  describe('settings_updated', () => {
    it('converts to SettingsUpdated', () => {
      const notification = makeNotification(
        SessionNotificationType.SETTINGS_UPDATED,
        { settings: { modelId: 'claude-opus-4' } }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as SettingsUpdated;
      expect(result.type).toBe('settings_updated');
      expect(result.settings).toEqual({ modelId: 'claude-opus-4' });
    });
  });

  describe('session_title_updated', () => {
    it('converts to SessionTitleUpdated', () => {
      const notification = makeNotification(
        SessionNotificationType.SESSION_TITLE_UPDATED,
        { title: 'My Session' }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as SessionTitleUpdated;
      expect(result.type).toBe('session_title_updated');
      expect(result.title).toBe('My Session');
    });
  });

  describe('mcp_status_changed', () => {
    it('converts to McpStatusChanged', () => {
      const servers = [
        {
          name: 'test-server',
          status: McpServerStatus.Connected,
          source: SettingsLevel.User,
          isManaged: false,
        },
      ];
      const summary = { total: 1, connected: 1, connecting: 0, failed: 0 };
      const notification = makeNotification(
        SessionNotificationType.MCP_STATUS_CHANGED,
        { servers, summary }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as McpStatusChanged;
      expect(result.type).toBe('mcp_status_changed');
      expect(result.servers).toEqual(servers);
      expect(result.summary).toEqual(summary);
    });
  });

  describe('mission_state_changed', () => {
    it('converts to MissionStateChanged', () => {
      const notification = makeNotification(
        SessionNotificationType.MISSION_STATE_CHANGED,
        { state: MissionState.Running }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as MissionStateChanged;
      expect(result.type).toBe('mission_state_changed');
      expect(result.state).toBe(MissionState.Running);
    });
  });

  describe('mission_features_changed', () => {
    it('converts to MissionFeaturesChanged', () => {
      const features = [
        {
          id: 'feat-1',
          description: 'A feature',
          status: FeatureStatus.Pending,
          skillName: 'sdk-worker',
          preconditions: [],
          expectedBehavior: [],
          verificationSteps: [],
        },
      ];
      const notification = makeNotification(
        SessionNotificationType.MISSION_FEATURES_CHANGED,
        { features }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as MissionFeaturesChanged;
      expect(result.type).toBe('mission_features_changed');
      expect(result.features).toEqual(features);
    });
  });

  describe('mission_progress_entry', () => {
    it('converts to MissionProgressEntry', () => {
      const progressLog = [
        {
          type: 'mission_accepted',
          timestamp: '2025-01-01T00:00:00Z',
          title: 'Test',
        },
      ];
      const notification = makeNotification(
        SessionNotificationType.MISSION_PROGRESS_ENTRY,
        { progressLog }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as MissionProgressEntry;
      expect(result.type).toBe('mission_progress_entry');
      expect(result.progressLog).toEqual(progressLog);
    });
  });

  describe('mission_heartbeat', () => {
    it('converts to MissionHeartbeat', () => {
      const notification = makeNotification(
        SessionNotificationType.MISSION_HEARTBEAT,
        { timestamp: '2025-01-01T00:00:00Z' }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as MissionHeartbeat;
      expect(result.type).toBe('mission_heartbeat');
      expect(result.timestamp).toBe('2025-01-01T00:00:00Z');
    });
  });

  describe('mission_worker_started', () => {
    it('converts to MissionWorkerStarted', () => {
      const notification = makeNotification(
        SessionNotificationType.MISSION_WORKER_STARTED,
        { workerSessionId: 'ws-1' }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as MissionWorkerStarted;
      expect(result.type).toBe('mission_worker_started');
      expect(result.workerSessionId).toBe('ws-1');
    });
  });

  describe('mission_worker_completed', () => {
    it('converts to MissionWorkerCompleted', () => {
      const notification = makeNotification(
        SessionNotificationType.MISSION_WORKER_COMPLETED,
        { workerSessionId: 'ws-1', exitCode: 0 }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as MissionWorkerCompleted;
      expect(result.type).toBe('mission_worker_completed');
      expect(result.workerSessionId).toBe('ws-1');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('mcp_auth_required', () => {
    it('converts to McpAuthRequired', () => {
      const notification = makeNotification(
        SessionNotificationType.MCP_AUTH_REQUIRED,
        {
          serverName: 'my-server',
          authUrl: 'https://auth.example.com',
          message: 'Please authenticate',
          state: 'pending',
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as McpAuthRequired;
      expect(result.type).toBe('mcp_auth_required');
      expect(result.serverName).toBe('my-server');
      expect(result.authUrl).toBe('https://auth.example.com');
      expect(result.message).toBe('Please authenticate');
      expect(result.state).toBe('pending');
    });
  });

  describe('mcp_auth_completed', () => {
    it('converts to McpAuthCompleted', () => {
      const notification = makeNotification(
        SessionNotificationType.MCP_AUTH_COMPLETED,
        {
          serverName: 'my-server',
          outcome: McpAuthOutcome.Success,
          message: 'Authenticated successfully',
        }
      );
      const result = convertNotificationToStreamMessage(
        notification
      ) as McpAuthCompleted;
      expect(result.type).toBe('mcp_auth_completed');
      expect(result.serverName).toBe('my-server');
      expect(result.outcome).toBe(McpAuthOutcome.Success);
      expect(result.message).toBe('Authenticated successfully');
    });
  });

  describe('unknown notification type', () => {
    it('returns null for unknown types', () => {
      const notification = makeNotification('completely_unknown_type', {
        data: 'something',
      });
      const result = convertNotificationToStreamMessage(notification);
      expect(result).toBeNull();
    });

    it('does not throw for unknown types', () => {
      expect(() => {
        convertNotificationToStreamMessage({ type: 'unknown_type_xyz' });
      }).not.toThrow();
    });
  });

  describe('all 20 notification types are handled', () => {
    // Enumerate all SessionNotificationType values and verify each one is handled
    const allNotificationTypes = Object.values(SessionNotificationType);

    it('covers all 20 SessionNotificationType values', () => {
      expect(allNotificationTypes).toHaveLength(20);
    });

    it('every notification type returns a non-null result (with valid payloads)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const payloads: Record<string, Record<string, unknown>> = {
        [SessionNotificationType.ASSISTANT_TEXT_DELTA]: {
          messageId: 'm',
          blockIndex: 0,
          textDelta: 't',
        },
        [SessionNotificationType.THINKING_TEXT_DELTA]: {
          messageId: 'm',
          blockIndex: 0,
          textDelta: 't',
        },
        [SessionNotificationType.TOOL_RESULT]: {
          messageId: 'm',
          toolUseId: 'tu',
          content: 'c',
          isError: false,
        },
        [SessionNotificationType.TOOL_PROGRESS_UPDATE]: {
          toolUseId: 'tu',
          toolName: 'n',
          update: { type: 'status', text: 't' },
        },
        [SessionNotificationType.DROID_WORKING_STATE_CHANGED]: {
          newState: DroidWorkingState.Idle,
        },
        [SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED]: {
          sessionId: 's',
          tokenUsage: {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            thinkingTokens: 0,
          },
        },
        [SessionNotificationType.CREATE_MESSAGE]: {
          message: {
            id: 'm',
            role: 'assistant',
            createdAt: 1000,
            updatedAt: 1000,
            content: [],
          },
        },
        [SessionNotificationType.ERROR]: {
          message: 'err',
          errorType: DroidErrorType.SESSION_ERROR,
          timestamp: 't',
        },
        [SessionNotificationType.PERMISSION_RESOLVED]: {
          requestId: 'r',
          toolUseIds: [],
          selectedOption: 'cancel',
        },
        [SessionNotificationType.SETTINGS_UPDATED]: { settings: {} },
        [SessionNotificationType.SESSION_TITLE_UPDATED]: { title: 't' },
        [SessionNotificationType.MCP_STATUS_CHANGED]: {
          servers: [],
          summary: { total: 0, connected: 0, connecting: 0, failed: 0 },
        },
        [SessionNotificationType.MISSION_STATE_CHANGED]: {
          state: MissionState.Running,
        },
        [SessionNotificationType.MISSION_FEATURES_CHANGED]: { features: [] },
        [SessionNotificationType.MISSION_PROGRESS_ENTRY]: { progressLog: [] },
        [SessionNotificationType.MISSION_HEARTBEAT]: { timestamp: 't' },
        [SessionNotificationType.MISSION_WORKER_STARTED]: {
          workerSessionId: 'ws',
        },
        [SessionNotificationType.MISSION_WORKER_COMPLETED]: {
          workerSessionId: 'ws',
          exitCode: 0,
        },
        [SessionNotificationType.MCP_AUTH_REQUIRED]: {
          serverName: 's',
          authUrl: 'u',
          message: 'm',
          state: 'p',
        },
        [SessionNotificationType.MCP_AUTH_COMPLETED]: {
          serverName: 's',
          outcome: McpAuthOutcome.Success,
          message: 'm',
        },
      };

      for (const notifType of allNotificationTypes) {
        const payload = payloads[notifType];
        expect(payload, `Missing test payload for ${notifType}`).toBeDefined();
        const notification = makeNotification(notifType, payload);
        const result = convertNotificationToStreamMessage(notification);
        expect(
          result,
          `Converter returned null for ${notifType}`
        ).not.toBeNull();
      }

      // No warnings should have been logged (all types are known)
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// StreamStateTracker
// ---------------------------------------------------------------------------

describe('StreamStateTracker', () => {
  let tracker: StreamStateTracker;

  beforeEach(() => {
    tracker = new StreamStateTracker();
  });

  describe('TurnComplete emission', () => {
    it('emits TurnComplete on non-idle → idle transition', () => {
      // Go non-idle
      const r1 = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      expect(r1.additional).toEqual([]);

      // Go idle
      const r2 = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r2.additional).toHaveLength(1);
      expect(r2.additional[0].type).toBe('turn_complete');
      expect((r2.additional[0] as TurnComplete).tokenUsage).toBeNull();
    });

    it('does NOT emit TurnComplete for initial idle', () => {
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(result.additional).toEqual([]);
    });

    it('does NOT emit TurnComplete for non-idle → non-idle transitions', () => {
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.ExecutingTool,
      });
      expect(result.additional).toEqual([]);
    });

    it('emits TurnComplete after multiple non-idle states', () => {
      // streaming → executing → idle
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.ExecutingTool,
      });
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(result.additional).toHaveLength(1);
      expect(result.additional[0].type).toBe('turn_complete');
    });

    it('can emit TurnComplete again after reset', () => {
      // First turn
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      // Reset for second turn
      tracker = new StreamStateTracker();

      // Initial idle after reset should NOT emit TurnComplete
      const r1 = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r1.additional).toEqual([]);

      // Go non-idle then idle again
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.ExecutingTool,
      });
      const r2 = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r2.additional).toHaveLength(1);
      expect(r2.additional[0].type).toBe('turn_complete');
    });
  });

  describe('TokenUsage propagation to TurnComplete', () => {
    it('carries last-seen TokenUsageUpdate in TurnComplete', () => {
      const tokenUsage: TokenUsageUpdate = {
        type: 'token_usage_update',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheCreationTokens: 5,
        thinkingTokens: 20,
      };

      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      tracker.processMessage(tokenUsage);
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      expect(result.additional).toHaveLength(1);
      const tc = result.additional[0] as TurnComplete;
      expect(tc.type).toBe('turn_complete');
      expect(tc.tokenUsage).not.toBeNull();
      expect(tc.tokenUsage!.inputTokens).toBe(100);
      expect(tc.tokenUsage!.outputTokens).toBe(50);
      expect(tc.tokenUsage!.cacheReadTokens).toBe(10);
      expect(tc.tokenUsage!.cacheCreationTokens).toBe(5);
      expect(tc.tokenUsage!.thinkingTokens).toBe(20);
    });

    it('uses the LAST token usage update when multiple are received', () => {
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      tracker.processMessage({
        type: 'token_usage_update',
        inputTokens: 50,
        outputTokens: 25,
        cacheReadTokens: 5,
        cacheCreationTokens: 2,
        thinkingTokens: 10,
      });
      tracker.processMessage({
        type: 'token_usage_update',
        inputTokens: 200,
        outputTokens: 100,
        cacheReadTokens: 20,
        cacheCreationTokens: 10,
        thinkingTokens: 40,
      });

      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      const tc = result.additional[0] as TurnComplete;
      expect(tc.tokenUsage!.inputTokens).toBe(200);
      expect(tc.tokenUsage!.outputTokens).toBe(100);
    });

    it('returns null tokenUsage when no TokenUsageUpdate was received', () => {
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      const tc = result.additional[0] as TurnComplete;
      expect(tc.tokenUsage).toBeNull();
    });

    it('token usage is reset after reset()', () => {
      // First turn with token usage
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      tracker.processMessage({
        type: 'token_usage_update',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 10,
        cacheCreationTokens: 5,
        thinkingTokens: 20,
      });
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      // Reset
      tracker = new StreamStateTracker();

      // Second turn without token usage
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.ExecutingTool,
      });
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      const tc = result.additional[0] as TurnComplete;
      expect(tc.tokenUsage).toBeNull();
    });
  });

  describe('tool name tracking', () => {
    it('enriches tool_result with toolName from prior tool_use', () => {
      tracker.processMessage({
        type: 'tool_use',
        toolName: 'read_file',
        toolInput: { path: '/tmp/test' },
        toolUseId: 'tu-1',
      });
      const { message } = tracker.processMessage({
        type: 'tool_result',
        toolUseId: 'tu-1',
        toolName: '',
        content: 'file contents',
        isError: false,
      });
      expect(message.type).toBe('tool_result');
      expect((message as ToolResult).toolName).toBe('read_file');
    });

    it('enriches tool_results from multiple tool_use mappings', () => {
      tracker.processMessage({
        type: 'tool_use',
        toolName: 'read_file',
        toolInput: {},
        toolUseId: 'tu-1',
      });
      tracker.processMessage({
        type: 'tool_use',
        toolName: 'write_file',
        toolInput: {},
        toolUseId: 'tu-2',
      });
      const r1 = tracker.processMessage({
        type: 'tool_result',
        toolUseId: 'tu-1',
        toolName: '',
        content: '',
        isError: false,
      });
      const r2 = tracker.processMessage({
        type: 'tool_result',
        toolUseId: 'tu-2',
        toolName: '',
        content: '',
        isError: false,
      });
      expect((r1.message as ToolResult).toolName).toBe('read_file');
      expect((r2.message as ToolResult).toolName).toBe('write_file');
    });

    it('returns empty string toolName for unknown toolUseId', () => {
      const { message } = tracker.processMessage({
        type: 'tool_result',
        toolUseId: 'unknown-id',
        toolName: '',
        content: '',
        isError: false,
      });
      expect((message as ToolResult).toolName).toBe('');
    });
  });

  describe('non-working-state messages pass through', () => {
    it('returns empty additional array for non-state-change messages', () => {
      const textDelta: DroidMessage = {
        type: 'assistant_text_delta',
        messageId: 'm1',
        blockIndex: 0,
        text: 'hello',
      };
      const result = tracker.processMessage(textDelta);
      expect(result.additional).toEqual([]);
    });

    it('returns empty additional array for tool_use messages', () => {
      const result = tracker.processMessage({
        type: 'tool_use',
        toolName: 'read_file',
        toolInput: {},
        toolUseId: 'tu-1',
      });
      expect(result.additional).toEqual([]);
    });

    it('returns empty additional array for error messages', () => {
      const result = tracker.processMessage({
        type: 'error',
        message: 'err',
        errorType: 'Error',
        timestamp: 't',
      });
      expect(result.additional).toEqual([]);
    });
  });

  describe('multi-turn tracking independence', () => {
    it('each tracker instance tracks independently', () => {
      const tracker1 = new StreamStateTracker();
      const tracker2 = new StreamStateTracker();

      // Tracker 1 goes non-idle
      tracker1.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });

      // Tracker 2 receives idle — should NOT emit TurnComplete
      const r2 = tracker2.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r2.additional).toEqual([]);

      // Tracker 1 goes idle — SHOULD emit TurnComplete
      const r1 = tracker1.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r1.additional).toHaveLength(1);
      expect(r1.additional[0].type).toBe('turn_complete');
    });

    it('simulates multi-turn session with reset between turns', () => {
      // Turn 1
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });
      tracker.processMessage({
        type: 'token_usage_update',
        inputTokens: 50,
        outputTokens: 25,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        thinkingTokens: 0,
      });
      const turn1Result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(turn1Result.additional).toHaveLength(1);
      expect(
        (turn1Result.additional[0] as TurnComplete).tokenUsage!.inputTokens
      ).toBe(50);

      // Reset between turns
      tracker = new StreamStateTracker();

      // Turn 2
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.ExecutingTool,
      });
      tracker.processMessage({
        type: 'token_usage_update',
        inputTokens: 200,
        outputTokens: 100,
        cacheReadTokens: 10,
        cacheCreationTokens: 5,
        thinkingTokens: 30,
      });
      const turn2Result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(turn2Result.additional).toHaveLength(1);
      expect(
        (turn2Result.additional[0] as TurnComplete).tokenUsage!.inputTokens
      ).toBe(200);
    });
  });

  describe('edge cases', () => {
    it('handles rapid idle→non-idle→idle transitions', () => {
      // Start idle (initial)
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });

      // Go non-idle
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });

      // Go idle again — should emit TurnComplete
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(result.additional).toHaveLength(1);
      expect(result.additional[0].type).toBe('turn_complete');
    });

    it('handles WaitingForToolConfirmation as non-idle', () => {
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.WaitingForToolConfirmation,
      });
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(result.additional).toHaveLength(1);
      expect(result.additional[0].type).toBe('turn_complete');
    });

    it('handles CompactingConversation as non-idle', () => {
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.CompactingConversation,
      });
      const result = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(result.additional).toHaveLength(1);
      expect(result.additional[0].type).toBe('turn_complete');
    });

    it('multiple idle transitions after non-idle only emit first TurnComplete (no duplicate)', () => {
      tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.StreamingAssistantMessage,
      });

      // First idle → TurnComplete
      const r1 = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r1.additional).toHaveLength(1);

      // Second idle → no TurnComplete (hasBeenNonIdle is reset after emission)
      const r2 = tracker.processMessage({
        type: 'working_state_changed',
        state: DroidWorkingState.Idle,
      });
      expect(r2.additional).toHaveLength(0);
    });
  });
});
