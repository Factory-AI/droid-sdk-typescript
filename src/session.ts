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
  OutputFormat,
  RemoveMcpServerRequestParams,
  RemoveMcpServerResult,
  ToggleMcpServerRequestParams,
  ToggleMcpServerResult,
  UpdateSessionSettingsRequestParams,
  UpdateSessionSettingsResult,
} from './schemas/client.js';
import { DroidInteractionMode } from './schemas/enums.js';
import type { Base64ImageSource, DocumentSource } from './schemas/messages.js';
import { FactoryDroidMessageRole } from './schemas/messages.js';
import { JsonObjectSchema, type JsonObject } from './schemas/shared.js';
import { DroidMessageType } from './stream.js';
import type { DroidMessage, ErrorEvent, TokenUsageUpdate } from './stream.js';

/** Aggregated result from a one-shot {@link run} call. */
export interface DroidResult {
  /** Session that produced this result. */
  sessionId: string;
  /** Concatenated assistant text deltas emitted during the turn. */
  text: string;
  /** All stream messages emitted during the turn. */
  messages: DroidMessage[];
  /** Latest token usage update for the turn, when reported by Droid. */
  tokenUsage: TokenUsageUpdate | null;
  /** Wall-clock duration spent consuming the turn. */
  durationMs: number;
  /** Number of completed turns observed while consuming the stream. */
  turnCount: number;
  /** First error event emitted during the turn, if any. */
  error: ErrorEvent | null;
  /** Structured JSON object emitted by the turn, when requested. */
  structuredOutput: JsonObject | null;
  /** True when the stream completed without an error event. */
  success: boolean;
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
  mcpServers?: DroidMcpServerConfig[];
}

export interface MessageOptions {
  images?: Base64ImageSource[];
  files?: DocumentSource[];
  outputFormat?: OutputFormat;
  abortSignal?: AbortSignal;
}

function getAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error(
    typeof signal.reason === 'string' ? signal.reason : 'Operation aborted'
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw getAbortError(signal);
  }
}

function parseJsonObject(text: string): JsonObject | null {
  try {
    const parsed: unknown = JSON.parse(text);
    const result = JsonObjectSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function extractAssistantText(message: DroidMessage): string {
  if (message.type !== DroidMessageType.CreateMessage) {
    return '';
  }

  if (message.role !== FactoryDroidMessageRole.Assistant) {
    return '';
  }

  return message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export function aggregateMessages(
  sessionId: string,
  messages: DroidMessage[],
  startedAt: number,
  options?: MessageOptions
): DroidResult {
  let fullText = '';
  let lastTokenUsage: TokenUsageUpdate | null = null;
  let firstError: ErrorEvent | null = null;
  let structuredOutput: JsonObject | null = null;
  let finalAssistantText = '';
  let turnCount = 0;

  for (const msg of messages) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      fullText += msg.text;
    }

    const assistantText = extractAssistantText(msg);
    if (assistantText) {
      finalAssistantText = assistantText;
      if (options?.outputFormat && fullText.length === 0) {
        fullText = assistantText;
      }
    }

    if (msg.type === DroidMessageType.TokenUsageUpdate) {
      lastTokenUsage = msg;
    }

    if (msg.type === DroidMessageType.Error && firstError === null) {
      firstError = msg;
    }

    if (msg.type === DroidMessageType.TurnComplete) {
      turnCount++;
      if (msg.tokenUsage) {
        lastTokenUsage = msg.tokenUsage;
      }
    }
  }

  if (options?.outputFormat) {
    const textToParse = finalAssistantText || fullText;
    if (textToParse) {
      structuredOutput = parseJsonObject(textToParse);
    }
  }

  return {
    sessionId,
    text: fullText,
    messages,
    tokenUsage: lastTokenUsage,
    durationMs: Date.now() - startedAt,
    turnCount,
    error: firstError,
    structuredOutput,
    success: firstError === null,
  };
}

/** Create instances via {@link createSession} or {@link resumeSession}. */
export class DroidSession {
  private _client: DroidClient;
  private _sessionId: string;
  private _initResult: InitializeSessionResult | LoadSessionResult;
  private _closed = false;
  private _cleanupAbortSignal: (() => void) | null = null;
  private _cleanupCallbacks: Array<() => Promise<void> | void> = [];

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

  /** Yields {@link DroidMessage} events until `turn_complete`. */
  async *stream(
    prompt: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidMessage, void, undefined> {
    this._ensureNotClosed();
    throwIfAborted(options?.abortSignal);

    const bridge = new MessageBridge();
    const unsubscribe = this._client.onNotification(bridge.notificationHandler);
    let resolveAbort: () => void = () => {};
    const abortPromise = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    const cleanupAbortSignal = wireAbortSignal(options?.abortSignal, () => {
      bridge.signalDone();
      resolveAbort();
      void this._client.interruptSession().catch(() => {});
    });

    try {
      await Promise.race([
        this._client.addUserMessage({
          text: prompt,
          images: options?.images,
          files: options?.files,
          outputFormat: options?.outputFormat,
        }),
        abortPromise,
      ]);
      throwIfAborted(options?.abortSignal);

      for await (const msg of bridge.messages()) {
        throwIfAborted(options?.abortSignal);
        yield msg;
      }
      throwIfAborted(options?.abortSignal);
    } finally {
      cleanupAbortSignal();
      unsubscribe();
    }
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

    try {
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
  options: CreateSessionOptions = {}
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
      wireAbortSignal(options.abortSignal, () => void session.close())
    );

    return session;
  } catch (error) {
    cleanupInitAbortSignal();
    await sdkMcpServers?.cleanup();
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
      wireAbortSignal(options.abortSignal, () => void session.close())
    );

    return session;
  } catch (error) {
    await sdkMcpServers?.cleanup();
    await closeQuietly(client);
    throw error;
  }
}
