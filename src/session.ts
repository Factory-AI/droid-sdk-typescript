import { DroidClient } from './client.js';
import { ConnectionError } from './errors.js';
import {
  MessageBridge,
  buildInitParams,
  closeQuietly,
  createConfiguredClient,
  wireAbortSignal,
} from './helpers.js';
import type {
  HandlerOptions,
  SessionInitOptions,
  TransportCreationOptions,
} from './helpers.js';
import type { NotificationCallback, NotificationFilter } from './protocol.js';
import type {
  AddMcpServerRequestParams,
  AddMcpServerResult,
  AuthenticateMcpServerRequestParams,
  AuthenticateMcpServerResult,
  CompactSessionRequestParams,
  CompactSessionResult,
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
  McpServerConfig,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from './schemas/client.js';
import { DroidInteractionMode } from './schemas/enums.js';
import type { Base64ImageSource, DocumentSource } from './schemas/messages.js';
import type { DroidMessage, TokenUsageUpdate } from './stream.js';

/** Aggregated result from a non-streaming `session.send()` call. */
export interface DroidResult {
  text: string;
  messages: DroidMessage[];
  tokenUsage: TokenUsageUpdate | null;
}

export interface CreateSessionOptions
  extends SessionInitOptions, HandlerOptions, TransportCreationOptions {
  abortSignal?: AbortSignal;
}

export interface ResumeSessionOptions extends Pick<
  CreateSessionOptions,
  | 'execPath'
  | 'execArgs'
  | 'cwd'
  | 'env'
  | 'permissionHandler'
  | 'askUserHandler'
  | 'transport'
  | 'abortSignal'
> {
  mcpServers?: McpServerConfig[];
}

export interface MessageOptions {
  images?: Base64ImageSource[];
  files?: DocumentSource[];
}

/** Create instances via {@link createSession} or {@link resumeSession}. */
export class DroidSession {
  private _client: DroidClient;
  private _sessionId: string;
  private _initResult: InitializeSessionResult | LoadSessionResult;
  private _closed = false;

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

  /** Yields {@link DroidMessage} events until `turn_complete`. */
  async *stream(
    text: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidMessage, void, undefined> {
    this._ensureNotClosed();

    const bridge = new MessageBridge();
    const unsubscribe = this._client.onNotification(bridge.notificationHandler);

    try {
      await this._client.addUserMessage({
        text,
        images: options?.images,
        files: options?.files,
      });

      yield* bridge.messages();
    } finally {
      unsubscribe();
    }
  }

  /** Consumes the stream and returns an aggregated {@link DroidResult}. */
  async send(text: string, options?: MessageOptions): Promise<DroidResult> {
    this._ensureNotClosed();

    const messages: DroidMessage[] = [];
    let fullText = '';
    let lastTokenUsage: TokenUsageUpdate | null = null;

    for await (const msg of this.stream(text, options)) {
      messages.push(msg);

      if (msg.type === 'assistant_text_delta') {
        fullText += msg.text;
      }

      if (msg.type === 'token_usage_update') {
        lastTokenUsage = msg;
      }

      if (msg.type === 'turn_complete' && msg.tokenUsage) {
        // Prefer the final synthesized token usage when available.
        lastTokenUsage = msg.tokenUsage;
      }
    }

    return {
      text: fullText,
      messages,
      tokenUsage: lastTokenUsage,
    };
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
    await this._client.close();
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
  options: CreateSessionOptions = {}
): Promise<DroidSession> {
  const { client } = await createConfiguredClient(options);
  const initParams = buildInitParams(options);

  try {
    const initResult = await client.initializeSession(initParams);
    const session = new DroidSession(client, initResult.sessionId, initResult);
    wireAbortSignal(options.abortSignal, () => void session.close());

    return session;
  } catch (error) {
    await closeQuietly(client);
    throw error;
  }
}

/** @throws {SessionNotFoundError} If the session ID does not exist. */
export async function resumeSession(
  sessionId: string,
  options: ResumeSessionOptions = {}
): Promise<DroidSession> {
  const { client } = await createConfiguredClient(options);

  const loadParams: LoadSessionRequestParams = {
    sessionId,
    mcpServers: options.mcpServers,
  };

  try {
    const loadResult = await client.loadSession(loadParams);
    const session = new DroidSession(client, sessionId, loadResult);
    wireAbortSignal(options.abortSignal, () => void session.close());

    return session;
  } catch (error) {
    await closeQuietly(client);
    throw error;
  }
}
