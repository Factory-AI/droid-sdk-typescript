import { DroidClient } from './client.js';
import { ConnectionError } from './errors.js';
import {
  buildInitParams,
  closeQuietly,
  createConfiguredClient,
  streamFromClient,
  wireAbortSignal,
} from './helpers.js';
import type {
  HandlerOptions,
  MessageBridge,
  MessageOptions,
  SessionInitOptions,
  TransportCreationOptions,
} from './helpers.js';
import { startSdkMcpServers } from './mcp.js';
import type { DroidMcpServerConfig } from './mcp.js';
import type { NotificationCallback, NotificationFilter } from './protocol.js';
import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
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
  InitializeSessionResult,
  ListMcpServersResult,
  ListMcpToolsResult,
  ListToolsRequestParams,
  ListToolsResult,
  ListSkillsResult,
  LoadSessionRequestParams,
  LoadSessionResult,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from './schemas/client.js';
import { DroidInteractionMode } from './schemas/enums.js';
import type {
  DroidResultMessage,
  DroidStreamEvent,
  DroidStreamMessage,
} from './stream.js';

/** Aggregated result from a one-shot {@link run} call. */
export type DroidResult = DroidResultMessage;

export interface CreateSessionOptions
  extends SessionInitOptions, HandlerOptions, TransportCreationOptions {
  abortSignal?: AbortSignal;
}

export interface ResumeSessionOptions extends Pick<
  CreateSessionOptions,
  | 'apiKey'
  | 'execPath'
  | 'execArgs'
  | 'env'
  | 'permissionHandler'
  | 'askUserHandler'
  | 'transport'
  | 'abortSignal'
> {
  mcpServers?: DroidMcpServerConfig[];
}

// eslint-disable-next-line no-barrel-files/no-barrel-files
export type { MessageOptions } from './helpers.js';

/** Create instances via {@link createSession} or {@link resumeSession}. */
export class DroidSession {
  private _client: DroidClient;
  private _sessionId: string;
  private _initResult: InitializeSessionResult | LoadSessionResult;
  private _closed = false;
  private _cleanupAbortSignal: (() => void) | null = null;
  private _cleanupCallbacks: Array<() => Promise<void> | void> = [];
  private readonly _activeBridges = new Set<MessageBridge>();

  /** @internal */
  constructor(
    client: DroidClient,
    sessionId: string,
    initResult: InitializeSessionResult | LoadSessionResult
  ) {
    this._client = client;
    this._sessionId = sessionId;
    this._initResult = initResult;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get initResult(): InitializeSessionResult | LoadSessionResult {
    return this._initResult;
  }

  /** @internal */
  setAbortSignalCleanup(cleanup: () => void): void {
    this._cleanupAbortSignal = cleanup;
  }

  /** @internal */
  addCleanup(cleanup: () => Promise<void> | void): void {
    this._cleanupCallbacks.push(cleanup);
  }

  /** Yields message-level events until the final `result` message. */
  stream(
    prompt: string,
    options?: MessageOptions & { includePartialMessages?: false }
  ): AsyncGenerator<DroidStreamMessage, void, undefined>;
  /** Yields message-level events plus partial chunks until the final `result` message. */
  stream(
    prompt: string,
    options: MessageOptions & { includePartialMessages: true }
  ): AsyncGenerator<DroidStreamEvent, void, undefined>;
  async *stream(
    prompt: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidStreamEvent, void, undefined> {
    this._ensureNotClosed();
    yield* streamFromClient(
      this._client,
      this._sessionId,
      this._activeBridges,
      prompt,
      options
    );
  }

  async interrupt(): Promise<void> {
    this._ensureNotClosed();
    await this._client.interruptSession();
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;
    this._cleanupAbortSignal?.();
    this._cleanupAbortSignal = null;
    for (const bridge of this._activeBridges) {
      bridge.signalDone();
    }

    try {
      await this._client.closeSession({ reason: 'other' }).catch(() => {});
      await this._client.close();
    } finally {
      const cleanups = this._cleanupCallbacks.splice(0);
      await Promise.all(cleanups.map((cleanup) => cleanup()));
    }
  }

  async updateSettings(
    params: Partial<UpdateSessionSettingsRequestParams>
  ): Promise<UpdateSessionSettingsResult> {
    this._ensureNotClosed();
    return this._client.updateSessionSettings(params);
  }

  async enterSpecMode(
    params: Pick<
      UpdateSessionSettingsRequestParams,
      'specModeModelId' | 'specModeReasoningEffort'
    > = {}
  ): Promise<UpdateSessionSettingsResult> {
    this._ensureNotClosed();
    return this._client.updateSessionSettings({
      interactionMode: DroidInteractionMode.Spec,
      ...params,
    });
  }

  async addMcpServer(
    params: AddMcpServerRequestParams
  ): Promise<AddMcpServerResult> {
    this._ensureNotClosed();
    return this._client.addMcpServer(params);
  }

  async removeMcpServer(
    params: RemoveMcpServerRequestParams
  ): Promise<RemoveMcpServerResult> {
    this._ensureNotClosed();
    return this._client.removeMcpServer(params);
  }

  async toggleMcpServer(
    params: ToggleMcpServerRequestParams
  ): Promise<ToggleMcpServerResult> {
    this._ensureNotClosed();
    return this._client.toggleMcpServer(params);
  }

  async listMcpServers(): Promise<ListMcpServersResult> {
    this._ensureNotClosed();
    return this._client.listMcpServers();
  }

  async listMcpTools(): Promise<ListMcpToolsResult> {
    this._ensureNotClosed();
    return this._client.listMcpTools();
  }

  async listTools(
    params: ListToolsRequestParams = {}
  ): Promise<ListToolsResult> {
    this._ensureNotClosed();
    return this._client.listTools(params);
  }

  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams
  ): Promise<AuthenticateMcpServerResult> {
    this._ensureNotClosed();
    return this._client.authenticateMcpServer(params);
  }

  async listSkills(): Promise<ListSkillsResult> {
    this._ensureNotClosed();
    return this._client.listSkills();
  }

  async getRewindInfo(
    params: GetRewindInfoRequestParams
  ): Promise<GetRewindInfoResult> {
    this._ensureNotClosed();
    return this._client.getRewindInfo(params);
  }

  async executeRewind(
    params: ExecuteRewindRequestParams
  ): Promise<ExecuteRewindResult> {
    this._ensureNotClosed();
    return this._client.executeRewind(params);
  }

  async compactSession(
    params?: CompactSessionRequestParams
  ): Promise<CompactSessionResult> {
    this._ensureNotClosed();
    return this._client.compactSession(params ?? {});
  }

  async forkSession(): Promise<ForkSessionResult> {
    this._ensureNotClosed();
    return this._client.forkSession();
  }

  async getContextStats(): Promise<GetContextStatsResult> {
    this._ensureNotClosed();
    return this._client.getContextStats();
  }

  async renameSession(
    params: RenameSessionRequestParams
  ): Promise<RenameSessionResult> {
    this._ensureNotClosed();
    return this._client.renameSession(params);
  }

  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    return this._client.onNotification(callback, filter);
  }

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Session has been closed. Create a new session to continue.'
      );
    }
  }
}

export async function createSession(
  options: CreateSessionOptions
): Promise<DroidSession> {
  const { client } = await createConfiguredClient(options);
  let cleanupInitAbortSignal = options.abortSignal?.aborted
    ? () => {}
    : wireAbortSignal(options.abortSignal, () => {
        void closeQuietly(client);
      });
  let sdkMcpServers: Awaited<ReturnType<typeof startSdkMcpServers>> | undefined;

  try {
    sdkMcpServers = await startSdkMcpServers(options.mcpServers);
    const initParams = buildInitParams({
      ...options,
      mcpServers: sdkMcpServers.mcpServers,
    });
    const initResult = await client.initializeSession(initParams);
    const session = new DroidSession(client, initResult.sessionId, initResult);
    session.addCleanup(sdkMcpServers.cleanup);
    cleanupInitAbortSignal();
    cleanupInitAbortSignal = () => {};
    session.setAbortSignalCleanup(
      wireAbortSignal(options.abortSignal, () => {
        void session.close();
      })
    );

    return session;
  } catch (error) {
    cleanupInitAbortSignal();
    await sdkMcpServers?.cleanup();
    await closeQuietly(client);
    throw error;
  }
}

/**
 * Resumes an existing Droid session.
 *
 * The resumed session always runs in the working directory that was persisted
 * with the session at creation time. `resumeSession()` intentionally does not
 * accept a `cwd` option: the persisted session cwd is authoritative. The
 * underlying subprocess is launched in the host process's `process.cwd()`, but
 * this does not affect the session's working directory as far as the Droid is
 * concerned. To run in a different directory, create a new session or fork the
 * existing one.
 *
 * @throws {SessionNotFoundError} If the session ID does not exist.
 */
export async function resumeSession(
  sessionId: string,
  options: ResumeSessionOptions
): Promise<DroidSession> {
  const { client } = await createConfiguredClient(options);
  let sdkMcpServers: Awaited<ReturnType<typeof startSdkMcpServers>> | undefined;

  try {
    sdkMcpServers = await startSdkMcpServers(options.mcpServers);
    const loadParams: LoadSessionRequestParams = {
      sessionId,
      mcpServers: sdkMcpServers.mcpServers,
    };
    const loadResult = await client.loadSession(loadParams);
    const session = new DroidSession(client, sessionId, loadResult);
    session.addCleanup(sdkMcpServers.cleanup);
    session.setAbortSignalCleanup(
      wireAbortSignal(options.abortSignal, () => {
        void session.close();
      })
    );

    return session;
  } catch (error) {
    await sdkMcpServers?.cleanup();
    await closeQuietly(client);
    throw error;
  }
}
