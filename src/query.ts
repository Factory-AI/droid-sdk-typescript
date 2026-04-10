/**
 * Top-level `query()` convenience function and supporting types.
 *
 * Provides a high-level async generator that hides the full session lifecycle
 * (spawn → connect → initialize → message → yield → close), modeled after
 * the Python Droid SDK's `query()` pattern.
 *
 * @example
 * ```ts
 * import { query } from "@factory/droid-sdk";
 *
 * const stream = query({ prompt: "Fix the bug in main.ts", cwd: "/my/project" });
 *
 * for await (const msg of stream) {
 *   if (msg.type === "assistant_text_delta") {
 *     process.stdout.write(msg.text);
 *   }
 * }
 * ```
 */

import { DroidClient } from './client.js';
import type {
  ClientPermissionHandler,
  ClientAskUserHandler,
} from './client.js';
import { SDK_TAG } from './constants.js';
import type {
  InitializeSessionRequestParams,
  McpServerConfig,
  SessionTag,
} from './schemas/client.js';
import type {
  AutonomyLevel,
  DroidInteractionMode,
  ReasoningEffort,
} from './schemas/enums.js';
import {
  convertNotificationToStreamMessage,
  StreamStateTracker,
} from './stream.js';
import type { DroidMessage } from './stream.js';
import { ProcessTransport } from './transport.js';
import type { DroidClientTransport, ProcessTransportOptions } from './types.js';

// ---------------------------------------------------------------------------
// QueryOptions
// ---------------------------------------------------------------------------

/**
 * Options for the `query()` convenience function.
 */
export interface QueryOptions {
  /** The user prompt to send. */
  prompt: string;

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

  /** Session tags for tracking and filtering. The SDK tag is always appended automatically. */
  tags?: SessionTag[];

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
   * The transport will still be closed when the query completes.
   */
  transport?: DroidClientTransport;

  /** AbortSignal for external cancellation. */
  abortSignal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// DroidQuery
// ---------------------------------------------------------------------------

/**
 * An async generator of {@link DroidMessage} events with additional control
 * methods for interrupting or aborting the query.
 *
 * Extends AsyncGenerator<DroidMessage> with:
 * - `interrupt()` — sends an interrupt request to pause the agent gracefully
 * - `abort()` — forcefully closes the transport/kills the subprocess
 * - `sessionId` — the session ID assigned during initialization
 */
export interface DroidQuery extends AsyncGenerator<
  DroidMessage,
  void,
  undefined
> {
  /** Send an interrupt_session request. The stream continues until the agent stops. */
  interrupt(): Promise<void>;

  /** Forcefully close the transport. The generator terminates immediately. */
  abort(): void;

  /**
   * The session ID, available after initialization.
   * Returns `null` if the session hasn't been initialized yet.
   */
  readonly sessionId: string | null;
}

// ---------------------------------------------------------------------------
// DroidQueryImpl
// ---------------------------------------------------------------------------

class DroidQueryImpl implements DroidQuery {
  private _generator: AsyncGenerator<DroidMessage, void, undefined>;
  private _getSessionId: () => string | null;
  private _interruptFn: () => Promise<void>;
  private _abortFn: () => void;

  constructor(
    generator: AsyncGenerator<DroidMessage, void, undefined>,
    getSessionId: () => string | null,
    interruptFn: () => Promise<void>,
    abortFn: () => void
  ) {
    this._generator = generator;
    this._getSessionId = getSessionId;
    this._interruptFn = interruptFn;
    this._abortFn = abortFn;
  }

  get sessionId(): string | null {
    return this._getSessionId();
  }

  async interrupt(): Promise<void> {
    return this._interruptFn();
  }

  abort(): void {
    this._abortFn();
  }

  next(...args: [] | [undefined]): Promise<IteratorResult<DroidMessage, void>> {
    return this._generator.next(...args);
  }

  return(
    value: void | PromiseLike<void>
  ): Promise<IteratorResult<DroidMessage, void>> {
    return this._generator.return(value);
  }

  throw(e: unknown): Promise<IteratorResult<DroidMessage, void>> {
    return this._generator.throw(e);
  }

  [Symbol.asyncIterator](): DroidQueryImpl {
    return this;
  }
}

// ---------------------------------------------------------------------------
// query() implementation
// ---------------------------------------------------------------------------

/**
 * Top-level convenience function that spawns a droid process, initializes
 * a session, sends the user prompt, and yields {@link DroidMessage} events.
 *
 * All resources (transport, client) are cleaned up in a finally block,
 * even if the caller breaks out of the generator early or an error occurs.
 *
 * @param options - Query configuration including the prompt and optional session settings.
 * @returns A {@link DroidQuery} async generator with interrupt/abort/sessionId.
 *
 * @example
 * ```ts
 * const stream = query({ prompt: "Hello", cwd: "/tmp" });
 *
 * for await (const msg of stream) {
 *   if (msg.type === "assistant_text_delta") {
 *     process.stdout.write(msg.text);
 *   }
 *   if (msg.type === "turn_complete") {
 *     console.log("\nDone! Tokens:", msg.tokenUsage);
 *   }
 * }
 *
 * // Or with interrupt:
 * const q = query({ prompt: "Write a long essay" });
 * setTimeout(() => q.interrupt(), 5000);
 * for await (const msg of q) { ... }
 * ```
 */
export function query(options: QueryOptions): DroidQuery {
  let transport: DroidClientTransport | null = null;
  let client: DroidClient | null = null;
  let sessionId: string | null = null;
  let aborted = false;

  // Message queue for notification → stream bridging
  const messageQueue: DroidMessage[] = [];
  let resolveWaiting: (() => void) | null = null;
  let streamDone = false;

  /**
   * Push a message into the queue and wake the consumer if waiting.
   */
  function enqueueMessage(msg: DroidMessage): void {
    messageQueue.push(msg);
    if (resolveWaiting) {
      const resolve = resolveWaiting;
      resolveWaiting = null;
      resolve();
    }
  }

  /**
   * Signal that streaming is complete.
   */
  function signalDone(): void {
    streamDone = true;
    if (resolveWaiting) {
      const resolve = resolveWaiting;
      resolveWaiting = null;
      resolve();
    }
  }

  /**
   * The core async generator that drives the query lifecycle.
   */
  async function* generateMessages(): AsyncGenerator<
    DroidMessage,
    void,
    undefined
  > {
    // Early exit if already aborted before generator starts
    if (aborted) return;

    // 1. Create transport
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
    client = new DroidClient({ transport });

    // 3. Set up handlers if provided
    if (options.permissionHandler) {
      client.setPermissionHandler(options.permissionHandler);
    }
    if (options.askUserHandler) {
      client.setAskUserHandler(options.askUserHandler);
    }

    // 4. Set up notification → stream bridging
    const stateTracker = new StreamStateTracker();

    client.onNotification((notification) => {
      const innerNotification = extractInnerNotification(notification);
      if (!innerNotification) return;

      const converted = convertNotificationToStreamMessage(innerNotification);

      if (converted === null) {
        return;
      }

      const messages = Array.isArray(converted) ? converted : [converted];

      for (const msg of messages) {
        const { message, additional } = stateTracker.processMessage(msg);
        enqueueMessage(message);

        for (const extra of additional) {
          enqueueMessage(extra);
          if (extra.type === 'turn_complete') {
            signalDone();
          }
        }
      }
    });

    // 5. Initialize session
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
      tags: [...(options.tags ?? []), SDK_TAG],
    };

    const initResult = await client.initializeSession(initParams);
    sessionId = initResult.sessionId;

    // 6. Send the user message
    await client.addUserMessage({ text: options.prompt });

    // 7. Yield messages from the queue until done
    try {
      while (true) {
        // If aborted externally, stop
        if (aborted) {
          return;
        }

        // Process any queued messages
        while (messageQueue.length > 0) {
          const msg = messageQueue.shift()!;
          yield msg;

          if (msg.type === 'turn_complete') {
            return;
          }
        }

        // Check if we're done (TurnComplete already yielded above)
        if (streamDone && messageQueue.length === 0) {
          return;
        }

        // Wait for more messages
        await new Promise<void>((resolve) => {
          resolveWaiting = resolve;
        });
      }
    } finally {
      // Cleanup is handled by the wrapper
    }
  }

  // Create the underlying generator
  const generator = generateMessages();

  // Wrap it with cleanup in finally
  async function* wrappedGenerator(): AsyncGenerator<
    DroidMessage,
    void,
    undefined
  > {
    try {
      yield* generator;
    } finally {
      // Always close transport on exit (even on early break)
      if (client) {
        try {
          await client.close();
        } catch {
          // Best-effort cleanup
        }
        client = null;
      } else if (transport) {
        try {
          await transport.close();
        } catch {
          // Best-effort cleanup
        }
      }
      transport = null;
    }
  }

  const droidQuery = new DroidQueryImpl(
    wrappedGenerator(),
    () => sessionId,
    async () => {
      if (client && !aborted) {
        await client.interruptSession();
      }
    },
    () => {
      aborted = true;
      signalDone();
      if (client) {
        void client.close().catch(() => {});
        client = null;
      } else if (transport) {
        void transport.close().catch(() => {});
      }
      transport = null;
    }
  );

  wireAbortSignal(options.abortSignal, () => droidQuery.abort());

  return droidQuery;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wire an AbortSignal to invoke a callback on abort.
 * Handles both already-aborted signals and future aborts.
 */
function wireAbortSignal(
  signal: AbortSignal | undefined,
  onAbort: () => void
): void {
  if (!signal) return;
  if (signal.aborted) {
    onAbort();
  } else {
    signal.addEventListener('abort', () => onAbort(), { once: true });
  }
}

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
