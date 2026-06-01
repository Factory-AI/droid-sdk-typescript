// Connection-level methods (shared across all daemon connections)
export enum DaemonConnectionMethod {
  AUTHENTICATE = 'daemon.authenticate',
  LOGOUT = 'daemon.logout',
}

// Connection-level events (notifications from server to client)
export enum DaemonConnectionEvent {
  CONNECTION_STATUS = 'daemon.connection_status',
}

/**
 * Connection state for daemon WebSocket connections.
 *
 * This enum contains two categories of states:
 *
 * **WebSocket connection states** (actual transport-level states):
 * - `Disconnected` - No active WebSocket connection
 * - `Connecting` - WebSocket handshake in progress
 * - `Connected` - WebSocket is open and ready
 * - `Closing` - WebSocket is closing
 *
 * **UI/UX display states** (for user feedback, not actual WS state):
 * - `LookingUpMachine` - Checking if session exists locally or in backend
 * - `StartingMachine` - Waiting for remote sandbox/machine to start before connecting
 * - `LoadingSession` - WebSocket connected, but loading session state from daemon
 * - `AuthenticationFailed` - Connection succeeded but authentication was rejected
 */
export enum ConnectionState {
  // WebSocket transport states
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Closing = 'closing',

  // UI/UX display states (WebSocket may be connected)
  LookingUpMachine = 'looking_up_machine',
  StartingMachine = 'starting_machine',
  LoadingSession = 'loading_session',
  /** @deprecated Use ConnectionStatus.lastFailure instead. Will be removed in a future version. */
  AuthenticationFailed = 'authentication_failed',
}

// Terminal-specific methods
export enum DaemonTerminalMethod {
  CREATE = 'daemon.create_terminal',
  WRITE_DATA = 'daemon.write_terminal_data',
  RESIZE = 'daemon.resize_terminal',
  CLOSE = 'daemon.close_terminal',
  LIST = 'daemon.list_terminals',
}

// Terminal-specific events (notifications from server to client)
export enum DaemonTerminalEvent {
  DATA = 'daemon.terminal_data',
  EXIT = 'daemon.terminal_exit',
  ERROR = 'daemon.terminal_error',
}

// Droid-specific methods (for daemon-managed droid sessions)
export enum DaemonDroidMethod {
  INITIALIZE_SESSION = 'daemon.initialize_session',
  LOAD_SESSION = 'daemon.load_session',
  ADD_USER_MESSAGE = 'daemon.add_user_message',
  RESOLVE_QUEUED_USER_MESSAGE = 'daemon.resolve_queued_user_message',
  INTERRUPT_SESSION = 'daemon.interrupt_session',
  CLOSE_SESSION = 'daemon.close_session',
  KILL_WORKER_SESSION = 'daemon.kill_worker_session',
  LIST_OPENED_SESSIONS = 'daemon.list_opened_sessions',
  LIST_AVAILABLE_SESSIONS = 'daemon.list_available_sessions',
  GET_SESSION_MESSAGES = 'daemon.get_session_messages',
  UPDATE_SESSION_SETTINGS = 'daemon.update_session_settings',
  START_LOOP = 'daemon.start_loop',
  STOP_LOOP = 'daemon.stop_loop',
  GET_LOOP_STATUS = 'daemon.get_loop_status',
  RUN_LOOP_NOW = 'daemon.run_loop_now',
  VALIDATE_WORKING_DIRECTORY = 'daemon.validate_working_directory',
  GET_MCP_CONFIG = 'daemon.get_mcp_config',
  UPDATE_MCP_CONFIG = 'daemon.update_mcp_config',
  TOGGLE_MCP_SERVER = 'daemon.toggle_mcp_server',
  AUTHENTICATE_MCP_SERVER = 'daemon.authenticate_mcp_server',
  CANCEL_MCP_AUTH = 'daemon.cancel_mcp_auth',
  CLEAR_MCP_AUTH = 'daemon.clear_mcp_auth',
  SUBMIT_MCP_AUTH_CODE = 'daemon.submit_mcp_auth_code',
  LIST_FILES = 'daemon.list_files',
  SEARCH_FILES = 'daemon.search_files',
  ADD_MCP_SERVER = 'daemon.add_mcp_server',
  REMOVE_MCP_SERVER = 'daemon.remove_mcp_server',
  LIST_MCP_REGISTRY = 'daemon.list_mcp_registry',
  LIST_MCP_TOOLS = 'daemon.list_mcp_tools',
  LIST_MCP_SERVERS = 'daemon.list_mcp_servers',
  TOGGLE_MCP_TOOL = 'daemon.toggle_mcp_tool',
  SEARCH_SESSIONS = 'daemon.search_sessions',
  ARCHIVE_SESSION = 'daemon.archive_session',
  UNARCHIVE_SESSION = 'daemon.unarchive_session',
  RENAME_SESSION = 'daemon.rename_session',
  LIST_SKILLS = 'daemon.list_skills',
  LIST_AVAILABLE_PLUGINS = 'daemon.list_available_plugins',
  LIST_INSTALLED_PLUGINS = 'daemon.list_installed_plugins',
  INSTALL_PLUGIN = 'daemon.install_plugin',
  UNINSTALL_PLUGIN = 'daemon.uninstall_plugin',
  UPDATE_PLUGIN = 'daemon.update_plugin',
  LIST_MARKETPLACES = 'daemon.list_marketplaces',
  ADD_MARKETPLACE = 'daemon.add_marketplace',
  REMOVE_MARKETPLACE = 'daemon.remove_marketplace',
  UPDATE_MARKETPLACE = 'daemon.update_marketplace',
  LIST_AUTOMATIONS = 'daemon.list_automations',
  RUN_AUTOMATION = 'daemon.run_automation',
  PAUSE_AUTOMATION = 'daemon.pause_automation',
  RESUME_AUTOMATION = 'daemon.resume_automation',
  GET_AUTOMATION_HISTORY = 'daemon.get_automation_history',
  GET_AUTOMATION_VISUAL = 'daemon.get_automation_visual',
  CREATE_AUTOMATION = 'daemon.create_automation',
  UPDATE_AUTOMATION_MODEL = 'daemon.update_automation_model',
  UPDATE_AUTOMATION_PRIVACY = 'daemon.update_automation_privacy',
  RENAME_AUTOMATION = 'daemon.rename_automation',
  DELETE_AUTOMATION = 'daemon.delete_automation',
  FORK_AUTOMATION = 'daemon.fork_automation',
  GET_GIT_DIFF = 'daemon.get_git_diff',
  GIT_PUSH = 'daemon.git_push',
  GIT_COMMIT = 'daemon.git_commit',
  CREATE_PR = 'daemon.create_pr',
  GET_SEMANTIC_DIFF_CACHE = 'daemon.get_semantic_diff_cache',
  SAVE_SEMANTIC_DIFF_CACHE = 'daemon.save_semantic_diff_cache',
  GENERATE_SEMANTIC_DIFF = 'daemon.generate_semantic_diff',
  GET_PROXY_TOKEN = 'daemon.get_proxy_token',
  GET_WORKSPACE_FILE_CONTENT = 'daemon.get_workspace_file_content',
  SUBMIT_BUG_REPORT = 'daemon.submit_bug_report',
  GET_REWIND_INFO = 'daemon.get_rewind_info',
  EXECUTE_REWIND = 'daemon.execute_rewind',
  COMPACT_SESSION = 'daemon.compact_session',
  FORK_SESSION = 'daemon.fork_session',
  WARMUP_CACHE = 'daemon.warmup_cache',
  GET_CONTEXT_BREAKDOWN = 'daemon.get_context_breakdown',
}

export enum DaemonGetGitDiffUnavailableReason {
  MissingSessionCwd = 'missing_session_cwd',
  NotGitRepository = 'not_git_repository',
  GitNotAvailable = 'git_not_available',
  Unknown = 'unknown',
}

// Daemon-only settings methods (handled by daemon, not forwarded to CLI)
export enum DaemonSettingsMethod {
  GET_DEFAULT_SETTINGS = 'daemon.get_default_settings',
  UPDATE_SESSION_DEFAULTS = 'daemon.update_session_defaults',
}

// Daemon management methods (lifecycle operations like updates, restarts)
export enum DaemonManagementMethod {
  TRIGGER_UPDATE = 'daemon.trigger_update',
  INSTALL_SSH_KEY = 'daemon.install_ssh_key',
}

// Daemon relay methods (request/response RPCs for relay lifecycle)
export enum DaemonRelayMethod {
  START = 'daemon.relay.start',
  STOP = 'daemon.relay.stop',
  GET_STATUS = 'daemon.relay.get_status',
}

// Daemon relay events (notifications from server to client, e.g. external disconnects)
export enum DaemonRelayEvent {
  STATUS_CHANGED = 'daemon.relay.status_changed',
}

// Session notification types defined at the daemon level
export enum DaemonSpecificNotificationType {
  SESSION_INACTIVITY = 'session_inactivity',
  SESSION_PROCESS_EXITED = 'session_process_exited',
  SESSION_CLOSED = 'session_closed',
  SESSION_UNSUBSCRIBED = 'session_unsubscribed',
  CHILD_SESSION_AVAILABLE = 'child_session_available',
}

// Droid-specific events (notifications and requests from server to client)
export enum DaemonDroidEvent {
  SESSION_NOTIFICATION = 'daemon.session_notification',
  REQUEST_PERMISSION = 'daemon.request_permission',
  ASK_USER = 'daemon.ask_user',
}

// Terminal creation errors
export enum CreateTerminalError {
  TerminalIdExists = 'TerminalIdExists',
}

// MCP Config Source
export enum McpConfigSource {
  User = 'user',
  Project = 'project',
}

// Tunnel message methods (for WebSocket tunnel protocol)

/**
 * Tracks the loading state of a session in the daemon.
 *
 * State Transitions (Event-Driven, Non-Linear):
 * - New session: NotLoaded → Loading → Loaded
 * - Existing session (direct URL): NotLoaded → Loading → Loaded
 * - Reconnection: Loaded → NotLoaded → Loading → Loaded
 * - After inactivity: Loaded → NotLoaded → Loading → Loaded
 *
 * Entry Points:
 * - NotLoaded: Default state, or via disconnect/inactivity/unsubscribed
 * - Loading: Via markSessionLoading() for new sessions, existing sessions, reloads, or reconnections
 * - Loaded: Via initializeSession() (new) or loadSession() (existing/reload)
 */
export enum SessionLoadState {
  /**
   * Session doesn't exist in daemon state yet, or became inactive.
   *
   * Effect: Default state for sessions not yet created or loaded.
   * Next State:
   * - Call markSessionLoading() → Loading (for all sessions)
   */
  NotLoaded = 'NOT_LOADED',

  /**
   * Session is fully loaded and ready for use in daemon state.
   *
   * Effect: Normal operation, all features available, UI fully interactive.
   * Next State:
   * - Via WebSocket disconnect → NotLoaded (connection lost, then reconnect flow starts)
   * - Via daemon notification → NotLoaded (inactivity timeout or unsubscribed)
   * - Via markSessionLoading() → Loading (manual reload without disconnect)
   */
  Loaded = 'LOADED',

  /**
   * Session is being loaded, initialized, or reloaded.
   *
   * Effect: Shows loading UI. Session may be new or existing.
   * Next State: When initializeSession() or loadSession() completes → Loaded
   * Usage: New session creation, initial load of existing session, reconnection, manual reload, or reload after inactive.
   */
  Loading = 'LOADING',
}

export enum SessionSearchDocKind {
  MessageText = 'message_text',
  Document = 'document',
  ToolUse = 'tool_use',
  ToolResult = 'tool_result',
}
