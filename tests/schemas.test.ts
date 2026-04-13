import { describe, it, expect } from 'vitest';

import {
  // Enums
  AutonomyLevel,
  AutonomyMode,
  DecompSessionType,
  DismissalType,
  DroidClientMethod,
  DroidErrorType,
  DroidInteractionMode,
  DroidServerMethod,
  DroidWorkingState,
  FeatureStatus,
  FeatureSuccessState,
  IssueSeverity,
  JsonRpcErrorCode,
  JsonRpcMessageType,
  McpAuthOutcome,
  McpServerStatus,
  McpServerType,
  McpStatus,
  MissionState,
  ModelProvider,
  ProgressLogEntryType,
  ReasoningEffort,
  SessionNotificationType,
  SettingsLevel,
  SkillLocation,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  // Constants
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  FACTORY_PROTOCOL_VERSION,
  FACTORY_CLIENT_HEADER,
  FACTORY_CLIENT_VERSION,
  DEFAULT_REQUEST_TIMEOUT,
  SESSION_INIT_TIMEOUT,
  MCP_AUTH_TIMEOUT,
  // Shared schemas
  JsonRpcEnvelopeSchema,
  JsonRpcRequestSchema,
  JsonRpcResponseSuccessSchema,
  JsonRpcResponseFailureSchema,
  JsonRpcNotificationSchema,
  JsonRpcErrorSchema,
  TraceContextMetaSchema,
  // Messages schemas
  TextBlockSchema,
  ImageBlockSchema,
  ThinkingBlockSchema,
  ToolUseBlockSchema,
  ToolResultBlockSchema,
  ContentBlockSchema,
  FactoryDroidMessageSchema,
  DocumentSourceSchema,
  // MCP schemas
  McpServerStatusInfoSchema,
  McpStatusSummarySchema,
  McpRegistryServerSchema,
  McpToolInfoSchema,
  McpToolInputSchemaSchema,
  ToolConfirmationListItemSchema,
  // Mission schemas
  MissionFeatureSchema,
  ProgressLogEntrySchema,
  DiscoveredIssueSchema,
  HandoffSchema,
  // Client schemas
  InitializeSessionRequestParamsSchema,
  LoadSessionRequestParamsSchema,
  AddUserMessageRequestParamsSchema,
  InterruptSessionRequestParamsSchema,
  KillWorkerSessionRequestParamsSchema,
  UpdateSessionSettingsRequestParamsSchema,
  ToggleMcpServerRequestParamsSchema,
  AuthenticateMcpServerRequestParamsSchema,
  CancelMcpAuthRequestParamsSchema,
  ClearMcpAuthRequestParamsSchema,
  SubmitMcpAuthCodeRequestParamsSchema,
  AddMcpServerRequestParamsSchema,
  RemoveMcpServerRequestParamsSchema,
  ListMcpRegistryRequestParamsSchema,
  ListMcpToolsRequestParamsSchema,
  ListMcpServersRequestParamsSchema,
  ToggleMcpToolRequestParamsSchema,
  ListSkillsRequestParamsSchema,
  SubmitBugReportRequestParamsSchema,
  InitializeSessionResultSchema,
  LoadSessionResultSchema,
  TokenUsageSchema,
  SessionSettingsSchema,
  ClientRequestSchema,
  // Server schemas
  AssistantTextDeltaNotificationSchema,
  ThinkingTextDeltaNotificationSchema,
  ToolResultNotificationSchema,
  ToolProgressUpdateNotificationSchema,
  CreateMessageNotificationSchema,
  ErrorNotificationSchema,
  DroidWorkingStateChangedNotificationSchema,
  PermissionResolvedNotificationSchema,
  SettingsUpdatedNotificationSchema,
  SessionTitleUpdatedNotificationSchema,
  McpStatusChangedNotificationSchema,
  SessionTokenUsageChangedNotificationSchema,
  MissionStateChangedNotificationSchema,
  MissionFeaturesChangedNotificationSchema,
  MissionProgressEntryNotificationSchema,
  MissionHeartbeatNotificationSchema,
  MissionWorkerStartedNotificationSchema,
  MissionWorkerCompletedNotificationSchema,
  McpAuthRequiredNotificationSchema,
  McpAuthCompletedNotificationSchema,
  SessionNotificationPayloadSchema,
  RequestPermissionRequestParamsSchema,
  RequestPermissionResultSchema,
  AskUserRequestParamsSchema,
  AskUserResultSchema,
  // Rewind / Compact / Fork schemas
  COMPACTION_TIMEOUT,
  REWIND_TIMEOUT,
  RewindFileSnapshotSchema,
  RewindFileCreationSchema,
  RewindEvictedFileSchema,
  GetRewindInfoRequestParamsSchema,
  GetRewindInfoResultSchema,
  ExecuteRewindRequestParamsSchema,
  ExecuteRewindResultSchema,
  CompactSessionRequestParamsSchema,
  CompactSessionResultSchema,
  ForkSessionRequestParamsSchema,
  ForkSessionResultSchema,
  RenameSessionRequestParamsSchema,
  RenameSessionResultSchema,
} from '../src/schemas/index.js';

// ============================================================
// Enums
// ============================================================

describe('enums', () => {
  it('DroidServerMethod has all 24 methods', () => {
    const values = Object.values(DroidServerMethod);
    expect(values).toHaveLength(24);
    expect(values).toContain('droid.initialize_session');
    expect(values).toContain('droid.load_session');
    expect(values).toContain('droid.add_user_message');
    expect(values).toContain('droid.interrupt_session');
    expect(values).toContain('droid.kill_worker_session');
    expect(values).toContain('droid.update_session_settings');
    expect(values).toContain('droid.toggle_mcp_server');
    expect(values).toContain('droid.authenticate_mcp_server');
    expect(values).toContain('droid.cancel_mcp_auth');
    expect(values).toContain('droid.clear_mcp_auth');
    expect(values).toContain('droid.add_mcp_server');
    expect(values).toContain('droid.remove_mcp_server');
    expect(values).toContain('droid.list_mcp_registry');
    expect(values).toContain('droid.list_mcp_tools');
    expect(values).toContain('droid.list_mcp_servers');
    expect(values).toContain('droid.toggle_mcp_tool');
    expect(values).toContain('droid.submit_mcp_auth_code');
    expect(values).toContain('droid.list_skills');
    expect(values).toContain('droid.submit_bug_report');
    expect(values).toContain('droid.get_rewind_info');
    expect(values).toContain('droid.execute_rewind');
    expect(values).toContain('droid.compact_session');
    expect(values).toContain('droid.fork_session');
    expect(values).toContain('droid.rename_session');
  });

  it('DroidClientMethod has all 3 methods', () => {
    expect(DroidClientMethod.SESSION_NOTIFICATION).toBe(
      'droid.session_notification'
    );
    expect(DroidClientMethod.REQUEST_PERMISSION).toBe(
      'droid.request_permission'
    );
    expect(DroidClientMethod.ASK_USER).toBe('droid.ask_user');
  });

  it('SessionNotificationType has 20 types', () => {
    const values = Object.values(SessionNotificationType);
    expect(values).toHaveLength(20);
    expect(values).toContain('assistant_text_delta');
    expect(values).toContain('thinking_text_delta');
    expect(values).toContain('tool_result');
    expect(values).toContain('tool_progress_update');
    expect(values).toContain('create_message');
    expect(values).toContain('error');
    expect(values).toContain('droid_working_state_changed');
    expect(values).toContain('permission_resolved');
    expect(values).toContain('settings_updated');
    expect(values).toContain('session_title_updated');
    expect(values).toContain('mcp_status_changed');
    expect(values).toContain('session_token_usage_changed');
    expect(values).toContain('mission_state_changed');
    expect(values).toContain('mission_features_changed');
    expect(values).toContain('mission_progress_entry');
    expect(values).toContain('mission_heartbeat');
    expect(values).toContain('mission_worker_started');
    expect(values).toContain('mission_worker_completed');
    expect(values).toContain('mcp_auth_required');
    expect(values).toContain('mcp_auth_completed');
  });

  it('ToolConfirmationOutcome has correct values', () => {
    expect(ToolConfirmationOutcome.ProceedOnce).toBe('proceed_once');
    expect(ToolConfirmationOutcome.ProceedAlways).toBe('proceed_always');
    expect(ToolConfirmationOutcome.ProceedAutoRun).toBe('proceed_auto_run');
    expect(ToolConfirmationOutcome.Cancel).toBe('cancel');
    expect(Object.values(ToolConfirmationOutcome)).toHaveLength(8);
  });

  it('ToolConfirmationType has correct values', () => {
    expect(ToolConfirmationType.Edit).toBe('edit');
    expect(ToolConfirmationType.Execute).toBe('exec');
    expect(ToolConfirmationType.Create).toBe('create');
    expect(ToolConfirmationType.McpTool).toBe('mcp_tool');
    expect(Object.values(ToolConfirmationType)).toHaveLength(9);
  });

  it('DroidWorkingState has correct values', () => {
    expect(DroidWorkingState.Idle).toBe('idle');
    expect(DroidWorkingState.StreamingAssistantMessage).toBe(
      'streaming_assistant_message'
    );
    expect(DroidWorkingState.ExecutingTool).toBe('executing_tool');
    expect(Object.values(DroidWorkingState)).toHaveLength(5);
  });

  it('DroidErrorType has correct values', () => {
    expect(DroidErrorType.CONNECTION_ERROR).toBe('ConnectionError');
    expect(DroidErrorType.PROTOCOL_ERROR).toBe('ProtocolError');
    expect(DroidErrorType.ERROR).toBe('Error');
    expect(Object.values(DroidErrorType)).toHaveLength(7);
  });

  it('McpServerStatus has correct values', () => {
    expect(McpServerStatus.Connected).toBe('connected');
    expect(McpServerStatus.Disconnected).toBe('disconnected');
    expect(McpServerStatus.Failed).toBe('failed');
    expect(Object.values(McpServerStatus)).toHaveLength(5);
  });

  it('McpServerType has correct values', () => {
    expect(McpServerType.Stdio).toBe('stdio');
    expect(McpServerType.Http).toBe('http');
    expect(McpServerType.Sse).toBe('sse');
  });

  it('McpAuthOutcome has correct values', () => {
    expect(McpAuthOutcome.Success).toBe('success');
    expect(McpAuthOutcome.Cancelled).toBe('cancelled');
    expect(McpAuthOutcome.Failed).toBe('failed');
  });

  it('DecompSessionType has correct values', () => {
    expect(DecompSessionType.Orchestrator).toBe('orchestrator');
    expect(DecompSessionType.Worker).toBe('worker');
  });

  it('MissionState has correct values', () => {
    expect(MissionState.AwaitingInput).toBe('awaiting_input');
    expect(MissionState.Running).toBe('running');
    expect(MissionState.Completed).toBe('completed');
    expect(Object.values(MissionState)).toHaveLength(6);
  });

  it('FeatureStatus has correct values', () => {
    expect(FeatureStatus.Pending).toBe('pending');
    expect(FeatureStatus.InProgress).toBe('in_progress');
    expect(FeatureStatus.Completed).toBe('completed');
    expect(FeatureStatus.Cancelled).toBe('cancelled');
  });

  it('FeatureSuccessState has correct values', () => {
    expect(FeatureSuccessState.Success).toBe('success');
    expect(FeatureSuccessState.Partial).toBe('partial');
    expect(FeatureSuccessState.Failure).toBe('failure');
  });

  it('ProgressLogEntryType has all 11 types', () => {
    expect(Object.values(ProgressLogEntryType)).toHaveLength(11);
    expect(ProgressLogEntryType.MissionAccepted).toBe('mission_accepted');
    expect(ProgressLogEntryType.WorkerCompleted).toBe('worker_completed');
  });

  it('DroidInteractionMode has correct values', () => {
    expect(DroidInteractionMode.Auto).toBe('auto');
    expect(DroidInteractionMode.Spec).toBe('spec');
    expect(DroidInteractionMode.AGI).toBe('agi');
  });

  it('AutonomyLevel has correct values', () => {
    expect(AutonomyLevel.Off).toBe('off');
    expect(AutonomyLevel.Low).toBe('low');
    expect(AutonomyLevel.Medium).toBe('medium');
    expect(AutonomyLevel.High).toBe('high');
  });

  it('ReasoningEffort has correct values', () => {
    expect(ReasoningEffort.None).toBe('none');
    expect(ReasoningEffort.Low).toBe('low');
    expect(ReasoningEffort.High).toBe('high');
    expect(ReasoningEffort.Max).toBe('max');
    expect(Object.values(ReasoningEffort)).toHaveLength(9);
  });

  it('JsonRpcErrorCode has correct values', () => {
    expect(JsonRpcErrorCode.PARSE_ERROR).toBe(-32700);
    expect(JsonRpcErrorCode.ENTITY_NOT_FOUND).toBe(-32004);
    expect(JsonRpcErrorCode.SESSION_DISCONNECTED).toBe(-32005);
  });

  it('AutonomyMode, McpStatus, ModelProvider, etc. exist', () => {
    expect(AutonomyMode.Normal).toBe('normal');
    expect(McpStatus.Ready).toBe('ready');
    expect(ModelProvider.ANTHROPIC).toBe('anthropic');
    expect(JsonRpcMessageType.Request).toBe('request');
    expect(SettingsLevel.User).toBe('user');
    expect(SkillLocation.Builtin).toBe('builtin');
    expect(DismissalType.DiscoveredIssue).toBe('discovered_issue');
    expect(IssueSeverity.Blocking).toBe('blocking');
  });
});

// ============================================================
// Constants
// ============================================================

describe('constants', () => {
  it('JSONRPC_VERSION is 2.0', () => {
    expect(JSONRPC_VERSION).toBe('2.0');
  });

  it('LEGACY_FACTORY_API_VERSION is 1.0.0', () => {
    expect(LEGACY_FACTORY_API_VERSION).toBe('1.0.0');
  });

  it('FACTORY_PROTOCOL_VERSION is 1.2.0', () => {
    expect(FACTORY_PROTOCOL_VERSION).toBe('1.2.0');
  });

  it('FACTORY_CLIENT_HEADER is X-Factory-Client', () => {
    expect(FACTORY_CLIENT_HEADER).toBe('X-Factory-Client');
  });

  it('FACTORY_CLIENT_VERSION is X-Client-Version', () => {
    expect(FACTORY_CLIENT_VERSION).toBe('X-Client-Version');
  });

  it('timeout constants have correct values', () => {
    expect(DEFAULT_REQUEST_TIMEOUT).toBe(30_000);
    expect(SESSION_INIT_TIMEOUT).toBe(60_000);
    expect(MCP_AUTH_TIMEOUT).toBe(300_000);
  });
});

// ============================================================
// Shared (JSON-RPC envelope)
// ============================================================

const envelope = {
  jsonrpc: '2.0' as const,
  factoryApiVersion: '1.0.0' as const,
  factoryProtocolVersion: '1.2.0',
};

describe('shared JSON-RPC schemas', () => {
  it('JsonRpcEnvelopeSchema parses valid envelope', () => {
    const result = JsonRpcEnvelopeSchema.parse(envelope);
    expect(result.jsonrpc).toBe('2.0');
    expect(result.factoryApiVersion).toBe('1.0.0');
    expect(result.factoryProtocolVersion).toBe('1.2.0');
  });

  it('JsonRpcEnvelopeSchema rejects wrong jsonrpc version', () => {
    expect(() =>
      JsonRpcEnvelopeSchema.parse({ ...envelope, jsonrpc: '1.0' })
    ).toThrow();
  });

  it('JsonRpcEnvelopeSchema rejects wrong factoryApiVersion', () => {
    expect(() =>
      JsonRpcEnvelopeSchema.parse({ ...envelope, factoryApiVersion: '2.0.0' })
    ).toThrow();
  });

  it('JsonRpcRequestSchema parses valid request', () => {
    const req = {
      ...envelope,
      type: 'request',
      id: 'req-1',
      method: 'droid.initialize_session',
      params: { machineId: 'm1', cwd: '/tmp' },
    };
    const result = JsonRpcRequestSchema.parse(req);
    expect(result.type).toBe('request');
    expect(result.id).toBe('req-1');
    expect(result.method).toBe('droid.initialize_session');
  });

  it('JsonRpcResponseSuccessSchema parses valid success response', () => {
    const res = {
      ...envelope,
      type: 'response',
      id: 'res-1',
      result: { sessionId: 's1' },
    };
    const result = JsonRpcResponseSuccessSchema.parse(res);
    expect(result.type).toBe('response');
    expect(result.id).toBe('res-1');
  });

  it('JsonRpcResponseFailureSchema parses valid failure response', () => {
    const res = {
      ...envelope,
      type: 'response',
      id: 'res-1',
      error: { code: -32600, message: 'Invalid request' },
    };
    const result = JsonRpcResponseFailureSchema.parse(res);
    expect(result.error.code).toBe(-32600);
    expect(result.error.message).toBe('Invalid request');
  });

  it('JsonRpcNotificationSchema parses valid notification', () => {
    const notif = {
      ...envelope,
      type: 'notification',
      method: 'droid.session_notification',
      params: { notification: { type: 'assistant_text_delta' } },
    };
    const result = JsonRpcNotificationSchema.parse(notif);
    expect(result.type).toBe('notification');
    expect(result.method).toBe('droid.session_notification');
  });

  it('TraceContextMetaSchema parses optional fields', () => {
    const meta = { traceparent: '00-abc-def-01' };
    expect(TraceContextMetaSchema.parse(meta).traceparent).toBe(
      '00-abc-def-01'
    );
    expect(TraceContextMetaSchema.parse({}).traceparent).toBeUndefined();
  });

  it('JsonRpcErrorSchema parses error with data', () => {
    const err = {
      code: -32004,
      message: 'Not found',
      data: { sessionId: 's1' },
    };
    const result = JsonRpcErrorSchema.parse(err);
    expect(result.code).toBe(-32004);
  });
});

// ============================================================
// Messages (content blocks)
// ============================================================

describe('message content block schemas', () => {
  it('TextBlockSchema parses valid text block', () => {
    const block = { type: 'text', text: 'Hello world' };
    expect(TextBlockSchema.parse(block).text).toBe('Hello world');
  });

  it('TextBlockSchema rejects wrong type', () => {
    expect(() =>
      TextBlockSchema.parse({ type: 'image', text: 'hi' })
    ).toThrow();
  });

  it('ImageBlockSchema parses valid image block', () => {
    const block = {
      type: 'image',
      source: { type: 'base64', data: 'abc123', mediaType: 'image/png' },
    };
    expect(ImageBlockSchema.parse(block).source.mediaType).toBe('image/png');
  });

  it('ThinkingBlockSchema parses valid thinking block', () => {
    const block = {
      type: 'thinking',
      signature: 'sig',
      thinking: 'I think...',
    };
    expect(ThinkingBlockSchema.parse(block).thinking).toBe('I think...');
  });

  it('ToolUseBlockSchema parses valid tool use block', () => {
    const block = {
      type: 'tool_use',
      id: 'tu-1',
      input: { key: 'val' },
      name: 'Read',
    };
    expect(ToolUseBlockSchema.parse(block).name).toBe('Read');
  });

  it('ToolResultBlockSchema parses valid tool result block', () => {
    const block = { type: 'tool_result', toolUseId: 'tu-1', content: 'result' };
    expect(ToolResultBlockSchema.parse(block).toolUseId).toBe('tu-1');
  });

  it('ContentBlockSchema discriminates by type', () => {
    const text = ContentBlockSchema.parse({ type: 'text', text: 'Hello' });
    expect(text.type).toBe('text');
    const toolUse = ContentBlockSchema.parse({
      type: 'tool_use',
      id: 'tu-1',
      input: {},
      name: 'Execute',
    });
    expect(toolUse.type).toBe('tool_use');
  });

  it('ContentBlockSchema rejects unknown type', () => {
    expect(() => ContentBlockSchema.parse({ type: 'unknown_type' })).toThrow();
  });

  it('FactoryDroidMessageSchema parses valid message', () => {
    const msg = {
      id: 'msg-1',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello' }],
      createdAt: 1234567890,
      updatedAt: 1234567890,
    };
    const result = FactoryDroidMessageSchema.parse(msg);
    expect(result.id).toBe('msg-1');
    expect(result.role).toBe('assistant');
    expect(result.content).toHaveLength(1);
  });

  it('DocumentSourceSchema parses valid document source', () => {
    const doc = { type: 'base64', mediaType: 'application/pdf', data: 'abc' };
    expect(DocumentSourceSchema.parse(doc).type).toBe('base64');
  });

  it('DocumentSourceSchema preserves extra fields (passthrough)', () => {
    const doc = {
      type: 'base64',
      mediaType: 'application/pdf',
      data: 'abc',
      extra: 'field',
    };
    const parsed = DocumentSourceSchema.parse(doc);
    expect((parsed as Record<string, unknown>).extra).toBe('field');
  });
});

// ============================================================
// MCP schemas
// ============================================================

describe('MCP schemas', () => {
  it('McpServerStatusInfoSchema parses valid status', () => {
    const info = {
      name: 'test-server',
      status: 'connected',
      source: 'user',
      isManaged: false,
      toolCount: 5,
    };
    const result = McpServerStatusInfoSchema.parse(info);
    expect(result.name).toBe('test-server');
    expect(result.status).toBe('connected');
    expect(result.toolCount).toBe(5);
  });

  it('McpServerStatusInfoSchema rejects invalid status', () => {
    const info = {
      name: 'srv',
      status: 'invalid_status',
      source: 'user',
      isManaged: false,
    };
    expect(() => McpServerStatusInfoSchema.parse(info)).toThrow();
  });

  it('McpStatusSummarySchema parses valid summary', () => {
    const summary = { total: 3, connected: 2, connecting: 0, failed: 1 };
    expect(McpStatusSummarySchema.parse(summary).total).toBe(3);
  });

  it('McpRegistryServerSchema parses stdio server', () => {
    const srv = {
      name: 'my-server',
      description: 'A test server',
      type: 'stdio',
      command: 'node',
      args: ['server.js'],
    };
    const result = McpRegistryServerSchema.parse(srv);
    expect(result.type).toBe('stdio');
    expect(result.command).toBe('node');
  });

  it('McpRegistryServerSchema parses http server', () => {
    const srv = {
      name: 'my-http-server',
      description: 'An HTTP server',
      type: 'http',
      url: 'https://example.com/mcp',
    };
    const result = McpRegistryServerSchema.parse(srv);
    expect(result.type).toBe('http');
    expect(result.url).toBe('https://example.com/mcp');
  });

  it('McpToolInfoSchema parses valid tool', () => {
    const tool = {
      serverName: 'srv',
      name: 'read_file',
      description: 'Read a file',
      isEnabled: true,
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    };
    const result = McpToolInfoSchema.parse(tool);
    expect(result.name).toBe('read_file');
    expect(result.isEnabled).toBe(true);
  });

  it('McpToolInputSchemaSchema parses schema subset', () => {
    const schema = {
      type: 'object',
      properties: { x: { type: 'number' } },
      required: ['x'],
    };
    expect(McpToolInputSchemaSchema.parse(schema).required).toEqual(['x']);
  });

  it('ToolConfirmationListItemSchema parses valid item', () => {
    const item = { label: 'Proceed Once', value: 'proceed_once' };
    expect(ToolConfirmationListItemSchema.parse(item).value).toBe(
      'proceed_once'
    );
  });
});

// ============================================================
// Mission schemas
// ============================================================

describe('mission schemas', () => {
  it('MissionFeatureSchema parses valid feature', () => {
    const feature = {
      id: 'feature-1',
      description: 'Implement login',
      status: 'pending',
      skillName: 'sdk-worker',
      preconditions: [],
      expectedBehavior: ['Login works'],
      verificationSteps: ['npm test'],
    };
    const result = MissionFeatureSchema.parse(feature);
    expect(result.id).toBe('feature-1');
    expect(result.status).toBe('pending');
  });

  it('MissionFeatureSchema rejects invalid status', () => {
    const feature = {
      id: 'f1',
      description: 'x',
      status: 'unknown_status',
      skillName: 'w',
      preconditions: [],
      expectedBehavior: [],
      verificationSteps: [],
    };
    expect(() => MissionFeatureSchema.parse(feature)).toThrow();
  });

  it('ProgressLogEntrySchema parses mission_accepted entry', () => {
    const entry = {
      type: 'mission_accepted',
      timestamp: '2024-01-01T00:00:00Z',
      title: 'My Mission',
    };
    const result = ProgressLogEntrySchema.parse(entry);
    expect(result.type).toBe('mission_accepted');
  });

  it('ProgressLogEntrySchema parses worker_completed entry', () => {
    const entry = {
      type: 'worker_completed',
      timestamp: '2024-01-01T00:00:00Z',
      workerSessionId: 'ws-1',
      featureId: 'f-1',
      successState: 'success',
      returnToOrchestrator: false,
      exitCode: 0,
    };
    const result = ProgressLogEntrySchema.parse(entry);
    expect(result.type).toBe('worker_completed');
  });

  it('ProgressLogEntrySchema rejects unknown type', () => {
    const entry = { type: 'unknown_entry', timestamp: '2024-01-01T00:00:00Z' };
    expect(() => ProgressLogEntrySchema.parse(entry)).toThrow();
  });

  it('DiscoveredIssueSchema parses valid issue', () => {
    const issue = { severity: 'blocking', description: 'Test failure' };
    expect(DiscoveredIssueSchema.parse(issue).severity).toBe('blocking');
  });

  it('HandoffSchema parses valid handoff', () => {
    const handoff = {
      whatWasImplemented: 'Login feature',
      whatWasLeftUndone: '',
      verification: {
        commandsRun: [
          { command: 'npm test', exitCode: 0, observation: 'pass' },
        ],
      },
      tests: { added: [], coverage: '80%' },
      discoveredIssues: [],
    };
    expect(HandoffSchema.parse(handoff).whatWasImplemented).toBe(
      'Login feature'
    );
  });
});

// ============================================================
// Client request params schemas (all 19)
// ============================================================

describe('client request params schemas', () => {
  it('InitializeSessionRequestParams parses valid input', () => {
    const params = { machineId: 'm1', cwd: '/home/user' };
    expect(InitializeSessionRequestParamsSchema.parse(params).machineId).toBe(
      'm1'
    );
  });

  it('InitializeSessionRequestParams rejects missing required fields', () => {
    expect(() =>
      InitializeSessionRequestParamsSchema.parse({ machineId: 'm1' })
    ).toThrow();
  });

  it('LoadSessionRequestParams parses valid input', () => {
    const params = { sessionId: 's-123' };
    expect(LoadSessionRequestParamsSchema.parse(params).sessionId).toBe(
      's-123'
    );
  });

  it('AddUserMessageRequestParams parses valid input', () => {
    const params = { text: 'Hello' };
    expect(AddUserMessageRequestParamsSchema.parse(params).text).toBe('Hello');
  });

  it('AddUserMessageRequestParams with images', () => {
    const params = {
      text: 'Check this',
      images: [{ type: 'base64', data: 'abc', mediaType: 'image/png' }],
    };
    const result = AddUserMessageRequestParamsSchema.parse(params);
    expect(result.images).toHaveLength(1);
  });

  it('InterruptSessionRequestParams parses empty object', () => {
    expect(InterruptSessionRequestParamsSchema.parse({})).toEqual({});
  });

  it('KillWorkerSessionRequestParams parses valid input', () => {
    const params = { workerSessionId: 'ws-1' };
    expect(
      KillWorkerSessionRequestParamsSchema.parse(params).workerSessionId
    ).toBe('ws-1');
  });

  it('UpdateSessionSettingsRequestParams parses partial settings', () => {
    const params = { modelId: 'claude-3', reasoningEffort: 'high' };
    const result = UpdateSessionSettingsRequestParamsSchema.parse(params);
    expect(result.modelId).toBe('claude-3');
    expect(result.reasoningEffort).toBe('high');
  });

  it('ToggleMcpServerRequestParams parses valid input', () => {
    const params = { serverName: 'srv', enabled: true, settingsLevel: 'user' };
    expect(ToggleMcpServerRequestParamsSchema.parse(params).enabled).toBe(true);
  });

  it('AuthenticateMcpServerRequestParams parses valid input', () => {
    const params = { serverName: 'srv' };
    expect(
      AuthenticateMcpServerRequestParamsSchema.parse(params).serverName
    ).toBe('srv');
  });

  it('CancelMcpAuthRequestParams parses valid input', () => {
    const params = { serverName: 'srv' };
    expect(CancelMcpAuthRequestParamsSchema.parse(params).serverName).toBe(
      'srv'
    );
  });

  it('ClearMcpAuthRequestParams parses valid input', () => {
    const params = { serverName: 'srv' };
    expect(ClearMcpAuthRequestParamsSchema.parse(params).serverName).toBe(
      'srv'
    );
  });

  it('SubmitMcpAuthCodeRequestParams parses valid input', () => {
    const params = { serverName: 'srv', code: 'abc123', state: 'state-token' };
    expect(SubmitMcpAuthCodeRequestParamsSchema.parse(params).code).toBe(
      'abc123'
    );
  });

  it('AddMcpServerRequestParams parses stdio server', () => {
    const params = {
      name: 'my-srv',
      type: 'stdio',
      command: 'node',
      args: ['srv.js'],
    };
    const result = AddMcpServerRequestParamsSchema.parse(params);
    expect(result.type).toBe('stdio');
  });

  it('AddMcpServerRequestParams parses http server', () => {
    const params = { name: 'my-srv', type: 'http', url: 'https://example.com' };
    const result = AddMcpServerRequestParamsSchema.parse(params);
    expect(result.type).toBe('http');
  });

  it('RemoveMcpServerRequestParams parses valid input', () => {
    const params = { serverName: 'srv', settingsLevel: 'user' };
    expect(RemoveMcpServerRequestParamsSchema.parse(params).serverName).toBe(
      'srv'
    );
  });

  it('ListMcpRegistryRequestParams parses empty object', () => {
    expect(ListMcpRegistryRequestParamsSchema.parse({})).toEqual({});
  });

  it('ListMcpToolsRequestParams parses empty object', () => {
    expect(ListMcpToolsRequestParamsSchema.parse({})).toEqual({});
  });

  it('ListMcpServersRequestParams parses empty object', () => {
    expect(ListMcpServersRequestParamsSchema.parse({})).toEqual({});
  });

  it('ToggleMcpToolRequestParams parses valid input', () => {
    const params = { serverName: 'srv', toolName: 'read_file', enabled: false };
    expect(ToggleMcpToolRequestParamsSchema.parse(params).toolName).toBe(
      'read_file'
    );
  });

  it('ListSkillsRequestParams parses empty object', () => {
    expect(ListSkillsRequestParamsSchema.parse({})).toEqual({});
  });

  it('SubmitBugReportRequestParams parses valid input', () => {
    const params = { userComment: 'Something broke' };
    expect(SubmitBugReportRequestParamsSchema.parse(params).userComment).toBe(
      'Something broke'
    );
  });

  it('strict request schemas reject extra fields', () => {
    expect(() =>
      InitializeSessionRequestParamsSchema.parse({
        machineId: 'm1',
        cwd: '/tmp',
        extra: true,
      })
    ).toThrow();
  });
});

// ============================================================
// Client result schemas
// ============================================================

describe('client result schemas', () => {
  it('InitializeSessionResultSchema parses valid result', () => {
    const result = {
      sessionId: 's-1',
      session: { messages: [] },
      settings: { modelId: 'claude-3', reasoningEffort: 'high' },
    };
    const parsed = InitializeSessionResultSchema.parse(result);
    expect(parsed.sessionId).toBe('s-1');
  });

  it('LoadSessionResultSchema parses valid result', () => {
    const result = {
      session: { messages: [] },
      settings: { modelId: 'claude-3', reasoningEffort: 'high' },
    };
    const parsed = LoadSessionResultSchema.parse(result);
    expect(parsed.session).toBeDefined();
  });

  it('TokenUsageSchema parses valid token usage', () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 200,
      cacheCreationTokens: 50,
      cacheReadTokens: 30,
      thinkingTokens: 10,
    };
    const result = TokenUsageSchema.parse(usage);
    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBe(200);
  });

  it('SessionSettingsSchema parses valid settings', () => {
    const settings = { modelId: 'claude-3', reasoningEffort: 'high' };
    const result = SessionSettingsSchema.parse(settings);
    expect(result.modelId).toBe('claude-3');
  });

  it('result schemas accept extra fields (passthrough)', () => {
    const result = {
      sessionId: 's-1',
      session: {},
      settings: { modelId: 'm', reasoningEffort: 'high' },
      unknownNewField: true,
    };
    expect(() => InitializeSessionResultSchema.parse(result)).not.toThrow();
  });
});

// ============================================================
// ClientRequestSchema discriminated union
// ============================================================

describe('ClientRequestSchema discriminated union', () => {
  it('parses an initialize_session request', () => {
    const req = {
      ...envelope,
      type: 'request',
      id: 'r1',
      method: 'droid.initialize_session',
      params: { machineId: 'm1', cwd: '/tmp' },
    };
    const result = ClientRequestSchema.parse(req);
    expect(result.method).toBe('droid.initialize_session');
  });

  it('parses a submit_bug_report request', () => {
    const req = {
      ...envelope,
      type: 'request',
      id: 'r2',
      method: 'droid.submit_bug_report',
      params: { userComment: 'bug' },
    };
    const result = ClientRequestSchema.parse(req);
    expect(result.method).toBe('droid.submit_bug_report');
  });

  it('rejects unknown method', () => {
    const req = {
      ...envelope,
      type: 'request',
      id: 'r3',
      method: 'droid.unknown_method',
      params: {},
    };
    expect(() => ClientRequestSchema.parse(req)).toThrow();
  });
});

// ============================================================
// Server notification schemas (all 20)
// ============================================================

describe('server notification schemas', () => {
  it('AssistantTextDeltaNotificationSchema parses valid notification', () => {
    const n = {
      type: 'assistant_text_delta',
      messageId: 'msg-1',
      blockIndex: 0,
      textDelta: 'Hello',
    };
    expect(AssistantTextDeltaNotificationSchema.parse(n).textDelta).toBe(
      'Hello'
    );
  });

  it('ThinkingTextDeltaNotificationSchema parses valid notification', () => {
    const n = {
      type: 'thinking_text_delta',
      messageId: 'msg-1',
      blockIndex: 0,
      textDelta: 'thinking...',
    };
    expect(ThinkingTextDeltaNotificationSchema.parse(n).textDelta).toBe(
      'thinking...'
    );
  });

  it('ToolResultNotificationSchema parses valid notification', () => {
    const n = {
      type: 'tool_result',
      messageId: 'msg-1',
      toolUseId: 'tu-1',
      content: 'result text',
    };
    expect(ToolResultNotificationSchema.parse(n).toolUseId).toBe('tu-1');
  });

  it('ToolProgressUpdateNotificationSchema parses valid notification', () => {
    const n = {
      type: 'tool_progress_update',
      toolUseId: 'tu-1',
      toolName: 'Execute',
      update: { type: 'status', status: 'running' },
    };
    expect(ToolProgressUpdateNotificationSchema.parse(n).toolName).toBe(
      'Execute'
    );
  });

  it('CreateMessageNotificationSchema parses valid notification', () => {
    const n = {
      type: 'create_message',
      message: {
        id: 'msg-1',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi' }],
        createdAt: 1234567890,
        updatedAt: 1234567890,
      },
    };
    expect(CreateMessageNotificationSchema.parse(n).message.id).toBe('msg-1');
  });

  it('ErrorNotificationSchema parses valid notification', () => {
    const n = {
      type: 'error',
      message: 'Something went wrong',
      errorType: 'SessionError',
      timestamp: '2024-01-01T00:00:00Z',
    };
    expect(ErrorNotificationSchema.parse(n).errorType).toBe('SessionError');
  });

  it('DroidWorkingStateChangedNotificationSchema parses valid notification', () => {
    const n = { type: 'droid_working_state_changed', newState: 'idle' };
    expect(DroidWorkingStateChangedNotificationSchema.parse(n).newState).toBe(
      'idle'
    );
  });

  it('PermissionResolvedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'permission_resolved',
      requestId: 'req-1',
      toolUseIds: ['tu-1'],
      selectedOption: 'proceed_once',
    };
    expect(PermissionResolvedNotificationSchema.parse(n).selectedOption).toBe(
      'proceed_once'
    );
  });

  it('SettingsUpdatedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'settings_updated',
      settings: { modelId: 'claude-3', reasoningEffort: 'high' },
    };
    expect(SettingsUpdatedNotificationSchema.parse(n).settings.modelId).toBe(
      'claude-3'
    );
  });

  it('SessionTitleUpdatedNotificationSchema parses valid notification', () => {
    const n = { type: 'session_title_updated', title: 'New Title' };
    expect(SessionTitleUpdatedNotificationSchema.parse(n).title).toBe(
      'New Title'
    );
  });

  it('McpStatusChangedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'mcp_status_changed',
      servers: [
        { name: 'srv', status: 'connected', source: 'user', isManaged: false },
      ],
      summary: { total: 1, connected: 1, connecting: 0, failed: 0 },
    };
    expect(McpStatusChangedNotificationSchema.parse(n).servers).toHaveLength(1);
  });

  it('SessionTokenUsageChangedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'session_token_usage_changed',
      sessionId: 's-1',
      tokenUsage: {
        inputTokens: 100,
        outputTokens: 200,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        thinkingTokens: 0,
      },
    };
    expect(SessionTokenUsageChangedNotificationSchema.parse(n).sessionId).toBe(
      's-1'
    );
  });

  it('MissionStateChangedNotificationSchema parses valid notification', () => {
    const n = { type: 'mission_state_changed', state: 'running' };
    expect(MissionStateChangedNotificationSchema.parse(n).state).toBe(
      'running'
    );
  });

  it('MissionFeaturesChangedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'mission_features_changed',
      features: [
        {
          id: 'f1',
          description: 'feature',
          status: 'pending',
          skillName: 'w',
          preconditions: [],
          expectedBehavior: [],
          verificationSteps: [],
        },
      ],
    };
    expect(
      MissionFeaturesChangedNotificationSchema.parse(n).features
    ).toHaveLength(1);
  });

  it('MissionProgressEntryNotificationSchema parses valid notification', () => {
    const n = {
      type: 'mission_progress_entry',
      progressLog: [
        {
          type: 'mission_accepted',
          timestamp: '2024-01-01T00:00:00Z',
          title: 'M1',
        },
      ],
    };
    expect(
      MissionProgressEntryNotificationSchema.parse(n).progressLog
    ).toHaveLength(1);
  });

  it('MissionHeartbeatNotificationSchema parses valid notification', () => {
    const n = { type: 'mission_heartbeat', timestamp: '2024-01-01T00:00:00Z' };
    expect(MissionHeartbeatNotificationSchema.parse(n).timestamp).toBe(
      '2024-01-01T00:00:00Z'
    );
  });

  it('MissionWorkerStartedNotificationSchema parses valid notification', () => {
    const n = { type: 'mission_worker_started', workerSessionId: 'ws-1' };
    expect(
      MissionWorkerStartedNotificationSchema.parse(n).workerSessionId
    ).toBe('ws-1');
  });

  it('MissionWorkerCompletedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'mission_worker_completed',
      workerSessionId: 'ws-1',
      exitCode: 0,
    };
    expect(MissionWorkerCompletedNotificationSchema.parse(n).exitCode).toBe(0);
  });

  it('McpAuthRequiredNotificationSchema parses valid notification', () => {
    const n = {
      type: 'mcp_auth_required',
      serverName: 'srv',
      authUrl: 'https://auth.example.com',
      message: 'Please authenticate',
      state: 'state-token',
    };
    expect(McpAuthRequiredNotificationSchema.parse(n).authUrl).toBe(
      'https://auth.example.com'
    );
  });

  it('McpAuthCompletedNotificationSchema parses valid notification', () => {
    const n = {
      type: 'mcp_auth_completed',
      serverName: 'srv',
      outcome: 'success',
      message: 'Authenticated',
    };
    expect(McpAuthCompletedNotificationSchema.parse(n).outcome).toBe('success');
  });
});

// ============================================================
// SessionNotificationPayloadSchema (discriminated union)
// ============================================================

describe('SessionNotificationPayloadSchema', () => {
  it('discriminates by type field', () => {
    const delta = {
      type: 'assistant_text_delta',
      messageId: 'm1',
      blockIndex: 0,
      textDelta: 'hi',
    };
    const result = SessionNotificationPayloadSchema.parse(delta);
    expect(result.type).toBe('assistant_text_delta');
  });

  it('rejects unknown notification type', () => {
    expect(() =>
      SessionNotificationPayloadSchema.parse({ type: 'nonexistent_type' })
    ).toThrow();
  });
});

// ============================================================
// Server→client request schemas (permission, ask-user)
// ============================================================

describe('server→client request schemas', () => {
  it('RequestPermissionRequestParamsSchema parses valid params', () => {
    const params = {
      toolUses: [
        {
          toolUse: { type: 'tool_use', id: 'tu-1', input: {}, name: 'Execute' },
          confirmationType: 'exec',
          details: { type: 'exec', fullCommand: 'ls -la', command: 'ls' },
        },
      ],
      options: [{ label: 'Proceed Once', value: 'proceed_once' }],
    };
    const result = RequestPermissionRequestParamsSchema.parse(params);
    expect(result.toolUses).toHaveLength(1);
    expect(result.options).toHaveLength(1);
  });

  it('RequestPermissionResultSchema parses valid result', () => {
    const result = { selectedOption: 'proceed_once' };
    expect(RequestPermissionResultSchema.parse(result).selectedOption).toBe(
      'proceed_once'
    );
  });

  it('RequestPermissionResultSchema rejects invalid outcome', () => {
    expect(() =>
      RequestPermissionResultSchema.parse({ selectedOption: 'invalid' })
    ).toThrow();
  });

  it('AskUserRequestParamsSchema parses valid params', () => {
    const params = {
      toolCallId: 'tc-1',
      questions: [
        {
          index: 1,
          topic: 'Config',
          question: 'Which option?',
          options: ['A', 'B'],
        },
      ],
    };
    const result = AskUserRequestParamsSchema.parse(params);
    expect(result.questions).toHaveLength(1);
    expect(result.toolCallId).toBe('tc-1');
  });

  it('AskUserResultSchema parses valid result', () => {
    const result = {
      cancelled: false,
      answers: [{ index: 1, question: 'Which?', answer: 'A' }],
    };
    expect(AskUserResultSchema.parse(result).answers).toHaveLength(1);
  });

  it('AskUserResultSchema parses cancelled result', () => {
    const result = { cancelled: true, answers: [] };
    expect(AskUserResultSchema.parse(result).cancelled).toBe(true);
  });
});

// ============================================================
// Rewind / Compact / Fork constants and schemas
// ============================================================

describe('rewind/compact/fork constants', () => {
  it('COMPACTION_TIMEOUT is 240 seconds', () => {
    expect(COMPACTION_TIMEOUT).toBe(240_000);
  });

  it('REWIND_TIMEOUT is 60 seconds', () => {
    expect(REWIND_TIMEOUT).toBe(60_000);
  });
});

describe('rewind sub-type schemas', () => {
  it('RewindFileSnapshotSchema parses valid data', () => {
    const data = {
      filePath: '/src/main.ts',
      contentHash: 'abc123',
      size: 1024,
    };
    const result = RewindFileSnapshotSchema.parse(data);
    expect(result.filePath).toBe('/src/main.ts');
    expect(result.contentHash).toBe('abc123');
    expect(result.size).toBe(1024);
  });

  it('RewindFileSnapshotSchema preserves unknown fields (passthrough)', () => {
    const data = { filePath: '/a.ts', contentHash: 'h', size: 1, extra: true };
    const result = RewindFileSnapshotSchema.parse(data);
    expect((result as Record<string, unknown>)['extra']).toBe(true);
  });

  it('RewindFileSnapshotSchema rejects missing fields', () => {
    expect(() =>
      RewindFileSnapshotSchema.parse({ filePath: '/a.ts' })
    ).toThrow();
  });

  it('RewindFileCreationSchema parses valid data', () => {
    const data = { filePath: '/src/new.ts' };
    const result = RewindFileCreationSchema.parse(data);
    expect(result.filePath).toBe('/src/new.ts');
  });

  it('RewindFileCreationSchema preserves unknown fields', () => {
    const data = { filePath: '/a.ts', extra: 'val' };
    const result = RewindFileCreationSchema.parse(data);
    expect((result as Record<string, unknown>)['extra']).toBe('val');
  });

  it('RewindEvictedFileSchema parses valid data', () => {
    const data = { filePath: '/src/old.ts', reason: 'too large' };
    const result = RewindEvictedFileSchema.parse(data);
    expect(result.filePath).toBe('/src/old.ts');
    expect(result.reason).toBe('too large');
  });

  it('RewindEvictedFileSchema rejects missing reason', () => {
    expect(() =>
      RewindEvictedFileSchema.parse({ filePath: '/a.ts' })
    ).toThrow();
  });
});

describe('GetRewindInfo schemas', () => {
  it('GetRewindInfoRequestParamsSchema parses valid params', () => {
    const params = { messageId: 'msg-123' };
    const result = GetRewindInfoRequestParamsSchema.parse(params);
    expect(result.messageId).toBe('msg-123');
  });

  it('GetRewindInfoRequestParamsSchema rejects missing messageId', () => {
    expect(() => GetRewindInfoRequestParamsSchema.parse({})).toThrow();
  });

  it('GetRewindInfoResultSchema parses valid result', () => {
    const data = {
      availableFiles: [{ filePath: '/a.ts', contentHash: 'h', size: 10 }],
      createdFiles: [{ filePath: '/b.ts' }],
      evictedFiles: [{ filePath: '/c.ts', reason: 'binary' }],
    };
    const result = GetRewindInfoResultSchema.parse(data);
    expect(result.availableFiles).toHaveLength(1);
    expect(result.createdFiles).toHaveLength(1);
    expect(result.evictedFiles).toHaveLength(1);
  });

  it('GetRewindInfoResultSchema preserves unknown fields', () => {
    const data = {
      availableFiles: [],
      createdFiles: [],
      evictedFiles: [],
      futureField: 'hello',
    };
    const result = GetRewindInfoResultSchema.parse(data);
    expect((result as Record<string, unknown>)['futureField']).toBe('hello');
  });
});

describe('ExecuteRewind schemas', () => {
  it('ExecuteRewindRequestParamsSchema parses valid params', () => {
    const params = {
      messageId: 'msg-1',
      filesToRestore: [{ filePath: '/a.ts', contentHash: 'h', size: 10 }],
      filesToDelete: [{ filePath: '/b.ts' }],
      forkTitle: 'My Rewind',
    };
    const result = ExecuteRewindRequestParamsSchema.parse(params);
    expect(result.messageId).toBe('msg-1');
    expect(result.filesToRestore).toHaveLength(1);
    expect(result.filesToDelete).toHaveLength(1);
    expect(result.forkTitle).toBe('My Rewind');
  });

  it('ExecuteRewindRequestParamsSchema rejects missing forkTitle', () => {
    expect(() =>
      ExecuteRewindRequestParamsSchema.parse({
        messageId: 'msg-1',
        filesToRestore: [],
        filesToDelete: [],
      })
    ).toThrow();
  });

  it('ExecuteRewindResultSchema parses valid result', () => {
    const data = {
      newSessionId: 'new-sess',
      restoredCount: 3,
      deletedCount: 1,
      failedRestoreCount: 0,
      failedDeleteCount: 0,
    };
    const result = ExecuteRewindResultSchema.parse(data);
    expect(result.newSessionId).toBe('new-sess');
    expect(result.restoredCount).toBe(3);
  });
});

describe('CompactSession schemas', () => {
  it('CompactSessionRequestParamsSchema parses with customInstructions', () => {
    const params = { customInstructions: 'Keep code context' };
    const result = CompactSessionRequestParamsSchema.parse(params);
    expect(result.customInstructions).toBe('Keep code context');
  });

  it('CompactSessionRequestParamsSchema parses without customInstructions', () => {
    const result = CompactSessionRequestParamsSchema.parse({});
    expect(result.customInstructions).toBeUndefined();
  });

  it('CompactSessionResultSchema parses valid result', () => {
    const data = { newSessionId: 'compact-sess', removedCount: 42 };
    const result = CompactSessionResultSchema.parse(data);
    expect(result.newSessionId).toBe('compact-sess');
    expect(result.removedCount).toBe(42);
  });

  it('CompactSessionResultSchema rejects missing removedCount', () => {
    expect(() =>
      CompactSessionResultSchema.parse({ newSessionId: 'x' })
    ).toThrow();
  });
});

describe('ForkSession schemas', () => {
  it('ForkSessionRequestParamsSchema parses empty object', () => {
    const result = ForkSessionRequestParamsSchema.parse({});
    expect(result).toBeDefined();
  });

  it('ForkSessionRequestParamsSchema preserves unknown fields', () => {
    const data = { futureOption: true };
    const result = ForkSessionRequestParamsSchema.parse(data);
    expect((result as Record<string, unknown>)['futureOption']).toBe(true);
  });

  it('ForkSessionResultSchema parses valid result', () => {
    const data = { newSessionId: 'forked-sess' };
    const result = ForkSessionResultSchema.parse(data);
    expect(result.newSessionId).toBe('forked-sess');
  });

  it('ForkSessionResultSchema rejects missing newSessionId', () => {
    expect(() => ForkSessionResultSchema.parse({})).toThrow();
  });
});

describe('RenameSession schemas', () => {
  it('RenameSessionRequestParamsSchema parses valid params', () => {
    const result = RenameSessionRequestParamsSchema.parse({
      title: 'My Session',
    });
    expect(result.title).toBe('My Session');
  });

  it('RenameSessionRequestParamsSchema rejects missing title', () => {
    expect(() => RenameSessionRequestParamsSchema.parse({})).toThrow();
  });

  it('RenameSessionRequestParamsSchema preserves unknown fields', () => {
    const data = { title: 'test', futureOption: true };
    const result = RenameSessionRequestParamsSchema.parse(data);
    expect(result.title).toBe('test');
    expect((result as Record<string, unknown>)['futureOption']).toBe(true);
  });

  it('RenameSessionResultSchema parses valid result', () => {
    const result = RenameSessionResultSchema.parse({ success: true });
    expect(result.success).toBe(true);
  });

  it('RenameSessionResultSchema rejects missing success', () => {
    expect(() => RenameSessionResultSchema.parse({})).toThrow();
  });
});
