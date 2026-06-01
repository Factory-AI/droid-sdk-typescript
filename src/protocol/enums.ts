// Source-of-truth mirror of factory-mono-alpha protocol enums (leaf enums only).
// Faithful copies of the private monorepo definitions from:
//   packages/common/src/shared/enums.ts
//   packages/common/src/droid/enums.ts
//   packages/common/src/sessionV2/messages/enums.ts
//   packages/common/src/session/sources/enums.ts
//   packages/common/src/llm/enums.ts (leaf subset)
//   packages/common/src/settings/enums.ts (leaf subset)
// Keep values byte-identical to the private monorepo to avoid protocol drift.

// ---------------------------------------------------------------------------
// shared/enums.ts
// ---------------------------------------------------------------------------

export enum JsonRpcMessageType {
  Request = 'request',
  Response = 'response',
  Notification = 'notification',
}

/**
 * Standard JSON-RPC 2.0 error codes
 * @see https://www.jsonrpc.org/specification#error_object
 */
export enum JsonRpcErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  AUTHENTICATION_ERROR = -32001,
  ENTITY_NOT_FOUND = -32004,
  /** Session's CLI process has disconnected or died */
  SESSION_DISCONNECTED = -32005,
}

/**
 * The interaction mode determines how Droid operates.
 * - Auto: Droid can execute actions based on autonomy level
 * - Spec: Droid is in planning/research mode only (read-only operations)
 * - Mission: Droid orchestrates missions with read-only tools and orchestrator controls
 */
export enum DroidInteractionMode {
  Auto = 'auto',
  Spec = 'spec',
  /** @deprecated Use Mission instead. Kept for protocol compatibility. */
  AGI = 'agi',
  Mission = 'mission',
}

/**
 * Supported operating system platforms
 */
export enum Platform {
  Darwin = 'darwin',
  Windows = 'win32',
  Linux = 'linux',
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
 * This is derived from DroidInteractionMode + AutonomyLevel:
 * - Normal = Auto + Off
 * - Spec = Spec mode (autonomy level ignored)
 * - AutoLow = Auto + Low
 * - AutoMedium = Auto + Medium
 * - AutoHigh = Auto + High
 * @deprecated Use DroidInteractionMode + AutonomyLevel instead
 */
export enum AutonomyMode {
  Normal = 'normal',
  Spec = 'spec',
  AutoLow = 'auto-low',
  AutoMedium = 'auto-medium',
  AutoHigh = 'auto-high',
}

// ---------------------------------------------------------------------------
// droid/enums.ts (leaf — zero imports)
// ---------------------------------------------------------------------------

// Tool confirmation outcome options (possible user responses to permission requests)
export enum ToolConfirmationOutcome {
  ProceedOnce = 'proceed_once',
  ProceedAlways = 'proceed_always',
  /** Like ProceedAlways, but persists the exact file path instead of its parent directory. */
  ProceedAlwaysForExactPath = 'proceed_always_file',
  ProceedAutoRun = 'proceed_auto_run',
  ProceedAutoRunLow = 'proceed_auto_run_low',
  ProceedAutoRunMedium = 'proceed_auto_run_medium',
  ProceedAutoRunHigh = 'proceed_auto_run_high',
  ProceedNewSession = 'proceed_new_session',
  ProceedNewSessionLow = 'proceed_new_session_low',
  ProceedNewSessionMedium = 'proceed_new_session_medium',
  ProceedNewSessionHigh = 'proceed_new_session_high',
  ProceedEdit = 'proceed_edit',
  /** MCP: Persist approval for specific tool(s) across sessions */
  ProceedAlwaysTools = 'proceed_always_tools',
  /** MCP: Persist approval for all tools from a server across sessions */
  ProceedAlwaysServer = 'proceed_always_server',
  Cancel = 'cancel',
}

// Tool confirmation type (which tool is requesting permission)
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
  SandboxViolation = 'sandbox_violation',
}

// Sandbox violation type (filesystem read, filesystem write, or network)
export enum SandboxViolationType {
  FilesystemRead = 'filesystem-read',
  FilesystemWrite = 'filesystem-write',
  Network = 'network',
}

// Sandbox violation reason (why the access was denied)
export enum SandboxViolationReason {
  DenyList = 'deny-list',
  NotAllowed = 'not-allowed',
}

// Sandbox operation type (the type of operation that was blocked)
export enum SandboxOperationType {
  Read = 'read',
  Write = 'write',
  Network = 'network',
}

// Droid server methods (client to server communication)
export enum DroidServerMethod {
  INITIALIZE_SESSION = 'droid.initialize_session',
  LOAD_SESSION = 'droid.load_session',
  ADD_USER_MESSAGE = 'droid.add_user_message',
  RESOLVE_QUEUED_USER_MESSAGE = 'droid.resolve_queued_user_message',
  CLOSE_SESSION = 'droid.close_session',
  INTERRUPT_SESSION = 'droid.interrupt_session',
  KILL_WORKER_SESSION = 'droid.kill_worker_session',
  UPDATE_SESSION_SETTINGS = 'droid.update_session_settings',
  // MCP server management
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
  // Skills
  LIST_SKILLS = 'droid.list_skills',
  // Bug reports
  SUBMIT_BUG_REPORT = 'droid.submit_bug_report',
  // Rewind
  GET_REWIND_INFO = 'droid.get_rewind_info',
  EXECUTE_REWIND = 'droid.execute_rewind',
  // Compaction
  COMPACT_SESSION = 'droid.compact_session',
  // Fork
  FORK_SESSION = 'droid.fork_session',
  // Rename
  RENAME_SESSION = 'droid.rename_session',
  // Context stats
  GET_CONTEXT_STATS = 'droid.get_context_stats',
  // Detailed context breakdown for the /context modal
  GET_CONTEXT_BREAKDOWN = 'droid.get_context_breakdown',
  // Cache warmup
  WARMUP_CACHE = 'droid.warmup_cache',
}

export enum QueuePlacement {
  EndOfTurn = 'end_of_turn',
  EndOfLoop = 'end_of_loop',
}

export enum ResolveQueuedUserMessageAction {
  UpdateQueue = 'update_queue',
  Delete = 'delete',
}

// Droid client methods (server to client communication)
export enum DroidClientMethod {
  SESSION_NOTIFICATION = 'droid.session_notification',
  REQUEST_PERMISSION = 'droid.request_permission',
  ASK_USER = 'droid.ask_user',
}

// Session notification types
export enum SessionNotificationType {
  TOOL_RESULT = 'tool_result',
  TOOL_PROGRESS_UPDATE = 'tool_progress_update',
  CREATE_MESSAGE = 'create_message',
  ERROR = 'error',
  DROID_WORKING_STATE_CHANGED = 'droid_working_state_changed',
  SESSION_COMPACTED = 'session_compacted',
  LOOP_STATE_CHANGED = 'loop_state_changed',
  PERMISSION_RESOLVED = 'permission_resolved',
  SETTINGS_UPDATED = 'settings_updated',
  SESSION_TITLE_UPDATED = 'session_title_updated',
  MCP_STATUS_CHANGED = 'mcp_status_changed',
  ASSISTANT_TEXT_DELTA = 'assistant_text_delta',
  ASSISTANT_TEXT_COMPLETE = 'assistant_text_complete',
  STRUCTURED_OUTPUT = 'structured_output',
  THINKING_TEXT_DELTA = 'thinking_text_delta',
  THINKING_TEXT_COMPLETE = 'thinking_text_complete',
  SESSION_TOKEN_USAGE_CHANGED = 'session_token_usage_changed',
  MISSION_STATE_CHANGED = 'mission_state_changed',
  MISSION_FEATURES_CHANGED = 'mission_features_changed',
  MISSION_PROGRESS_ENTRY = 'mission_progress_entry',
  MISSION_HEARTBEAT = 'mission_heartbeat',
  MISSION_WORKER_STARTED = 'mission_worker_started',
  MISSION_WORKER_COMPLETED = 'mission_worker_completed',
  MCP_AUTH_REQUIRED = 'mcp_auth_required',
  MCP_AUTH_COMPLETED = 'mcp_auth_completed',
  HOOK_EXECUTION_STARTED = 'hook_execution_started',
  HOOK_EXECUTION_COMPLETED = 'hook_execution_completed',
  TOOL_CALL = 'tool_call',
  QUEUED_MESSAGES_DISCARDED = 'queued_messages_discarded',
  /**
   * Internal daemon keep-alive signal emitted while a long-running tool
   * (e.g. Execute) is actively executing but not streaming output. Used by
   * the daemon to refresh session inactivity timeouts. Not forwarded to
   * external clients.
   */
  TOOL_EXECUTION_HEARTBEAT = 'tool_execution_heartbeat',
}

export enum StructuredOutputErrorCode {
  MissingStructuredOutput = 'missing_structured_output',
  InvalidStructuredOutput = 'invalid_structured_output',
  InvalidSchema = 'invalid_schema',
  SchemaValidationFailed = 'schema_validation_failed',
}

export enum McpAuthOutcome {
  Success = 'success',
  Cancelled = 'cancelled',
  Failed = 'failed',
}

// MCP server connection status
export enum McpServerStatus {
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnected = 'disconnected',
  Failed = 'failed',
  Disabled = 'disabled',
}

// MCP server transport type
export enum McpServerType {
  Stdio = 'stdio',
  Http = 'http',
  Sse = 'sse',
}

// Overall MCP initialization status
export enum McpStatus {
  NotInitialized = 'not-initialized',
  Initializing = 'initializing',
  Ready = 'ready',
  NoServers = 'no-servers',
  Failed = 'failed',
}

// Error types for error notifications
export enum DroidErrorType {
  CONNECTION_ERROR = 'ConnectionError',
  PROTOCOL_ERROR = 'ProtocolError',
  SESSION_ERROR = 'SessionError',
  TIMEOUT_ERROR = 'TimeoutError',
  DROID_CLIENT_ERROR = 'DroidClientError',
  PROCESS_EXIT_ERROR = 'ProcessExitError',
  ERROR = 'Error',
}

// Droid working state (represents what the agent is currently doing)
export enum DroidWorkingState {
  Idle = 'idle',
  Thinking = 'thinking',
  StreamingAssistantMessage = 'streaming_assistant_message',
  WaitingForToolConfirmation = 'waiting_for_tool_confirmation',
  ExecutingTool = 'executing_tool',
  CompactingConversation = 'compacting_conversation',
}

export enum DroidLoopStatus {
  Waiting = 'waiting',
  Running = 'running',
  Due = 'due',
  Stopped = 'stopped',
  Error = 'error',
}

export enum DroidLoopStopReason {
  UserStopped = 'user_stopped',
  ManualMessage = 'manual_message',
  Interrupted = 'interrupted',
  SessionClosed = 'session_closed',
  ProcessExited = 'process_exited',
  Error = 'error',
}

export enum ContextStatsAccuracy {
  Exact = 'exact',
  Estimated = 'estimated',
}

export enum ToolExecutionRenderStatus {
  Streaming = 'streaming',
  Pending = 'pending',
  Executing = 'executing',
  Completed = 'completed',
  Error = 'error',
}

// Session type for mission decomposition (orchestrator manages workers)
export enum DecompSessionType {
  Orchestrator = 'orchestrator',
  Worker = 'worker',
}

/** Mission state enum (used by orchestrator mission runner). */
export enum MissionState {
  /** Idle. Waiting for user to send a message. */
  AwaitingInput = 'awaiting_input',
  /** Orchestrator is creating mission artifacts after user accepted proposal. */
  Initializing = 'initializing',
  /** Runner is active, spawning/monitoring workers. User input disabled. */
  Running = 'running',
  /** User paused execution. Resumable. */
  Paused = 'paused',
  /** Worker returned control or failed. Orchestrator acts next. */
  OrchestratorTurn = 'orchestrator_turn',
  /** All features done. Terminal state. */
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
 * Discriminator on `WorkerFailedEntry.failureReason` so the MissionRunner can
 * distinguish failure modes that should auto-pause the mission (e.g. an
 * unrecoverable 402) from generic worker exits that should be requeued and
 * retried by the orchestrator.
 */
export enum WorkerFailureReason {
  /**
   * Worker LLM call returned 402 (Payment Required) and the in-process
   * Droid Core fallback path was ineligible (overage preference != droidCore,
   * already on Core, or no swap-eligible slot). The mission must auto-pause.
   */
  UnrecoverableUsage402 = 'unrecoverable_usage_402',
}

/**
 * Discriminator on `MissionPausedEntry.pauseReason`. Default (`undefined`)
 * means a user- or runner-initiated pause; structured values mark
 * automatically-triggered pauses so the UI/orchestrator can react.
 */
export enum MissionPauseReason {
  /** Worker hit an unrecoverable 402 — usage limit reached. */
  UnrecoverableUsage402 = 'unrecoverable_usage_402',
}

/**
 * Color-key discriminators for the `/context` window usage breakdown. Each key
 * maps to a CSS variable in the rendering surface (CLI chalk colors or web
 * design tokens), so adding a new category requires updating both ends.
 */
export enum ContextCategoryColorKey {
  SystemPrompt = 'systemPrompt',
  SystemTools = 'systemTools',
  McpTools = 'mcpTools',
  UserInfo = 'userInfo',
  AgentsMd = 'agentsMd',
  CustomAgents = 'customAgents',
  Skills = 'skills',
  Messages = 'messages',
}

// ---------------------------------------------------------------------------
// sessionV2/messages/enums.ts
// ---------------------------------------------------------------------------

export enum MessageVisibility {
  Both = 'both',
  LLMOnly = 'llm_only',
  UserOnly = 'user_only',
}

export enum MessageRoleNoSystem {
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
}

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
  System = 'system',
}

export enum MessageContentBlockType {
  Text = 'text',
  Image = 'image',
  Thinking = 'thinking',
  RedactedThinking = 'redacted_thinking',
  ToolUse = 'tool_use',
  ToolResult = 'tool_result',
  Document = 'document',
}

export enum DocumentSourceType {
  Base64 = 'base64',
  Text = 'text',
}

// ---------------------------------------------------------------------------
// session/sources/enums.ts
// ---------------------------------------------------------------------------

export enum SessionPlatform {
  Slack = 'slack',
  Web = 'web',
  Api = 'api',
  SessionsApi = 'sessions_api',
  Linear = 'linear',
  ReadinessRemediation = 'readiness-remediation',
  ReadinessEvaluation = 'readiness-evaluation',
  Automation = 'automation',
  WikiGeneration = 'wiki-generation',
  WikiCISetup = 'wiki-ci-setup',
}

export enum SessionOrigin {
  Web = 'web',
  Desktop = 'desktop',
  CliTui = 'cli_tui',
  CliExec = 'cli_exec',
  CliAcp = 'cli_acp',
  Slack = 'slack',
  Linear = 'linear',
  SessionsApi = 'sessions_api',
  Api = 'api',
  Automation = 'automation',
  ReadinessRemediation = 'readiness-remediation',
  ReadinessEvaluation = 'readiness-evaluation',
  WikiGeneration = 'wiki-generation',
  WikiCiSetup = 'wiki-ci-setup',
}

// ---------------------------------------------------------------------------
// llm/enums.ts (leaf subset)
// ---------------------------------------------------------------------------

export enum OpenAIPhase {
  Commentary = 'commentary',
  FinalAnswer = 'final_answer',
}

/**
 * Wire-format field name for assistant-message reasoning on the OpenAI
 * Chat Completions endpoint. OpenAI / XAI capture reasoning in `reasoning`;
 * vLLM / SGLang / Fireworks' Kimi deployments use `reasoning_content`.
 */
export enum ChatCompletionReasoningField {
  Reasoning = 'reasoning',
  ReasoningContent = 'reasoning_content',
}

/**
 * Enum defining the reasoning effort levels for LLMs.
 * This determines how much "thinking" the model does before responding.
 */
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

export enum ModelProvider {
  ANTHROPIC = 'anthropic',
  OPENAI = 'openai',
  GENERIC_CHAT_COMPLETION_API = 'generic-chat-completion-api',
  FACTORY = 'factory',
  GOOGLE = 'google',
  XAI = 'xai',
  VOYAGE = 'voyage',
  /**
   * BYOK custom models served over the AWS Bedrock Converse API
   * (`ConverseStream`). Distinct from {@link ModelProvider.ANTHROPIC}
   * Bedrock routing (which speaks the Anthropic Messages dialect over the
   * Bedrock SDK): this provider speaks the native Converse schema and is
   * never used for first-party / proxy-routed models.
   */
  BEDROCK_CONVERSE = 'bedrock-converse',
}

export enum ApiProvider {
  BEDROCK = 'bedrock', // Ideally we deprecate!
  ANTHROPIC = 'anthropic',
  VERTEX_ANTHROPIC = 'vertex_anthropic', // A minimal wrapper for Anthropic's API on GCP
  BEDROCK_ANTHROPIC = 'bedrock_anthropic', // A minimal wrapper for Anthropic's API on AWS
  BEDROCK_CONVERSE = 'bedrock_converse', // BYOK custom models over the Bedrock Converse API (metric labeling only)
  OPENAI = 'openai',
  AZURE_OPENAI = 'azure_openai',
  GOOGLE = 'google',
  XAI = 'xai',
  FIREWORKS = 'fireworks',
  BASETEN = 'baseten',
  SNOWFLAKE = 'snowflake',
}

export enum ModelKind {
  Concrete = 'concrete',
  Router = 'router',
}

export enum LLMModelTier {
  Standard = 'standard',
  // Deprecated
  Premium = 'premium',
  // Extra Usage (overage) billing tier
  Overage = 'overage',
}

// ---------------------------------------------------------------------------
// settings/enums.ts (leaf subset)
// ---------------------------------------------------------------------------

/**
 * Settings hierarchy level enum.
 * Precedence order (highest to lowest): Org -> Runtime -> Folder -> Project -> User
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

export enum DroidLocation {
  Project = 'project',
  Personal = 'personal',
}

export enum SkillLocation {
  Project = 'project',
  Personal = 'personal',
  Builtin = 'builtin',
}

export enum SandboxMode {
  PerCommand = 'per-command',
  WholeProcess = 'whole-process',
}
