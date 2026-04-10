/**
 * Multi-turn session API for the Factory Droid SDK.
 *
 * Provides `createSession()` and `resumeSession()` factory functions that
 * return a {@link DroidSession} for multi-turn conversations with the droid
 * process. Each session manages its own transport and client lifecycle.
 *
 * @example
 * ```ts
 * import { createSession } from "@factory/droid-sdk";
 *
 * const session = await createSession({ cwd: "/my/project" });
 *
 * // Streaming turn
 * for await (const msg of session.stream("Fix the bug in main.ts")) {
 *   if (msg.type === "assistant_text_delta") {
 *     process.stdout.write(msg.text);
 *   }
 * }
 *
 * // Non-streaming turn
 * const result = await session.send("Now write tests for it");
 * console.log(result.text);
 *
 * await session.close();
 * ```
 */

import { DroidClient } from './client.js';
import type {
  ClientAskUserHandler,
  ClientPermissionHandler,
} from './client.js';
import { ConnectionError } from './errors.js';
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
  GetRewindInfoRequestParams,
  GetRewindInfoResult,
  InitializeSessionRequestParams,
  InitializeSessionResult,
  ListMcpServersResult,
  ListMcpToolsResult,
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
import type {
  AutonomyLevel,
  DroidInteractionMode,
  ReasoningEffort,
} from './schemas/enums.js';
import type { Base64ImageSource, DocumentSource } from './schemas/messages.js';
import {
  convertNotificationToStreamMessage,
  StreamStateTracker,
} from './stream.js';
import type { DroidMessage, TokenUsageUpdate } from './stream.js';
import { ProcessTransport } from './transport.js';
import type { DroidClientTransport, ProcessTransportOptions } from './types.js';

// ---------------------------------------------------------------------------
// DroidResult
// ---------------------------------------------------------------------------

/**
 * Aggregated result from a non-streaming `session.send()` call.
 *
 * Contains the concatenated assistant text, all messages received during
 * the turn, and the final token usage.
 */
export interface DroidResult {
  /** Concatenated text from all `assistant_text_delta` messages. */
  text: string;

  /** All DroidMessage objects received during the turn. */
  messages: DroidMessage[];

  /** Final token usage from the turn, or null if no token usage was reported. */
  tokenUsage: TokenUsageUpdate | null;
}

// ---------------------------------------------------------------------------
// SessionOptions
// ---------------------------------------------------------------------------

/**
 * Options for `createSession()`.
 */
export interface CreateSessionOptions {
  /** Working directory for the session. Defaults to `"."`. */
  cwd?: string;

  /** Machine identifier. Defaults to `"default"`. */
  machineId?: string;

  /** LLM model identifier. */
  modelId?: string;

  /** Autonomy level for the session. */
  autonomyLevel?: AutonomyLevel;

  /** Interaction mode for the session. */
  interactionMode?: DroidInteractionMode;

  /** Reasoning effort level. */
  reasoningEffort?: ReasoningEffort;

  /** MCP server configurations for the session. */
  mcpServers?: McpServerConfig[];

  /** Additional tool IDs to enable. */
  enabledToolIds?: string[];

  /** Path to the `droid` executable. Defaults to `"droid"`. */
  execPath?: string;

  /** Additional arguments for the droid executable. */
  execArgs?: string[];

  /** Additional environment variables for the subprocess. */
  env?: Record<string, string>;

  /** Permission handler for tool confirmations. */
  permissionHandler?: ClientPermissionHandler;

  /** Ask-user handler for interactive questions. */
  askUserHandler?: ClientAskUserHandler;

  /**
   * An already-connected transport to use instead of spawning a process.
   * When provided, `execPath`, `execArgs`, `env`, and `cwd` (for transport) are ignored.
   */
  transport?: DroidClientTransport;
}

/**
 * Options for `resumeSession()`.
 */
export interface ResumeSessionOptions {
  /** Path to the `droid` executable. Defaults to `"droid"`. */
  execPath?: string;

  /** Additional arguments for the droid executable. */
  execArgs?: string[];

  /** Working directory for the subprocess. */
  cwd?: string;

  /** Additional environment variables for the subprocess. */
  env?: Record<string, string>;

  /** MCP server configurations. */
  mcpServers?: McpServerConfig[];

  /** Permission handler for tool confirmations. */
  permissionHandler?: ClientPermissionHandler;

  /** Ask-user handler for interactive questions. */
  askUserHandler?: ClientAskUserHandler;

  /**
   * An already-connected transport to use instead of spawning a process.
   */
  transport?: DroidClientTransport;
}

/**
 * Options for `session.stream()` and `session.send()`.
 */
export interface MessageOptions {
  /** Optional images to include with the message. */
  images?: Base64ImageSource[];

  /** Optional files to include with the message. */
  files?: DocumentSource[];
}

// ---------------------------------------------------------------------------
// DroidSession
// ---------------------------------------------------------------------------

/**
 * A multi-turn session connected to a droid process.
 *
 * Provides methods for sending messages (streaming and non-streaming),
 * managing MCP servers, updating settings, and controlling the session
 * lifecycle.
 *
 * Create instances via {@link createSession} or {@link resumeSession}.
 */
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

  // ------------------------------------------------------------------
  // Properties
  // ------------------------------------------------------------------

  /** The session ID. */
  get sessionId(): string {
    return this._sessionId;
  }

  /** The result from session initialization or loading. */
  get initResult(): InitializeSessionResult | LoadSessionResult {
    return this._initResult;
  }

  // ------------------------------------------------------------------
  // Messaging
  // ------------------------------------------------------------------

  /**
   * Send a message and return a streaming async generator of DroidMessage events.
   *
   * The generator yields messages until a TurnComplete event is received,
   * signaling the end of the agent's turn.
   *
   * @param text - The user message text.
   * @param options - Optional images/files to include.
   * @returns An async generator yielding DroidMessage events.
   */
  async *stream(
    text: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidMessage, void, undefined> {
    this._ensureNotClosed();

    // Message queue for notification → stream bridging
    const messageQueue: DroidMessage[] = [];
    let resolveWaiting: (() => void) | null = null;
    let streamDone = false;

    function enqueueMessage(msg: DroidMessage): void {
      messageQueue.push(msg);
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    }

    function signalDone(): void {
      streamDone = true;
      if (resolveWaiting) {
        const resolve = resolveWaiting;
        resolveWaiting = null;
        resolve();
      }
    }

    // Fresh state tracker for this turn
    const stateTracker = new StreamStateTracker();

    // Subscribe to notifications for this turn
    const unsubscribe = this._client.onNotification((notification) => {
      const innerNotification = extractInnerNotification(notification);
      if (!innerNotification) return;

      const converted = convertNotificationToStreamMessage(innerNotification);

      if (converted === null) {
        return;
      }

      const messages = Array.isArray(converted) ? converted : [converted];

      for (const msg of messages) {
        enqueueMessage(msg);

        const additional = stateTracker.processMessage(msg);
        for (const extra of additional) {
          enqueueMessage(extra);
          if (extra.type === 'turn_complete') {
            signalDone();
          }
        }
      }
    });

    try {
      // Send the user message
      await this._client.addUserMessage({
        text,
        images: options?.images,
        files: options?.files,
      });

      // Yield messages until TurnComplete
      while (true) {
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift()!;
          yield msg;

          if (msg.type === 'turn_complete') {
            return;
          }
        }

        if (streamDone && messageQueue.length === 0) {
          return;
        }

        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }
    } finally {
      unsubscribe();
    }
  }

  /**
   * Send a message and collect the complete response (non-streaming).
   *
   * Internally consumes all stream messages and returns an aggregated
   * {@link DroidResult} with the concatenated text, all messages, and
   * final token usage.
   *
   * @param text - The user message text.
   * @param options - Optional images/files to include.
   * @returns Aggregated result with text, messages, and token usage.
   */
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
        lastTokenUsage = msg.tokenUsage;
      }
    }

    return {
      text: fullText,
      messages,
      tokenUsage: lastTokenUsage,
    };
  }

  // ------------------------------------------------------------------
  // Session control
  // ------------------------------------------------------------------

  /**
   * Interrupt the current agent turn.
   *
   * Sends an interrupt request. The agent will stop after completing
   * its current operation.
   */
  async interrupt(): Promise<void> {
    this._ensureNotClosed();
    await this._client.interruptSession();
  }

  /**
   * Close the session and release all resources.
   *
   * Closes the underlying transport and rejects any pending requests.
   * After close, the session cannot be used.
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;
    await this._client.close();
  }

  // ------------------------------------------------------------------
  // Settings
  // ------------------------------------------------------------------

  /**
   * Update session settings (model, reasoning effort, autonomy, etc.).
   *
   * @param params - Partial settings to update.
   */
  async updateSettings(
    params: Partial<UpdateSessionSettingsRequestParams>
  ): Promise<UpdateSessionSettingsResult> {
    this._ensureNotClosed();
    return this._client.updateSessionSettings(params);
  }

  // ------------------------------------------------------------------
  // MCP methods
  // ------------------------------------------------------------------

  /**
   * Add an MCP server to the session.
   */
  async addMcpServer(
    params: AddMcpServerRequestParams
  ): Promise<AddMcpServerResult> {
    this._ensureNotClosed();
    return this._client.addMcpServer(params);
  }

  /**
   * Remove an MCP server from the session.
   */
  async removeMcpServer(
    params: RemoveMcpServerRequestParams
  ): Promise<RemoveMcpServerResult> {
    this._ensureNotClosed();
    return this._client.removeMcpServer(params);
  }

  /**
   * Toggle an MCP server on or off.
   */
  async toggleMcpServer(
    params: ToggleMcpServerRequestParams
  ): Promise<ToggleMcpServerResult> {
    this._ensureNotClosed();
    return this._client.toggleMcpServer(params);
  }

  /**
   * List MCP servers and their status.
   */
  async listMcpServers(): Promise<ListMcpServersResult> {
    this._ensureNotClosed();
    return this._client.listMcpServers();
  }

  /**
   * List available MCP tools.
   */
  async listMcpTools(): Promise<ListMcpToolsResult> {
    this._ensureNotClosed();
    return this._client.listMcpTools();
  }

  /**
   * Authenticate an MCP server (OAuth flow).
   */
  async authenticateMcpServer(
    params: AuthenticateMcpServerRequestParams
  ): Promise<AuthenticateMcpServerResult> {
    this._ensureNotClosed();
    return this._client.authenticateMcpServer(params);
  }

  // ------------------------------------------------------------------
  // Skills
  // ------------------------------------------------------------------

  /**
   * List available skills.
   */
  async listSkills(): Promise<ListSkillsResult> {
    this._ensureNotClosed();
    return this._client.listSkills();
  }

  // ------------------------------------------------------------------
  // Rewind / Compact / Fork
  // ------------------------------------------------------------------

  /**
   * Get rewind info for a specific message.
   */
  async getRewindInfo(
    params: GetRewindInfoRequestParams
  ): Promise<GetRewindInfoResult> {
    this._ensureNotClosed();
    return this._client.getRewindInfo(params);
  }

  /**
   * Execute a rewind to a specific message.
   */
  async executeRewind(
    params: ExecuteRewindRequestParams
  ): Promise<ExecuteRewindResult> {
    this._ensureNotClosed();
    return this._client.executeRewind(params);
  }

  /**
   * Compact the session conversation.
   */
  async compactSession(
    params?: CompactSessionRequestParams
  ): Promise<CompactSessionResult> {
    this._ensureNotClosed();
    return this._client.compactSession(params ?? {});
  }

  /**
   * Fork the current session.
   */
  async forkSession(): Promise<ForkSessionResult> {
    this._ensureNotClosed();
    return this._client.forkSession();
  }

  // ------------------------------------------------------------------
  // Notification subscription
  // ------------------------------------------------------------------

  /**
   * Register a callback for incoming notification messages.
   *
   * @param callback - Invoked with the notification object.
   * @param filter - Optional filter to only receive specific notification types.
   * @returns An unsubscribe function.
   */
  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    return this._client.onNotification(callback, filter);
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Session has been closed. Create a new session to continue.'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

/**
 * Create a new droid session.
 *
 * Spawns a transport, creates a client, initializes a new session, and
 * returns a {@link DroidSession} ready for multi-turn interaction.
 *
 * @param options - Session configuration.
 * @returns A connected DroidSession.
 *
 * @example
 * ```ts
 * const session = await createSession({ cwd: "/my/project" });
 * const result = await session.send("List all TypeScript files");
 * console.log(result.text);
 * await session.close();
 * ```
 */
export async function createSession(
  options: CreateSessionOptions = {}
): Promise<DroidSession> {
  // 1. Create transport
  let transport: DroidClientTransport;
  if (options.transport) {
    transport = options.transport;
  } else {
    const transportOptions: ProcessTransportOptions = {
      execPath: options.execPath,
      execArgs: options.execArgs,
      cwd: options.cwd,
      env: options.env,
    };
    const processTransport = new ProcessTransport(transportOptions);
    await processTransport.connect();
    transport = processTransport;
  }

  // 2. Create client
  const client = new DroidClient({ transport });

  // 3. Set up handlers
  if (options.permissionHandler) {
    client.setPermissionHandler(options.permissionHandler);
  }
  if (options.askUserHandler) {
    client.setAskUserHandler(options.askUserHandler);
  }

  // 4. Initialize session
  const initParams: InitializeSessionRequestParams = {
    machineId: options.machineId ?? 'default',
    cwd: options.cwd ?? '.',
    ...(options.modelId !== undefined && { modelId: options.modelId }),
    ...(options.autonomyLevel !== undefined && {
      autonomyLevel: options.autonomyLevel,
    }),
    ...(options.interactionMode !== undefined && {
      interactionMode: options.interactionMode,
    }),
    ...(options.reasoningEffort !== undefined && {
      reasoningEffort: options.reasoningEffort,
    }),
    ...(options.mcpServers !== undefined && {
      mcpServers: options.mcpServers,
    }),
    ...(options.enabledToolIds !== undefined && {
      enabledToolIds: options.enabledToolIds,
    }),
  };

  try {
    const initResult = await client.initializeSession(initParams);

    return new DroidSession(client, initResult.sessionId, initResult);
  } catch (error) {
    // Clean up on init failure
    try {
      await client.close();
    } catch {
      // Best-effort cleanup
    }
    throw error;
  }
}

/**
 * Resume an existing droid session.
 *
 * Spawns a transport, creates a client, loads the existing session by ID,
 * and returns a {@link DroidSession} ready for multi-turn interaction.
 *
 * @param sessionId - The ID of the session to resume.
 * @param options - Optional configuration for the transport and handlers.
 * @returns A connected DroidSession.
 * @throws {SessionNotFoundError} If the session ID does not exist.
 *
 * @example
 * ```ts
 * const session = await resumeSession("sess-abc123");
 * const result = await session.send("Continue where we left off");
 * console.log(result.text);
 * await session.close();
 * ```
 */
export async function resumeSession(
  sessionId: string,
  options: ResumeSessionOptions = {}
): Promise<DroidSession> {
  // 1. Create transport
  let transport: DroidClientTransport;
  if (options.transport) {
    transport = options.transport;
  } else {
    const transportOptions: ProcessTransportOptions = {
      execPath: options.execPath,
      execArgs: options.execArgs,
      cwd: options.cwd,
      env: options.env,
    };
    const processTransport = new ProcessTransport(transportOptions);
    await processTransport.connect();
    transport = processTransport;
  }

  // 2. Create client
  const client = new DroidClient({ transport });

  // 3. Set up handlers
  if (options.permissionHandler) {
    client.setPermissionHandler(options.permissionHandler);
  }
  if (options.askUserHandler) {
    client.setAskUserHandler(options.askUserHandler);
  }

  // 4. Load session
  const loadParams: LoadSessionRequestParams = {
    sessionId,
    mcpServers: options.mcpServers,
  };

  try {
    const loadResult = await client.loadSession(loadParams);
    return new DroidSession(client, sessionId, loadResult);
  } catch (error) {
    // Clean up on load failure
    try {
      await client.close();
    } catch {
      // Best-effort cleanup
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the inner notification payload from a JSON-RPC notification.
 * Returns null if the structure is not a valid session notification.
 */
function extractInnerNotification(
  notification: Record<string, unknown>
): Record<string, unknown> | null {
  const params = notification['params'];
  if (typeof params !== 'object' || params === null) return null;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime-guarded narrowing
  const paramsRecord = params as Record<string, unknown>;
  const inner = paramsRecord['notification'];
  if (typeof inner !== 'object' || inner === null) return null;
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime-guarded narrowing
  return inner as Record<string, unknown>;
}
