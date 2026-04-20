/**
 * All protocol enums for the Factory Droid SDK.
 *
 * - packages/common/src/droid/enums.ts
 * - packages/common/src/shared/enums.ts
 * - packages/common/src/llm/enums.ts
 * - packages/common/src/settings/enums.ts
 */

/** Droid server methods (client → server communication). */
export enum DroidServerMethod {
  INITIALIZE_SESSION = 'droid.initialize_session',
  LOAD_SESSION = 'droid.load_session',
  ADD_USER_MESSAGE = 'droid.add_user_message',
  INTERRUPT_SESSION = 'droid.interrupt_session',
  KILL_WORKER_SESSION = 'droid.kill_worker_session',
  UPDATE_SESSION_SETTINGS = 'droid.update_session_settings',
  TOGGLE_MCP_SERVER = 'droid.toggle_mcp_server',
  AUTHENTICATE_MCP_SERVER = 'droid.authenticate_mcp_server',
  CANCEL_MCP_AUTH = 'droid.cancel_mcp_auth',
  CLEAR_MCP_AUTH = 'droid.clear_mcp_auth',
  ADD_MCP_SERVER = 'droid.add_mcp_server',
  REMOVE_MCP_SERVER = 'droid.remove_mcp_server',
  LIST_MCP_REGISTRY = 'droid.list_mcp_registry',
  LIST_MCP_TOOLS = 'droid.list_mcp_tools',
  LIST_TOOLS = 'droid.list_tools',
  LIST_MCP_SERVERS = 'droid.list_mcp_servers',
  TOGGLE_MCP_TOOL = 'droid.toggle_mcp_tool',
  SUBMIT_MCP_AUTH_CODE = 'droid.submit_mcp_auth_code',
  LIST_SKILLS = 'droid.list_skills',
  SUBMIT_BUG_REPORT = 'droid.submit_bug_report',
  GET_REWIND_INFO = 'droid.get_rewind_info',
  EXECUTE_REWIND = 'droid.execute_rewind',
  COMPACT_SESSION = 'droid.compact_session',
  FORK_SESSION = 'droid.fork_session',
  RENAME_SESSION = 'droid.rename_session',
  GET_CONTEXT_STATS = 'droid.get_context_stats',
}

/** Droid client methods (server → client communication). */
export enum DroidClientMethod {
  SESSION_NOTIFICATION = 'droid.session_notification',
  REQUEST_PERMISSION = 'droid.request_permission',
  ASK_USER = 'droid.ask_user',
}

/** Session notification types. */
export enum SessionNotificationType {
  TOOL_RESULT = 'tool_result',
  TOOL_PROGRESS_UPDATE = 'tool_progress_update',
  CREATE_MESSAGE = 'create_message',
  ERROR = 'error',
  DROID_WORKING_STATE_CHANGED = 'droid_working_state_changed',
  PERMISSION_RESOLVED = 'permission_resolved',
  SETTINGS_UPDATED = 'settings_updated',
  SESSION_TITLE_UPDATED = 'session_title_updated',
  MCP_STATUS_CHANGED = 'mcp_status_changed',
  ASSISTANT_TEXT_DELTA = 'assistant_text_delta',
  THINKING_TEXT_DELTA = 'thinking_text_delta',
  SESSION_TOKEN_USAGE_CHANGED = 'session_token_usage_changed',
  MISSION_STATE_CHANGED = 'mission_state_changed',
  MISSION_FEATURES_CHANGED = 'mission_features_changed',
  MISSION_PROGRESS_ENTRY = 'mission_progress_entry',
  MISSION_HEARTBEAT = 'mission_heartbeat',
  MISSION_WORKER_STARTED = 'mission_worker_started',
  MISSION_WORKER_COMPLETED = 'mission_worker_completed',
  MCP_AUTH_REQUIRED = 'mcp_auth_required',
  MCP_AUTH_COMPLETED = 'mcp_auth_completed',
}

/** Tool confirmation outcome options (possible user responses to permission requests). */
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  ProceedAutoRun = 'proceed_auto_run',
  ProceedAutoRunLow = 'proceed_auto_run_low',
  ProceedAutoRunMedium = 'proceed_auto_run_medium',
  ProceedAutoRunHigh = 'proceed_auto_run_high',
  ProceedNewSession = 'proceed_new_session',
  ProceedNewSessionLow = 'proceed_new_session_low',
  ProceedNewSessionMedium = 'proceed_new_session_medium',
  ProceedNewSessionHigh = 'proceed_new_session_high',
  ProceedEdit = 'proceed_edit',
  Cancel = 'cancel',
}

/** Tool confirmation type (which tool is requesting permission). */
export enum ToolConfirmationType {
  Edit = 'edit',
  Execute = 'exec',
  Create = 'create',
  AskUser = 'ask_user',
  ExitSpecMode = 'exit_spec_mode',
  ProposeMission = 'propose_mission',
  StartMissionRun = 'start_mission_run',
  ApplyPatch = 'apply_patch',
  McpTool = 'mcp_tool',
}

/** Droid working state (represents what the agent is currently doing). */
export enum DroidWorkingState {
  Idle = 'idle',
  StreamingAssistantMessage = 'streaming_assistant_message',
  WaitingForToolConfirmation = 'waiting_for_tool_confirmation',
  ExecutingTool = 'executing_tool',
  CompactingConversation = 'compacting_conversation',
}

/** Error types for error notifications. */
export enum DroidErrorType {
  CONNECTION_ERROR = 'ConnectionError',
  PROTOCOL_ERROR = 'ProtocolError',
  SESSION_ERROR = 'SessionError',
  TIMEOUT_ERROR = 'TimeoutError',
  DROID_CLIENT_ERROR = 'DroidClientError',
  PROCESS_EXIT_ERROR = 'ProcessExitError',
  ERROR = 'Error',
}

/** MCP server connection status. */
export enum McpServerStatus {
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Failed = 'failed',
  Disabled = 'disabled',
}

/** MCP server transport type. */
export enum McpServerType {
  Stdio = 'stdio',
  Http = 'http',
  Sse = 'sse',
}

/** Overall MCP initialization status. */
export enum McpStatus {
  NotInitialized = 'not-initialized',
  Initializing = 'initializing',
  Ready = 'ready',
  NoServers = 'no-servers',
  Failed = 'failed',
}

/** MCP authentication outcome. */
export enum McpAuthOutcome {
  Success = 'success',
  Cancelled = 'cancelled',
  Failed = 'failed',
}

/** Session type for mission decomposition (orchestrator manages workers). */
export enum DecompSessionType {
  Orchestrator = 'orchestrator',
  Worker = 'worker',
}

/** Mission state enum (used by orchestrator mission runner). */
export enum MissionState {
  AwaitingInput = 'awaiting_input',
  Initializing = 'initializing',
  Running = 'running',
  Paused = 'paused',
  OrchestratorTurn = 'orchestrator_turn',
  Completed = 'completed',
}

/** Feature status enum (mirrors orchestrator feature lifecycle). */
export enum FeatureStatus {
  Pending = 'pending',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

/** Success state for feature completion. */
export enum FeatureSuccessState {
  Success = 'success',
  Partial = 'partial',
  Failure = 'failure',
}

/** Issue severity for discovered issues. */
export enum IssueSeverity {
  Blocking = 'blocking',
  NonBlocking = 'non_blocking',
  Suggestion = 'suggestion',
}

/** Dismissal item type. */
export enum DismissalType {
  DiscoveredIssue = 'discovered_issue',
  CriticalContext = 'critical_context',
  IncompleteWork = 'incomplete_work',
}

/** Progress log entry type. */
export enum ProgressLogEntryType {
  MissionAccepted = 'mission_accepted',
  MissionPaused = 'mission_paused',
  MissionResumed = 'mission_resumed',
  MissionRunStarted = 'mission_run_started',
  WorkerStarted = 'worker_started',
  WorkerSelectedFeature = 'worker_selected_feature',
  WorkerCompleted = 'worker_completed',
  WorkerFailed = 'worker_failed',
  WorkerPaused = 'worker_paused',
  HandoffItemsDismissed = 'handoff_items_dismissed',
  MilestoneValidationTriggered = 'milestone_validation_triggered',
}

/**
 * The interaction mode determines how Droid operates.
 * - Auto: Droid can execute actions based on autonomy level
 * - Spec: Droid is in planning/research mode only (read-only operations)
 * - AGI: Droid orchestrates missions with read-only tools and orchestrator controls
 */
export enum DroidInteractionMode {
  Auto = 'auto',
  Spec = 'spec',
  AGI = 'agi',
}

/**
 * Autonomy level determines what actions Droid can perform without user confirmation.
 * - Off: User controls all actions (confirmation required for everything)
 * - Low: Allow file edits and read-only commands
 * - Medium: Allow reversible commands
 * - High: Allow all commands without prompts
 */
export enum AutonomyLevel {
  Off = 'off',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

/**
 * Combined autonomy mode for backward compatibility.
 * @deprecated Use DroidInteractionMode + AutonomyLevel instead.
 */
export enum AutonomyMode {
  Normal = 'normal',
  Spec = 'spec',
  AutoLow = 'auto-low',
  AutoMedium = 'auto-medium',
  AutoHigh = 'auto-high',
}

/** Reasoning effort levels for LLMs. */
export enum ReasoningEffort {
  None = 'none',
  Dynamic = 'dynamic',
  Off = 'off',
  Minimal = 'minimal',
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  ExtraHigh = 'xhigh',
  Max = 'max',
}

/** Model provider identifiers. */
export enum ModelProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  GENERIC_CHAT_COMPLETION_API = 'generic-chat-completion-api',
  FACTORY = 'factory',
  GOOGLE = 'google',
  XAI = 'xai',
  VOYAGE = 'voyage',
}

/** Standard JSON-RPC 2.0 error codes. */
export enum JsonRpcErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  AUTHENTICATION_ERROR = -32001,
  ENTITY_NOT_FOUND = -32004,
  SESSION_DISCONNECTED = -32005,
}

/** JSON-RPC message type discriminator. */
export enum JsonRpcMessageType {
  Request = 'request',
  Response = 'response',
  Notification = 'notification',
}

/**
 * Settings hierarchy level enum.
 * Precedence order (highest to lowest): Org → Runtime → Folder → Project → User
 */
export enum SettingsLevel {
  Org = 'org',
  Runtime = 'runtime',
  User = 'user',
  Project = 'project',
  Folder = 'folder',
  Dynamic = 'dynamic',
  BuiltIn = 'builtin',
}

/** Skill file location type. */
export enum SkillLocation {
  Project = 'project',
  Personal = 'personal',
  Builtin = 'builtin',
}
