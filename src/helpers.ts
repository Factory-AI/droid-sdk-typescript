import { DroidClient } from './client.js';
import type {
  ClientAskUserHandler,
  ClientPermissionHandler,
} from './client.js';
import { SDK_TAG } from './constants.js';
import { ConnectionError } from './errors.js';
import type { DroidMcpServerConfig } from './mcp.js';
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
  SessionNotificationSchema,
  type SessionNotificationPayload,
} from './schemas/server.js';
import type { ToolSelectionOverrides } from './schemas/shared.js';
import {
  convertNotificationToStreamMessage,
  DroidMessageType,
  StreamStateTracker,
} from './stream.js';
import type { DroidMessage } from './stream.js';
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

export function extractInnerNotification(
  notification: unknown
): SessionNotificationPayload | null {
  const parsed = SessionNotificationSchema.safeParse(notification);
  return parsed.success ? parsed.data.params.notification : null;
}

export class MessageBridge {
  private readonly _queue: DroidMessage[] = [];
  private _resolveWaiting: (() => void) | null = null;
  private _done = false;
  private readonly _stateTracker = new StreamStateTracker();

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
      this._enqueue(message);

      for (const extra of additional) {
        this._enqueue(extra);
        if (extra.type === DroidMessageType.TurnComplete) {
          this._signalDone();
        }
      }
    }
  };

  signalDone(): void {
    this._signalDone();
  }

  async *messages(): AsyncGenerator<DroidMessage, void, undefined> {
    while (true) {
      while (this._queue.length > 0) {
        const msg = this._queue.shift()!;
        yield msg;

        if (msg.type === DroidMessageType.TurnComplete) {
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

  private _enqueue(msg: DroidMessage): void {
    this._queue.push(msg);
    if (this._resolveWaiting) {
      const resolve = this._resolveWaiting;
      this._resolveWaiting = null;
      resolve();
    }
  }

  private _signalDone(): void {
    this._done = true;
    if (this._resolveWaiting) {
      const resolve = this._resolveWaiting;
      this._resolveWaiting = null;
      resolve();
    }
  }
}

export interface TransportCreationOptions extends Pick<
  ProcessTransportOptions,
  'execPath' | 'execArgs' | 'systemPrompt' | 'cwd' | 'env'
> {
  transport?: DroidClientTransport;
}

export async function createTransport(
  options: TransportCreationOptions
): Promise<DroidClientTransport> {
  if (options.transport) {
    if (options.systemPrompt !== undefined) {
      throw new ConnectionError(
        'systemPrompt only works when the SDK creates the Droid process; omit transport or configure the custom transport directly'
      );
    }
    return options.transport;
  }

  const transportOptions: ProcessTransportOptions = {
    execPath: options.execPath,
    execArgs: options.execArgs,
    systemPrompt: options.systemPrompt,
    cwd: options.cwd,
    env: options.env,
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
  cwd?: string;
  machineId?: string;
  modelId?: string;
  autonomyLevel?: AutonomyLevel;
  interactionMode?: DroidInteractionMode;
  reasoningEffort?: ReasoningEffort;
  specModeModelId?: string;
  specModeReasoningEffort?: ReasoningEffort;
  mcpServers?: DroidMcpServerConfig[];
  tags?: SessionTag[];
}

type ResolvedSessionInitOptions = Omit<SessionInitOptions, 'mcpServers'> & {
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
    tags: [...(options.tags ?? []), SDK_TAG],
  };
}
