import type { z } from 'zod';

import { ConnectionError, SessionError } from '../errors.js';
import {
  dispatchNotification,
  ProtocolEngine,
  type AskUserHandler,
  type NotificationCallback,
  type NotificationFilter,
  type NotificationListener,
  type PermissionHandler,
} from '../protocol.js';
import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AddUserMessageRequestParams,
  AddUserMessageResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
  CloseSessionRequestParams,
  CloseSessionResult,
  CompactSessionRequestParams,
  CompactSessionResult,
  ExecuteRewindRequestParams,
  ExecuteRewindResult,
  ContextBreakdownResult,
  ForkSessionResult,
  GetRewindInfoRequestParams,
  GetRewindInfoResult,
  InitializeSessionRequestParams,
  InitializeSessionResult,
  InterruptSessionResult,
  ListMcpServersResult,
  ListMcpToolsResult,
  ListSkillsResult,
  LoadSessionRequestParams,
  LoadSessionResult,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  RenameSessionRequestParams,
  RenameSessionResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from '../schemas/client.js';
import {
  AddMcpServerResultSchema,
  AddUserMessageResultSchema,
  AuthenticateMcpServerResultSchema,
  CloseSessionResultSchema,
  CompactSessionResultSchema,
  ExecuteRewindResultSchema,
  ContextBreakdownResultSchema,
  ForkSessionResultSchema,
  GetRewindInfoResultSchema,
  InitializeSessionResultSchema,
  InterruptSessionResultSchema,
  ListMcpServersResultSchema,
  ListMcpToolsResultSchema,
  ListSkillsResultSchema,
  LoadSessionResultSchema,
  RemoveMcpServerResultSchema,
  RenameSessionResultSchema,
  ToggleMcpServerResultSchema,
  UpdateSessionSettingsResultSchema,
} from '../schemas/client.js';
import {
  COMPACTION_TIMEOUT,
  REWIND_TIMEOUT,
  SESSION_INIT_TIMEOUT,
} from '../schemas/constants.js';
import {
  ServerRequestHandlerType,
  ToolConfirmationOutcome,
} from '../schemas/enums.js';
import type {
  AskUserRequestParams,
  AskUserResult,
  RequestPermissionHandlerResult,
  RequestPermissionRequestParams,
} from '../schemas/server.js';
import type { DroidClientTransport } from '../types.js';

/** Daemon wire methods (client -> server). */
enum DaemonMethod {
  INITIALIZE_SESSION = 'daemon.initialize_session',
  LOAD_SESSION = 'daemon.load_session',
  ADD_USER_MESSAGE = 'daemon.add_user_message',
  CLOSE_SESSION = 'daemon.close_session',
  INTERRUPT_SESSION = 'daemon.interrupt_session',
  UPDATE_SESSION_SETTINGS = 'daemon.update_session_settings',
  COMPACT_SESSION = 'daemon.compact_session',
  FORK_SESSION = 'daemon.fork_session',
  GET_CONTEXT_STATS = 'daemon.get_context_breakdown',
  RENAME_SESSION = 'daemon.rename_session',
  GET_REWIND_INFO = 'daemon.get_rewind_info',
  EXECUTE_REWIND = 'daemon.execute_rewind',
  ADD_MCP_SERVER = 'daemon.add_mcp_server',
  REMOVE_MCP_SERVER = 'daemon.remove_mcp_server',
  TOGGLE_MCP_SERVER = 'daemon.toggle_mcp_server',
  LIST_MCP_SERVERS = 'daemon.list_mcp_servers',
  LIST_MCP_TOOLS = 'daemon.list_mcp_tools',
  AUTHENTICATE_MCP_SERVER = 'daemon.authenticate_mcp_server',
  LIST_SKILLS = 'daemon.list_skills',
}

/** Maps daemon server-to-client request methods to handler types. */
const DAEMON_SERVER_REQUEST_METHODS: Record<string, ServerRequestHandlerType> =
  {
    'daemon.request_permission': ServerRequestHandlerType.Permission,
    'daemon.ask_user': ServerRequestHandlerType.AskUser,
  };

export type DaemonClientPermissionHandler = PermissionHandler;
export type DaemonClientAskUserHandler = AskUserHandler;

export interface DaemonClientOptions {
  transport: DroidClientTransport;
  apiKey: string;
}

export class DaemonClient {
  private readonly _engine: ProtocolEngine;
  private readonly _apiKey: string;
  private _sessionId: string | null = null;
  private _closed = false;

  private readonly _notificationListeners: NotificationListener[] = [];
  private _permissionHandler: DaemonClientPermissionHandler | null = null;
  private _askUserHandler: DaemonClientAskUserHandler | null = null;

  constructor(options: DaemonClientOptions) {
    this._apiKey = options.apiKey;
    this._engine = new ProtocolEngine({
      transport: options.transport,
      serverRequestMethodMap: DAEMON_SERVER_REQUEST_METHODS,
    });

    this._engine.onNotification((notification) => {
      // Remap daemon.session_notification → droid.session_notification so
      // MessageBridge/StreamStateTracker (which validate against the exec-mode
      // SessionNotificationSchema) can parse the inner notification payload.
      const normalized =
        notification['method'] === 'daemon.session_notification'
          ? { ...notification, method: 'droid.session_notification' }
          : notification;
      dispatchNotification(normalized, [...this._notificationListeners]);
    });

    this._engine.setPermissionHandler((params) =>
      this._dispatchPermissionRequest(params)
    );
    this._engine.setAskUserHandler((params) =>
      this._dispatchAskUserRequest(params)
    );
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get isConnected(): boolean {
    return !this._closed && this._engine.isHealthy;
  }

  async initializeSession(
    params: InitializeSessionRequestParams
  ): Promise<InitializeSessionResult> {
    this._ensureNotClosed();

    const result = await this._rpc(
      DaemonMethod.INITIALIZE_SESSION,
      { ...params, token: this._apiKey },
      InitializeSessionResultSchema,
      SESSION_INIT_TIMEOUT
    );
    this._sessionId = result.sessionId;
    return result;
  }

  async loadSession(
    params: LoadSessionRequestParams
  ): Promise<LoadSessionResult> {
    this._ensureNotClosed();

    const result = await this._rpc(
      DaemonMethod.LOAD_SESSION,
      { ...params, token: this._apiKey },
      LoadSessionResultSchema,
      SESSION_INIT_TIMEOUT
    );
    this._sessionId = params.sessionId;
    return result;
  }

  async addUserMessage(
    params: Pick<AddUserMessageRequestParams, 'text'> &
      Partial<
        Pick<
          AddUserMessageRequestParams,
          'images' | 'files' | 'messageId' | 'outputFormat'
        >
      >
  ): Promise<AddUserMessageResult> {
    return this._sessionRpc(
      DaemonMethod.ADD_USER_MESSAGE,
      params,
      AddUserMessageResultSchema
    );
  }

  async interruptSession(): Promise<InterruptSessionResult> {
    return this._sessionRpc(
      DaemonMethod.INTERRUPT_SESSION,
      {},
      InterruptSessionResultSchema
    );
  }

  async closeSession(
    params: CloseSessionRequestParams = {}
  ): Promise<CloseSessionResult> {
    return this._sessionRpc(
      DaemonMethod.CLOSE_SESSION,
      params,
      CloseSessionResultSchema
    );
  }

  async updateSessionSettings(
    params: Partial<UpdateSessionSettingsRequestParams>
  ): Promise<UpdateSessionSettingsResult> {
    return this._sessionRpc(
      DaemonMethod.UPDATE_SESSION_SETTINGS,
      params,
      UpdateSessionSettingsResultSchema
    );
  }

  async compactSession(
    params: CompactSessionRequestParams = {}
  ): Promise<CompactSessionResult> {
    return this._sessionRpc(
      DaemonMethod.COMPACT_SESSION,
      params,
      CompactSessionResultSchema,
      COMPACTION_TIMEOUT
    );
  }

  async forkSession(): Promise<ForkSessionResult> {
    return this._sessionRpc(
      DaemonMethod.FORK_SESSION,
      {},
      ForkSessionResultSchema
    );
  }

  async getContextBreakdown(): Promise<ContextBreakdownResult> {
    return this._sessionRpc(
      DaemonMethod.GET_CONTEXT_STATS,
      {},
      ContextBreakdownResultSchema
    );
  }

  async renameSession(
    params: RenameSessionRequestParams
  ): Promise<RenameSessionResult> {
    return this._sessionRpc(
      DaemonMethod.RENAME_SESSION,
      params,
      RenameSessionResultSchema
    );
  }

  async getRewindInfo(
    params: GetRewindInfoRequestParams
  ): Promise<GetRewindInfoResult> {
    return this._sessionRpc(
      DaemonMethod.GET_REWIND_INFO,
      params,
      GetRewindInfoResultSchema,
      REWIND_TIMEOUT
    );
  }

  async executeRewind(
    params: ExecuteRewindRequestParams
  ): Promise<ExecuteRewindResult> {
    return this._sessionRpc(
      DaemonMethod.EXECUTE_REWIND,
      params,
      ExecuteRewindResultSchema,
      REWIND_TIMEOUT
    );
  }

  async addMcpServer(
    params: AddMcpServerRequestParams
  ): Promise<AddMcpServerResult> {
    return this._sessionRpc(
      DaemonMethod.ADD_MCP_SERVER,
      params,
      AddMcpServerResultSchema
    );
  }

  async removeMcpServer(
    params: RemoveMcpServerRequestParams
  ): Promise<RemoveMcpServerResult> {
    return this._sessionRpc(
      DaemonMethod.REMOVE_MCP_SERVER,
      params,
      RemoveMcpServerResultSchema
    );
  }

  async toggleMcpServer(
    params: ToggleMcpServerRequestParams
  ): Promise<ToggleMcpServerResult> {
    return this._sessionRpc(
      DaemonMethod.TOGGLE_MCP_SERVER,
      params,
      ToggleMcpServerResultSchema
    );
  }

  async listMcpServers(): Promise<ListMcpServersResult> {
    return this._sessionRpc(
      DaemonMethod.LIST_MCP_SERVERS,
      {},
      ListMcpServersResultSchema
    );
  }

  async listMcpTools(): Promise<ListMcpToolsResult> {
    return this._sessionRpc(
      DaemonMethod.LIST_MCP_TOOLS,
      {},
      ListMcpToolsResultSchema
    );
  }

  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams
  ): Promise<AuthenticateMcpServerResult> {
    return this._sessionRpc(
      DaemonMethod.AUTHENTICATE_MCP_SERVER,
      params,
      AuthenticateMcpServerResultSchema
    );
  }

  async listSkills(): Promise<ListSkillsResult> {
    return this._sessionRpc(
      DaemonMethod.LIST_SKILLS,
      {},
      ListSkillsResultSchema
    );
  }

  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    const entry: NotificationListener = { callback, filter };
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

  setPermissionHandler(handler: DaemonClientPermissionHandler): void {
    this._permissionHandler = handler;
  }

  setAskUserHandler(handler: DaemonClientAskUserHandler): void {
    this._askUserHandler = handler;
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._notificationListeners.length = 0;
    this._permissionHandler = null;
    this._askUserHandler = null;
    await this._engine.close();
  }

  private async _rpc<T extends z.ZodTypeAny>(
    method: string,
    params: Record<string, unknown>,
    schema: T,
    timeout?: number
  ): Promise<z.output<T>> {
    const raw = await this._engine.sendRequest(method, params, timeout);
    return schema.parse(raw);
  }

  private async _sessionRpc<T extends z.ZodTypeAny>(
    method: string,
    params: Record<string, unknown>,
    schema: T,
    timeout?: number
  ): Promise<z.output<T>> {
    this._ensureNotClosed();
    this._ensureSession();
    return this._rpc(
      method,
      { sessionId: this._sessionId, ...params },
      schema,
      timeout
    );
  }

  private _dispatchPermissionRequest(
    params: RequestPermissionRequestParams
  ): RequestPermissionHandlerResult | Promise<RequestPermissionHandlerResult> {
    const handler = this._permissionHandler;
    if (handler == null) {
      return ToolConfirmationOutcome.Cancel;
    }
    return handler(params);
  }

  private _dispatchAskUserRequest(
    params: AskUserRequestParams
  ): AskUserResult | Promise<AskUserResult> {
    const handler = this._askUserHandler;
    if (handler == null) {
      return { cancelled: true, answers: [] };
    }
    return handler(params);
  }

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Daemon client has been closed. Create a new DaemonClient instance.'
      );
    }
  }

  private _ensureSession(): void {
    if (this._sessionId == null) {
      throw new SessionError(
        'No active session. Call initializeSession or loadSession first.'
      );
    }
  }
}
