import type { z } from 'zod';

import { ConnectionError, SessionError } from './errors.js';
import {
  ProtocolEngine,
  type AskUserHandler,
  type HookRequestHandler,
  type NotificationCallback,
  type NotificationFilter,
  type PermissionHandler,
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
  GetContextStatsResult,
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
  GetContextStatsResultSchema,
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
import { DroidServerMethod, ToolConfirmationOutcome } from './schemas/enums.js';
import type {
  ExecuteHooksRequestParams,
  ExecuteHooksResult,
} from './schemas/hooks.js';
import { SessionNotificationParamsSchema } from './schemas/server.js';
import type {
  AskUserRequestParams,
  AskUserResult,
  RequestPermissionHandlerResult,
  RequestPermissionRequestParams,
} from './schemas/server.js';
import type { DroidClientTransport } from './types.js';

export type ClientPermissionHandler = PermissionHandler;

export type ClientAskUserHandler = AskUserHandler;

export type ClientHookRequestHandler = HookRequestHandler;

interface ClientNotificationListener {
  readonly callback: NotificationCallback;
  readonly filter?: NotificationFilter;
}

export interface DroidClientOptions {
  /** A connected DroidClientTransport implementation. */
  transport: DroidClientTransport;

  /** Default request timeout in ms. Defaults to 30 000. */
  defaultTimeout?: number;
}

export class DroidClient {
  private readonly _engine: ProtocolEngine;
  private _sessionId: string | null = null;
  private _closed = false;

  /**
   * Client-level notification listeners.
   * Each entry is [callback, optional notification filter].
   */
  private readonly _notificationListeners: ClientNotificationListener[] = [];

  /** Client-level permission handler. */
  private _permissionHandler: ClientPermissionHandler | null = null;

  /** Client-level ask-user handler. */
  private _askUserHandler: ClientAskUserHandler | null = null;

  /** Client-level hook handler. */
  private _hookHandler: ClientHookRequestHandler | null = null;

  constructor(options: DroidClientOptions) {
    this._engine = new ProtocolEngine({
      transport: options.transport,
      defaultTimeout: options.defaultTimeout,
    });

    this._engine.onNotification((notification) => {
      this._dispatchNotification(notification);
    });

    this._engine.setPermissionHandler((params) =>
      this._dispatchPermissionRequest(params)
    );
    this._engine.setAskUserHandler((params) =>
      this._dispatchAskUserRequest(params)
    );
    this._engine.setHookHandler((params) => this._dispatchHookRequest(params));
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
    return this._rpc(method, params, schema, timeout);
  }

  private async _sessionRpcWithoutParams<T extends z.ZodTypeAny>(
    method: string,
    schema: T,
    timeout?: number
  ): Promise<z.output<T>> {
    return this._sessionRpc(method, {}, schema, timeout);
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
      DroidServerMethod.INITIALIZE_SESSION,
      params,
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
      DroidServerMethod.LOAD_SESSION,
      params,
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
      DroidServerMethod.ADD_USER_MESSAGE,
      params,
      AddUserMessageResultSchema
    );
  }

  async interruptSession(): Promise<InterruptSessionResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.INTERRUPT_SESSION,
      InterruptSessionResultSchema
    );
  }

  async killWorkerSession(
    params: KillWorkerSessionRequestParams
  ): Promise<KillWorkerSessionResult> {
    return this._sessionRpc(
      DroidServerMethod.KILL_WORKER_SESSION,
      params,
      KillWorkerSessionResultSchema
    );
  }

  async updateSessionSettings(
    params: Partial<UpdateSessionSettingsRequestParams>
  ): Promise<UpdateSessionSettingsResult> {
    return this._sessionRpc(
      DroidServerMethod.UPDATE_SESSION_SETTINGS,
      params,
      UpdateSessionSettingsResultSchema
    );
  }

  async toggleMcpServer(
    params: ToggleMcpServerRequestParams
  ): Promise<ToggleMcpServerResult> {
    return this._sessionRpc(
      DroidServerMethod.TOGGLE_MCP_SERVER,
      params,
      ToggleMcpServerResultSchema
    );
  }

  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams
  ): Promise<AuthenticateMcpServerResult> {
    return this._sessionRpc(
      DroidServerMethod.AUTHENTICATE_MCP_SERVER,
      params,
      AuthenticateMcpServerResultSchema,
      MCP_AUTH_TIMEOUT
    );
  }

  async cancelMcpAuth(
    params: CancelMcpAuthRequestParams
  ): Promise<CancelMcpAuthResult> {
    return this._sessionRpc(
      DroidServerMethod.CANCEL_MCP_AUTH,
      params,
      CancelMcpAuthResultSchema
    );
  }

  async clearMcpAuth(
    params: ClearMcpAuthRequestParams
  ): Promise<ClearMcpAuthResult> {
    return this._sessionRpc(
      DroidServerMethod.CLEAR_MCP_AUTH,
      params,
      ClearMcpAuthResultSchema
    );
  }

  async submitMcpAuthCode(
    params: SubmitMcpAuthCodeRequestParams
  ): Promise<SubmitMcpAuthCodeResult> {
    return this._sessionRpc(
      DroidServerMethod.SUBMIT_MCP_AUTH_CODE,
      params,
      SubmitMcpAuthCodeResultSchema
    );
  }

  async addMcpServer(
    params: AddMcpServerRequestParams
  ): Promise<AddMcpServerResult> {
    return this._sessionRpc(
      DroidServerMethod.ADD_MCP_SERVER,
      params,
      AddMcpServerResultSchema
    );
  }

  async removeMcpServer(
    params: RemoveMcpServerRequestParams
  ): Promise<RemoveMcpServerResult> {
    return this._sessionRpc(
      DroidServerMethod.REMOVE_MCP_SERVER,
      params,
      RemoveMcpServerResultSchema
    );
  }

  async listMcpRegistry(): Promise<ListMcpRegistryResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.LIST_MCP_REGISTRY,
      ListMcpRegistryResultSchema
    );
  }

  async listMcpTools(): Promise<ListMcpToolsResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.LIST_MCP_TOOLS,
      ListMcpToolsResultSchema
    );
  }

  async listTools(
    params: ListToolsRequestParams = {}
  ): Promise<ListToolsResult> {
    return this._sessionRpc(
      DroidServerMethod.LIST_TOOLS,
      params,
      ListToolsResultSchema
    );
  }

  async listMcpServers(): Promise<ListMcpServersResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.LIST_MCP_SERVERS,
      ListMcpServersResultSchema
    );
  }

  async toggleMcpTool(
    params: ToggleMcpToolRequestParams
  ): Promise<ToggleMcpToolResult> {
    return this._sessionRpc(
      DroidServerMethod.TOGGLE_MCP_TOOL,
      params,
      ToggleMcpToolResultSchema
    );
  }

  async listSkills(): Promise<ListSkillsResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.LIST_SKILLS,
      ListSkillsResultSchema
    );
  }

  async submitBugReport(
    params: SubmitBugReportRequestParams
  ): Promise<SubmitBugReportResult> {
    return this._sessionRpc(
      DroidServerMethod.SUBMIT_BUG_REPORT,
      params,
      SubmitBugReportResultSchema
    );
  }

  async getRewindInfo(
    params: GetRewindInfoRequestParams
  ): Promise<GetRewindInfoResult> {
    return this._sessionRpc(
      DroidServerMethod.GET_REWIND_INFO,
      params,
      GetRewindInfoResultSchema
    );
  }

  async executeRewind(
    params: ExecuteRewindRequestParams
  ): Promise<ExecuteRewindResult> {
    return this._sessionRpc(
      DroidServerMethod.EXECUTE_REWIND,
      params,
      ExecuteRewindResultSchema,
      REWIND_TIMEOUT
    );
  }

  async compactSession(
    params: CompactSessionRequestParams
  ): Promise<CompactSessionResult> {
    return this._sessionRpc(
      DroidServerMethod.COMPACT_SESSION,
      params,
      CompactSessionResultSchema,
      COMPACTION_TIMEOUT
    );
  }

  async forkSession(): Promise<ForkSessionResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.FORK_SESSION,
      ForkSessionResultSchema
    );
  }

  async getContextStats(): Promise<GetContextStatsResult> {
    return this._sessionRpcWithoutParams(
      DroidServerMethod.GET_CONTEXT_STATS,
      GetContextStatsResultSchema
    );
  }

  async renameSession(
    params: RenameSessionRequestParams
  ): Promise<RenameSessionResult> {
    return this._sessionRpc(
      DroidServerMethod.RENAME_SESSION,
      params,
      RenameSessionResultSchema
    );
  }

  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    const entry: ClientNotificationListener = { callback, filter };
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

  setPermissionHandler(handler: ClientPermissionHandler): void {
    this._permissionHandler = handler;
  }

  clearPermissionHandler(): void {
    this._permissionHandler = null;
  }

  setAskUserHandler(handler: ClientAskUserHandler): void {
    this._askUserHandler = handler;
  }

  clearAskUserHandler(): void {
    this._askUserHandler = null;
  }

  setHookHandler(handler: ClientHookRequestHandler): void {
    this._hookHandler = handler;
  }

  clearHookHandler(): void {
    this._hookHandler = null;
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    this._notificationListeners.length = 0;
    this._permissionHandler = null;
    this._askUserHandler = null;
    this._hookHandler = null;

    await this._engine.close();
  }

  private _dispatchNotification(notification: Record<string, unknown>): void {
    let notificationType: string | undefined;
    const parsed = SessionNotificationParamsSchema.safeParse(
      notification['params']
    );
    if (parsed.success) {
      notificationType = parsed.data.notification.type;
    }

    const listeners = [...this._notificationListeners];
    for (const listener of listeners) {
      if (
        listener.filter?.type != null &&
        listener.filter.type !== notificationType
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

  private _dispatchHookRequest(
    params: ExecuteHooksRequestParams
  ): ExecuteHooksResult | Promise<ExecuteHooksResult> {
    const handler = this._hookHandler;
    if (handler == null) {
      return { results: [] };
    }
    return handler(params);
  }

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Client has been closed. Create a new DroidClient instance to reconnect.'
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
