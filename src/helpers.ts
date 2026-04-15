import { DroidClient } from './client.js';
import type {
  ClientAskUserHandler,
  ClientPermissionHandler,
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


export function wireAbortSignal(
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


export function extractInnerNotification(
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
        if (extra.type === 'turn_complete') {
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

        if (msg.type === 'turn_complete') {
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


export interface TransportCreationOptions {
  transport?: DroidClientTransport;
  execPath?: string;
  execArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
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


export interface SessionInitOptions {
  cwd?: string;
  machineId?: string;
  modelId?: string;
  autonomyLevel?: AutonomyLevel;
  interactionMode?: DroidInteractionMode;
  reasoningEffort?: ReasoningEffort;
  mcpServers?: McpServerConfig[];
  enabledToolIds?: string[];
  disabledToolIds?: string[];
  tags?: SessionTag[];
}

export function buildInitParams(
  options: SessionInitOptions
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
