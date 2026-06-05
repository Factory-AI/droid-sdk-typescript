import { DroidClient } from './client.js';
import type {
  ClientAskUserHandler,
  ClientPermissionHandler,
} from './client.js';
import { SDK_TAG } from './constants.js';
import type { DroidMcpServerConfig } from './mcp.js';
import type {
  InitializeSessionRequestParams,
  McpServerConfig,
  OutputFormat,
  SessionSource,
  SessionTag,
} from './schemas/client.js';
import type {
  AutonomyLevel,
  DroidInteractionMode,
  ReasoningEffort,
} from './schemas/enums.js';
import type { Base64ImageSource, DocumentSource } from './schemas/messages.js';
import {
  SessionNotificationSchema,
  type SessionNotificationPayload,
} from './schemas/server.js';
import type { ToolSelectionOverrides } from './schemas/shared.js';
import {
  convertNotificationToStreamMessage,
  DroidMessageType,
  isDefaultStreamMessage,
  isInternalMessage,
  StreamStateTracker,
} from './stream.js';
import type { DroidStreamEvent, InternalDroidMessage } from './stream.js';
import { ProcessTransport } from './transport.js';
import type { DroidClientTransport, ProcessTransportOptions } from './types.js';

export function wireAbortSignal(
  signal: AbortSignal | undefined,
  onAbort: () => void
): () => void {
  if (!signal) return () => {};
  if (signal.aborted) {
    onAbort();
    return () => {};
  } else {
    const listener = () => onAbort();
    signal.addEventListener('abort', listener, { once: true });
    return () => signal.removeEventListener('abort', listener);
  }
}

function getAbortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error(
    typeof signal.reason === 'string' ? signal.reason : 'Operation aborted'
  );
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw getAbortError(signal);
  }
}

export interface MessageOptions {
  /**
   * Optional client-generated message id forwarded to add_user_message.
   * Use this when callers need to correlate later session notifications with
   * the user message that started this stream.
   */
  messageId?: string;
  images?: Base64ImageSource[];
  files?: DocumentSource[];
  outputFormat?: OutputFormat;
  includePartialMessages?: boolean;
  abortSignal?: AbortSignal;
}

interface StreamableClient {
  onNotification(handler: (n: Record<string, unknown>) => void): () => void;
  addUserMessage(params: {
    text: string;
    messageId?: string;
    images?: Base64ImageSource[];
    files?: DocumentSource[];
    outputFormat?: OutputFormat;
  }): Promise<unknown>;
  interruptSession(): Promise<unknown>;
}

export async function* streamFromClient(
  client: StreamableClient,
  sessionId: string,
  activeBridges: Set<MessageBridge>,
  prompt: string,
  options?: MessageOptions
): AsyncGenerator<DroidStreamEvent, void, undefined> {
  throwIfAborted(options?.abortSignal);

  const startedAt = Date.now();
  let resolveDone: () => void = () => {};
  const donePromise = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const bridge = new MessageBridge(resolveDone, {
    includePartialMessages: options?.includePartialMessages,
    sessionId,
    startedAt,
    outputFormat: options?.outputFormat,
  });
  activeBridges.add(bridge);
  const unsubscribe = client.onNotification(bridge.notificationHandler);
  let resolveAbort: () => void = () => {};
  const abortPromise = new Promise<void>((resolve) => {
    resolveAbort = resolve;
  });
  const cleanupAbortSignal = wireAbortSignal(options?.abortSignal, () => {
    bridge.signalDone();
    resolveAbort();
    void client.interruptSession().catch(() => {});
  });

  try {
    await Promise.race([
      client.addUserMessage({
        text: prompt,
        messageId: options?.messageId,
        images: options?.images,
        files: options?.files,
        outputFormat: options?.outputFormat,
      }),
      donePromise,
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
    activeBridges.delete(bridge);
  }
}

export function extractInnerNotification(
  notification: unknown
): SessionNotificationPayload | null {
  const parsed = SessionNotificationSchema.safeParse(notification);
  return parsed.success ? parsed.data.params.notification : null;
}

export class MessageBridge {
  private readonly _queue: DroidStreamEvent[] = [];
  private readonly _onDone: (() => void) | undefined;
  private _resolveWaiting: (() => void) | null = null;
  private _done = false;
  private readonly _stateTracker: StreamStateTracker;

  constructor(
    onDone?: () => void,
    private readonly _options: {
      includePartialMessages?: boolean;
      sessionId?: string;
      startedAt?: number;
      outputFormat?: OutputFormat;
    } = {}
  ) {
    this._onDone = onDone;
    this._stateTracker = new StreamStateTracker({
      sessionId: _options.sessionId,
      startedAt: _options.startedAt,
      hasOutputFormat: _options.outputFormat !== undefined,
    });
  }

  readonly notificationHandler = (
    notification: Record<string, unknown>
  ): void => {
    const inner = extractInnerNotification(notification);
    if (!inner) return;

    const converted = convertNotificationToStreamMessage(inner);
    if (converted === null) return;

    const messages = Array.isArray(converted) ? converted : [converted];

    for (const msg of messages) {
      const { message, additional } = this._stateTracker.processMessage(msg);
      if (message && this._shouldYield(message)) {
        this._enqueue(message);
      }

      for (const extra of additional) {
        if (this._shouldYield(extra)) {
          this._enqueue(extra);
        }
        if (extra.type === DroidMessageType.Result) {
          this._signalDone();
        }
      }
    }
  };

  signalDone(): void {
    this._signalDone();
  }

  async *messages(): AsyncGenerator<DroidStreamEvent, void, undefined> {
    while (true) {
      while (this._queue.length > 0) {
        const msg = this._queue.shift()!;
        yield msg;

        if (msg.type === DroidMessageType.Result) {
          return;
        }
      }

      if (this._done && this._queue.length === 0) {
        return;
      }

      await new Promise<void>((resolve) => {
        this._resolveWaiting = resolve;
      });
    }
  }

  private _shouldYield(
    message: InternalDroidMessage
  ): message is DroidStreamEvent {
    if (isInternalMessage(message)) {
      return false;
    }
    return this._options.includePartialMessages
      ? true
      : isDefaultStreamMessage(message);
  }

  private _enqueue(msg: DroidStreamEvent): void {
    this._queue.push(msg);
    if (this._resolveWaiting) {
      const resolve = this._resolveWaiting;
      this._resolveWaiting = null;
      resolve();
    }
  }

  private _signalDone(): void {
    const wasDone = this._done;
    this._done = true;
    if (!wasDone) {
      this._onDone?.();
    }
    if (this._resolveWaiting) {
      const resolve = this._resolveWaiting;
      this._resolveWaiting = null;
      resolve();
    }
  }
}

export interface TransportCreationOptions extends Pick<
  ProcessTransportOptions,
  'execPath' | 'execArgs' | 'cwd' | 'env'
> {
  apiKey: string;
  transport?: DroidClientTransport;
}

export async function createTransport(
  options: TransportCreationOptions
): Promise<DroidClientTransport> {
  if (options.transport) {
    return options.transport;
  }

  const transportOptions: ProcessTransportOptions = {
    execPath: options.execPath,
    execArgs: options.execArgs,
    cwd: options.cwd,
    env: { ...options.env, FACTORY_API_KEY: options.apiKey },
  };
  const processTransport = new ProcessTransport(transportOptions);
  await processTransport.connect();
  return processTransport;
}

export interface HandlerOptions {
  permissionHandler?: ClientPermissionHandler;
  askUserHandler?: ClientAskUserHandler;
}

export function setupClientHandlers(
  client: DroidClient,
  options: HandlerOptions
): void {
  if (options.permissionHandler) {
    client.setPermissionHandler(options.permissionHandler);
  }
  if (options.askUserHandler) {
    client.setAskUserHandler(options.askUserHandler);
  }
}

interface ClientCreationOptions
  extends TransportCreationOptions, HandlerOptions {}

export async function createConfiguredClient(
  options: ClientCreationOptions
): Promise<{
  transport: DroidClientTransport;
  client: DroidClient;
}> {
  const transport = await createTransport(options);
  const client = new DroidClient({ transport });
  setupClientHandlers(client, options);
  return { transport, client };
}

type Closable = {
  close(): Promise<void>;
};

export async function closeQuietly(
  resource: Closable | null | undefined
): Promise<void> {
  if (!resource) {
    return;
  }

  try {
    await resource.close();
  } catch {
    // Best-effort cleanup
  }
}

export interface SessionInitOptions extends ToolSelectionOverrides {
  apiKey: string;
  cwd?: string;
  machineId?: string;
  modelId?: string;
  autonomyLevel?: AutonomyLevel;
  interactionMode?: DroidInteractionMode;
  reasoningEffort?: ReasoningEffort;
  specModeModelId?: string;
  specModeReasoningEffort?: ReasoningEffort;
  mcpServers?: DroidMcpServerConfig[];
  sessionSource?: SessionSource;
  tags?: SessionTag[];
}

type ResolvedSessionInitOptions = Omit<
  SessionInitOptions,
  'apiKey' | 'mcpServers'
> & {
  mcpServers?: McpServerConfig[];
};

export function buildInitParams(
  options: ResolvedSessionInitOptions
): InitializeSessionRequestParams {
  return {
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
    ...(options.specModeModelId !== undefined && {
      specModeModelId: options.specModeModelId,
    }),
    ...(options.specModeReasoningEffort !== undefined && {
      specModeReasoningEffort: options.specModeReasoningEffort,
    }),
    ...(options.mcpServers !== undefined && {
      mcpServers: options.mcpServers,
    }),
    ...(options.enabledToolIds !== undefined && {
      enabledToolIds: options.enabledToolIds,
    }),
    ...(options.disabledToolIds !== undefined && {
      disabledToolIds: options.disabledToolIds,
    }),
    ...(options.sessionSource !== undefined && {
      sessionSource: options.sessionSource,
    }),
    tags: [...(options.tags ?? []), SDK_TAG],
  };
}
