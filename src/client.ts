/**
 * DroidClient — high-level typed client for the Factory Droid SDK.
 *
 * Wraps a {@link ProtocolEngine} and provides typed async methods for all
 * 19 `droid.*` JSON-RPC methods, notification subscription with type
 * filtering, and permission/ask-user handler registration.
 *
 * Built on top of the `ProtocolEngine` and a `DroidClientTransport`
 * implementation.
 */

import type { z } from 'zod';

import { ConnectionError, SessionError } from './errors.js';
import {
  ProtocolEngine,
  type NotificationCallback,
  type NotificationFilter,
} from './protocol.js';
import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AddUserMessageRequestParams,
  AddUserMessageResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
  CancelMcpAuthRequestParams,
  CancelMcpAuthResult,
  ClearMcpAuthRequestParams,
  ClearMcpAuthResult,
  CompactSessionRequestParams,
  CompactSessionResult,
  ExecuteRewindRequestParams,
  ExecuteRewindResult,
  ForkSessionResult,
  RenameSessionRequestParams,
  RenameSessionResult,
  GetRewindInfoRequestParams,
  GetRewindInfoResult,
  InitializeSessionRequestParams,
  InitializeSessionResult,
  InterruptSessionResult,
  KillWorkerSessionRequestParams,
  KillWorkerSessionResult,
  ListMcpRegistryResult,
  ListMcpServersResult,
  ListMcpToolsResult,
  ListToolsRequestParams,
  ListToolsResult,
  ListSkillsResult,
  LoadSessionRequestParams,
  LoadSessionResult,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  SubmitBugReportRequestParams,
  SubmitBugReportResult,
  SubmitMcpAuthCodeRequestParams,
  SubmitMcpAuthCodeResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  ToggleMcpToolRequestParams,
  ToggleMcpToolResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from './schemas/client.js';
import {
  AddMcpServerResultSchema,
  AddUserMessageResultSchema,
  AuthenticateMcpServerResultSchema,
  CancelMcpAuthResultSchema,
  ClearMcpAuthResultSchema,
  CompactSessionResultSchema,
  ExecuteRewindResultSchema,
  ForkSessionResultSchema,
  RenameSessionResultSchema,
  GetRewindInfoResultSchema,
  InitializeSessionResultSchema,
  InterruptSessionResultSchema,
  KillWorkerSessionResultSchema,
  ListMcpRegistryResultSchema,
  ListMcpServersResultSchema,
  ListMcpToolsResultSchema,
  ListToolsResultSchema,
  ListSkillsResultSchema,
  LoadSessionResultSchema,
  RemoveMcpServerResultSchema,
  SubmitBugReportResultSchema,
  SubmitMcpAuthCodeResultSchema,
  ToggleMcpServerResultSchema,
  ToggleMcpToolResultSchema,
  UpdateSessionSettingsResultSchema,
} from './schemas/client.js';
import {
  COMPACTION_TIMEOUT,
  MCP_AUTH_TIMEOUT,
  REWIND_TIMEOUT,
  SESSION_INIT_TIMEOUT,
} from './schemas/constants.js';
import { DroidServerMethod } from './schemas/enums.js';
import { SessionNotificationParamsSchema } from './schemas/server.js';
import type { DroidClientTransport } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Handler for server→client permission requests at the client level.
 * Receives the full request params and returns a ToolConfirmationOutcome string.
 */
export type ClientPermissionHandler = (
  params: Record<string, unknown>
) => string | Promise<string>;

/**
 * Handler for server→client ask-user requests at the client level.
 * Receives the full request params and returns a result object.
 */
export type ClientAskUserHandler = (
  params: Record<string, unknown>
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Options for constructing a DroidClient.
 */
export interface DroidClientOptions {
  /** A connected DroidClientTransport implementation. */
  transport: DroidClientTransport;

  /** Default request timeout in ms. Defaults to 30 000. */
  defaultTimeout?: number;
}

// ---------------------------------------------------------------------------
// DroidClient
// ---------------------------------------------------------------------------

/**
 * High-level typed client for the Factory Droid SDK.
 *
 * Provides async methods for all 19 `droid.*` JSON-RPC operations,
 * notification subscription with optional type filtering, and handler
 * registration for server→client requests (permissions, ask-user).
 *
 * @example
 * ```ts
 * const transport = new InMemoryTransport();
 * await transport.connect();
 * const client = new DroidClient({ transport });
 *
 * const result = await client.initializeSession({
 *   machineId: "test",
 *   cwd: "/tmp",
 * });
 *
 * await client.close();
 * ```
 */
export class DroidClient {
  private readonly _engine: ProtocolEngine;
  private _sessionId: string | null = null;
  private _closed = false;

  /**
   * Client-level notification listeners.
   * Each entry is [callback, optional type filter string].
   */
  private readonly _notificationListeners: Array<{
    callback: NotificationCallback;
    typeFilter?: string;
  }> = [];

  /** Client-level permission handler. */
  private _permissionHandler: ClientPermissionHandler | null = null;

  /** Client-level ask-user handler. */
  private _askUserHandler: ClientAskUserHandler | null = null;

  constructor(options: DroidClientOptions) {
    this._engine = new ProtocolEngine({
      transport: options.transport,
      defaultTimeout: options.defaultTimeout,
    });

    // Wire up protocol engine's notification dispatch to client-level listeners
    this._engine.onNotification((notification) => {
      this._dispatchNotification(notification);
    });

    // Wire up protocol engine's server→client request handlers
    // to client-level dispatch methods
    this._engine.setPermissionHandler((params) =>
      this._dispatchPermissionRequest(params)
    );
    this._engine.setAskUserHandler((params) =>
      this._dispatchAskUserRequest(params)
    );
  }

  // ------------------------------------------------------------------
  // Internal: RPC helper
  // ------------------------------------------------------------------

  /**
   * Send a typed RPC request and validate the response with a Zod schema.
   * Centralizes the sendRequest + parse pattern used by all 19 methods.
   */
  private async _rpc<T extends z.ZodTypeAny>(
    method: string,
    params: object,
    schema: T,
    timeout?: number
  ): Promise<z.output<T>> {
    const raw = await this._engine.sendRequest(method, params, timeout);
    return schema.parse(raw);
  }

  // ------------------------------------------------------------------
  // Properties
  // ------------------------------------------------------------------

  /**
   * Current session ID, or `null` if no session is active.
   */
  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Whether the client is in a healthy state — not closed and no
   * transport errors have occurred. Returns false after transport
   * disconnect/error.
   */
  get isConnected(): boolean {
    return !this._closed && this._engine.isHealthy;
  }

  // ------------------------------------------------------------------
  // Session lifecycle methods
  // ------------------------------------------------------------------

  /**
   * Initialize a new session.
   *
   * Sends `droid.initialize_session` with extended timeout. On success,
   * stores the session ID internally and returns the typed result.
   */
  async initializeSession(
    params: InitializeSessionRequestParams
  ): Promise<InitializeSessionResult> {
    this._ensureNotClosed();

    const result = await this._rpc(
      DroidServerMethod.INITIALIZE_SESSION,
      params,
      InitializeSessionResultSchema,
      SESSION_INIT_TIMEOUT
    );
    this._sessionId = result.sessionId;
    return result;
  }

  /**
   * Load an existing session.
   *
   * Sends `droid.load_session`. SessionNotFoundError is thrown for
   * non-existent sessions (mapped from ENTITY_NOT_FOUND by the protocol engine).
   */
  async loadSession(
    params: LoadSessionRequestParams
  ): Promise<LoadSessionResult> {
    this._ensureNotClosed();

    const result = await this._rpc(
      DroidServerMethod.LOAD_SESSION,
      params,
      LoadSessionResultSchema,
      SESSION_INIT_TIMEOUT
    );
    this._sessionId = params.sessionId;
    return result;
  }

  /**
   * Add a user message to the active session.
   *
   * Sends `droid.add_user_message` with text and optional images/files.
   */
  async addUserMessage(
    params: Pick<AddUserMessageRequestParams, 'text'> &
      Partial<
        Pick<AddUserMessageRequestParams, 'images' | 'files' | 'messageId'>
      >
  ): Promise<AddUserMessageResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.ADD_USER_MESSAGE,
      params,
      AddUserMessageResultSchema
    );
  }

  /**
   * Interrupt the current session.
   *
   * Sends `droid.interrupt_session` with empty params.
   */
  async interruptSession(): Promise<InterruptSessionResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.INTERRUPT_SESSION,
      {},
      InterruptSessionResultSchema
    );
  }

  /**
   * Kill a worker session.
   *
   * Sends `droid.kill_worker_session`.
   */
  async killWorkerSession(
    params: KillWorkerSessionRequestParams
  ): Promise<KillWorkerSessionResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.KILL_WORKER_SESSION,
      params,
      KillWorkerSessionResultSchema
    );
  }

  /**
   * Update session settings.
   *
   * Sends `droid.update_session_settings` with the provided partial settings.
   */
  async updateSessionSettings(
    params: Partial<UpdateSessionSettingsRequestParams>
  ): Promise<UpdateSessionSettingsResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.UPDATE_SESSION_SETTINGS,
      params,
      UpdateSessionSettingsResultSchema
    );
  }

  // ------------------------------------------------------------------
  // MCP methods
  // ------------------------------------------------------------------

  /**
   * Toggle an MCP server on or off.
   */
  async toggleMcpServer(
    params: ToggleMcpServerRequestParams
  ): Promise<ToggleMcpServerResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.TOGGLE_MCP_SERVER,
      params,
      ToggleMcpServerResultSchema
    );
  }

  /**
   * Authenticate an MCP server (OAuth flow).
   * Uses extended timeout (300s) since OAuth requires user interaction.
   */
  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams
  ): Promise<AuthenticateMcpServerResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.AUTHENTICATE_MCP_SERVER,
      params,
      AuthenticateMcpServerResultSchema,
      MCP_AUTH_TIMEOUT
    );
  }

  /**
   * Cancel an in-progress MCP authentication.
   */
  async cancelMcpAuth(
    params: CancelMcpAuthRequestParams
  ): Promise<CancelMcpAuthResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.CANCEL_MCP_AUTH,
      params,
      CancelMcpAuthResultSchema
    );
  }

  /**
   * Clear stored MCP authentication tokens.
   */
  async clearMcpAuth(
    params: ClearMcpAuthRequestParams
  ): Promise<ClearMcpAuthResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.CLEAR_MCP_AUTH,
      params,
      ClearMcpAuthResultSchema
    );
  }

  /**
   * Submit an MCP authentication code (OAuth callback).
   */
  async submitMcpAuthCode(
    params: SubmitMcpAuthCodeRequestParams
  ): Promise<SubmitMcpAuthCodeResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.SUBMIT_MCP_AUTH_CODE,
      params,
      SubmitMcpAuthCodeResultSchema
    );
  }

  /**
   * Add an MCP server.
   */
  async addMcpServer(
    params: AddMcpServerRequestParams
  ): Promise<AddMcpServerResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.ADD_MCP_SERVER,
      params,
      AddMcpServerResultSchema
    );
  }

  /**
   * Remove an MCP server.
   */
  async removeMcpServer(
    params: RemoveMcpServerRequestParams
  ): Promise<RemoveMcpServerResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.REMOVE_MCP_SERVER,
      params,
      RemoveMcpServerResultSchema
    );
  }

  /**
   * List available MCP registry servers.
   */
  async listMcpRegistry(): Promise<ListMcpRegistryResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.LIST_MCP_REGISTRY,
      {},
      ListMcpRegistryResultSchema
    );
  }

  /**
   * List available MCP tools.
   */
  async listMcpTools(): Promise<ListMcpToolsResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.LIST_MCP_TOOLS,
      {},
      ListMcpToolsResultSchema
    );
  }

  /**
   * List the available built-in CLI tools with their current allow/block state.
   */
  async listTools(
    params: ListToolsRequestParams = {}
  ): Promise<ListToolsResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.LIST_TOOLS,
      params,
      ListToolsResultSchema
    );
  }

  /**
   * List MCP servers with status and summary.
   */
  async listMcpServers(): Promise<ListMcpServersResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.LIST_MCP_SERVERS,
      {},
      ListMcpServersResultSchema
    );
  }

  /**
   * Toggle an MCP tool on or off.
   */
  async toggleMcpTool(
    params: ToggleMcpToolRequestParams
  ): Promise<ToggleMcpToolResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.TOGGLE_MCP_TOOL,
      params,
      ToggleMcpToolResultSchema
    );
  }

  // ------------------------------------------------------------------
  // Skills and bug report methods
  // ------------------------------------------------------------------

  /**
   * List available skills.
   */
  async listSkills(): Promise<ListSkillsResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(DroidServerMethod.LIST_SKILLS, {}, ListSkillsResultSchema);
  }

  /**
   * Submit a bug report.
   */
  async submitBugReport(
    params: SubmitBugReportRequestParams
  ): Promise<SubmitBugReportResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.SUBMIT_BUG_REPORT,
      params,
      SubmitBugReportResultSchema
    );
  }

  // ------------------------------------------------------------------
  // Rewind / Compact / Fork methods
  // ------------------------------------------------------------------

  /**
   * Get rewind info for a specific message.
   *
   * Returns file snapshots, created files, and evicted files at the
   * point of the given message.
   */
  async getRewindInfo(
    params: GetRewindInfoRequestParams
  ): Promise<GetRewindInfoResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.GET_REWIND_INFO,
      params,
      GetRewindInfoResultSchema
    );
  }

  /**
   * Execute a rewind to a specific message.
   *
   * Restores files, deletes created files, and forks the session.
   * Uses extended timeout (60s) for file operations.
   */
  async executeRewind(
    params: ExecuteRewindRequestParams
  ): Promise<ExecuteRewindResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.EXECUTE_REWIND,
      params,
      ExecuteRewindResultSchema,
      REWIND_TIMEOUT
    );
  }

  /**
   * Compact the session conversation.
   *
   * Summarizes the conversation and creates a new session.
   * Uses extended timeout (240s) for LLM summarization.
   */
  async compactSession(
    params: CompactSessionRequestParams
  ): Promise<CompactSessionResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.COMPACT_SESSION,
      params,
      CompactSessionResultSchema,
      COMPACTION_TIMEOUT
    );
  }

  /**
   * Fork the current session.
   *
   * Creates a new session that is a copy of the current session.
   */
  async forkSession(): Promise<ForkSessionResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.FORK_SESSION,
      {},
      ForkSessionResultSchema
    );
  }

  /**
   * Rename the current session.
   *
   * Sends `droid.rename_session` with the new title.
   */
  async renameSession(
    params: RenameSessionRequestParams
  ): Promise<RenameSessionResult> {
    this._ensureNotClosed();
    this._ensureSession();

    return this._rpc(
      DroidServerMethod.RENAME_SESSION,
      params,
      RenameSessionResultSchema
    );
  }

  // ------------------------------------------------------------------
  // Notification subscription
  // ------------------------------------------------------------------

  /**
   * Register a callback for incoming notification messages.
   *
   * Multiple listeners can be registered. Each receives the full parsed
   * notification object. Optionally filter by notification type.
   *
   * Listener exceptions are isolated — if one raises, others still receive
   * the event and the engine continues.
   *
   * @param callback - Invoked with the notification object.
   * @param filter - Optional filter to only receive specific notification types.
   * @returns An unsubscribe function. Calling it again is safe (no-op).
   */
  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    const entry = {
      callback,
      typeFilter: filter?.type,
    };
    this._notificationListeners.push(entry);

    let unsubscribed = false;
    return () => {
      if (!unsubscribed) {
        unsubscribed = true;
        const idx = this._notificationListeners.indexOf(entry);
        if (idx !== -1) {
          this._notificationListeners.splice(idx, 1);
        }
      }
    };
  }

  // ------------------------------------------------------------------
  // Permission/ask-user handler registration
  // ------------------------------------------------------------------

  /**
   * Register a handler for server→client permission requests.
   *
   * The handler receives the request params and should return a
   * ToolConfirmationOutcome string value. Async handlers are awaited.
   * Replaces any previously registered handler.
   */
  setPermissionHandler(handler: ClientPermissionHandler): void {
    this._permissionHandler = handler;
  }

  /**
   * Remove the permission request handler.
   * Restores default behavior: return "cancel".
   */
  clearPermissionHandler(): void {
    this._permissionHandler = null;
  }

  /**
   * Register a handler for server→client ask-user requests.
   *
   * The handler receives the request params and should return a result
   * object with `cancelled` and `answers` keys. Async handlers are awaited.
   * Replaces any previously registered handler.
   */
  setAskUserHandler(handler: ClientAskUserHandler): void {
    this._askUserHandler = handler;
  }

  /**
   * Remove the ask-user request handler.
   * Restores default behavior: return `{ cancelled: true, answers: [] }`.
   */
  clearAskUserHandler(): void {
    this._askUserHandler = null;
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  /**
   * Close the client and release all resources.
   *
   * Rejects pending requests, clears handlers and listeners, and closes
   * the protocol engine. Idempotent — safe to call multiple times.
   *
   * After close, all method calls throw ConnectionError immediately.
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    // Clear client-level state
    this._notificationListeners.length = 0;
    this._permissionHandler = null;
    this._askUserHandler = null;

    // Close the protocol engine (which closes the transport)
    await this._engine.close();
  }

  // ------------------------------------------------------------------
  // Internal: dispatch methods
  // ------------------------------------------------------------------

  /**
   * Dispatch a notification to all registered client-level listeners.
   * Filters by notification type if a type filter is set.
   * Exception in one listener does not affect others.
   */
  private _dispatchNotification(notification: Record<string, unknown>): void {
    // Extract the notification type for filtering via Zod parse
    let notificationType: string | undefined;
    const parsed = SessionNotificationParamsSchema.safeParse(
      notification['params']
    );
    if (parsed.success) {
      notificationType = parsed.data.notification.type;
    }

    // Iterate over a copy in case listeners unsubscribe during iteration
    const listeners = [...this._notificationListeners];
    for (const listener of listeners) {
      // Apply type filter if present
      if (
        listener.typeFilter != null &&
        listener.typeFilter !== notificationType
      ) {
        continue;
      }

      try {
        listener.callback(notification);
      } catch {
        // Notification listener raised — don't crash the client
      }
    }
  }

  /**
   * Dispatch to the client-level permission handler.
   * If no handler is set, returns the default "cancel" outcome.
   * If handler throws, the error propagates to the protocol engine
   * which sends an error response.
   */
  private _dispatchPermissionRequest(
    params: Record<string, unknown>
  ): string | Promise<string> {
    const handler = this._permissionHandler;
    if (handler == null) {
      return 'cancel';
    }
    return handler(params);
  }

  /**
   * Dispatch to the client-level ask-user handler.
   * If no handler is set, returns the default cancelled response.
   * If handler throws, the error propagates to the protocol engine
   * which sends an error response.
   */
  private _dispatchAskUserRequest(
    params: Record<string, unknown>
  ): Record<string, unknown> | Promise<Record<string, unknown>> {
    const handler = this._askUserHandler;
    if (handler == null) {
      return { cancelled: true, answers: [] };
    }
    return handler(params);
  }

  // ------------------------------------------------------------------
  // Internal: guards
  // ------------------------------------------------------------------

  /**
   * Throw ConnectionError if the client has been closed.
   */
  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Client has been closed. Create a new DroidClient instance to reconnect.'
      );
    }
  }

  /**
   * Throw SessionError if no active session.
   */
  private _ensureSession(): void {
    if (this._sessionId == null) {
      throw new SessionError(
        'No active session. Call initializeSession or loadSession first.'
      );
    }
  }
}
