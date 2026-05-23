import { DroidClient } from '../client.js';
import { ConnectionError } from '../errors.js';
import { buildInitParams, setupClientHandlers } from '../helpers.js';
import { startSdkMcpServers } from '../mcp.js';
import type { LoadSessionRequestParams } from '../schemas/client.js';
import {
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
} from '../schemas/constants.js';
import { JsonRpcMessageType } from '../schemas/enums.js';
import type {
  DroidClientTransport,
  ErrorCallback,
  MessageCallback,
} from '../types.js';
import { isRecord } from '../utils.js';
import { ensureLocalDaemon, resolveLocalAuthToken } from './local.js';
import { DaemonSession } from './session.js';
import { WebSocketTransport } from './transport.js';
import {
  COMPUTER_WS_CONFIG,
  DEFAULT_DAEMON_PORT,
  DEFAULT_RELAY_BASE_URL,
  DEFAULT_WS_CONFIG,
  MachineType,
} from './types.js';
import type {
  ConnectDaemonOptions,
  DaemonResumeOptions,
  DaemonSessionOptions,
  SDKMachineConfig,
} from './types.js';

const DAEMON_AUTHENTICATE_METHOD = 'daemon.authenticate';
const DAEMON_AUTHENTICATE_TIMEOUT = 30_000;
const SDK_CALLER = 'droid-sdk';

interface ResolvedConnectOptions extends ConnectDaemonOptions {
  _localPort?: number;
}

export function resolveWebSocketUrl(
  options: ConnectDaemonOptions & { _localPort?: number }
): string {
  if (options.url) {
    return options.url;
  }

  const machine = options.machine;

  if (!machine || machine.type === MachineType.Local) {
    const port =
      options._localPort ?? options.daemonPort ?? DEFAULT_DAEMON_PORT;
    return `ws://127.0.0.1:${port}`;
  }

  if (machine.type === MachineType.Ephemeral) {
    const port = options.daemonPort ?? DEFAULT_DAEMON_PORT;
    return `wss://${port}-${machine.sandboxId}.e2b.app`;
  }

  if (machine.type === MachineType.Computer) {
    const relayBase = options.relayBaseUrl ?? DEFAULT_RELAY_BASE_URL;
    return `${relayBase}/v0/computer/${machine.computerId}/client`;
  }

  // Exhaustive check — should never be reached
  const _exhaustive: never = machine;
  throw new ConnectionError(`Unsupported machine type: ${String(_exhaustive)}`);
}

function getWebSocketConfig(
  machine?: SDKMachineConfig
): Required<import('./types.js').WebSocketTransportOptions> {
  if (machine?.type === MachineType.Computer) {
    return { ...DEFAULT_WS_CONFIG, ...COMPUTER_WS_CONFIG };
  }
  if (!machine || machine.type === MachineType.Local) {
    return { ...DEFAULT_WS_CONFIG, connectionTimeoutMs: 10_000 };
  }
  return { ...DEFAULT_WS_CONFIG };
}

interface MultiplexedView {
  messageCallback: MessageCallback | null;
  errorCallback: ErrorCallback | null;
  pendingRequestIds: Set<string>;
  sessionId: string | null;
}

/**
 * Multiplexes a single WebSocketTransport across multiple DroidClient
 * instances. Each client gets its own "view" of the transport:
 * - Responses are routed to the view that sent the matching request
 * - Notifications are routed by `params.sessionId` to the matching view
 * - Errors are broadcast to all registered views
 * - send() writes to the shared transport and tracks request IDs
 * - close() is a no-op (only DaemonConnection closes the real transport)
 */
class SharedTransportMultiplexer {
  private readonly _views = new Set<MultiplexedView>();

  constructor(private readonly _inner: WebSocketTransport) {
    this._inner.onMessage((message) => {
      this._routeMessage(message);
    });

    this._inner.onError((error) => {
      for (const view of this._views) {
        if (view.errorCallback) {
          try {
            view.errorCallback(error);
          } catch {
            // Don't let one handler crash others
          }
        }
      }
    });
  }

  createView(): DroidClientTransport {
    const inner = this._inner;
    const viewState: MultiplexedView = {
      messageCallback: null,
      errorCallback: null,
      pendingRequestIds: new Set(),
      sessionId: null,
    };
    this._views.add(viewState);

    const view: DroidClientTransport = {
      send: (message: Record<string, unknown>) => {
        // Track request IDs for response routing
        if (message['type'] === 'request' && typeof message['id'] === 'string') {
          viewState.pendingRequestIds.add(message['id']);
        }
        // Track sessionId from init/load responses
        inner.send(message);
      },

      onMessage: (callback: MessageCallback) => {
        viewState.messageCallback = callback;
      },

      onError: (callback: ErrorCallback) => {
        viewState.errorCallback = callback;
      },

      close: async () => {
        viewState.messageCallback = null;
        viewState.errorCallback = null;
        viewState.pendingRequestIds.clear();
        this._views.delete(viewState);
      },

      get isConnected(): boolean {
        return inner.isConnected;
      },
    };

    return view;
  }

  private _routeMessage(message: Record<string, unknown>): void {
    const messageType = message['type'];
    const messageId = message['id'];

    // Responses: route to the view that sent the matching request
    if (messageType === 'response' && typeof messageId === 'string') {
      for (const view of this._views) {
        if (view.pendingRequestIds.has(messageId)) {
          view.pendingRequestIds.delete(messageId);

          // Learn sessionId from init/load response results
          const result = message['result'];
          if (isRecord(result) && typeof result['sessionId'] === 'string') {
            view.sessionId = result['sessionId'];
          }

          if (view.messageCallback) {
            try {
              view.messageCallback(message);
            } catch {
              // Don't crash the router
            }
          }
          return;
        }
      }
      // No matching view — drop silently
      return;
    }

    // Notifications: route by params.sessionId
    if (messageType === 'notification') {
      const params = message['params'];
      const sessionId =
        isRecord(params) && typeof params['sessionId'] === 'string'
          ? params['sessionId']
          : null;

      if (sessionId) {
        for (const view of this._views) {
          if (view.sessionId === sessionId && view.messageCallback) {
            try {
              view.messageCallback(message);
            } catch {
              // Don't crash the router
            }
            return;
          }
        }
      }

      // No sessionId or no matching view — broadcast to all
      for (const view of this._views) {
        if (view.messageCallback) {
          try {
            view.messageCallback(message);
          } catch {
            // Don't crash the router
          }
        }
      }
      return;
    }

    // Server requests (daemon.request_permission, daemon.ask_user):
    // route by params.sessionId
    if (messageType === 'request') {
      const params = message['params'];
      const sessionId =
        isRecord(params) && typeof params['sessionId'] === 'string'
          ? params['sessionId']
          : null;

      if (sessionId) {
        for (const view of this._views) {
          if (view.sessionId === sessionId && view.messageCallback) {
            try {
              view.messageCallback(message);
            } catch {
              // Don't crash the router
            }
            return;
          }
        }
      }

      // Broadcast if no matching session (shouldn't happen in practice)
      for (const view of this._views) {
        if (view.messageCallback) {
          try {
            view.messageCallback(message);
          } catch {
            // Don't crash the router
          }
        }
      }
    }
  }
}

/**
 * Authenticate with the daemon over a freshly connected transport.
 *
 * This runs before any DroidClient/ProtocolEngine is attached, so we
 * do the JSON-RPC handshake manually. We temporarily install a message
 * handler, send the authenticate request, wait for the matching
 * response, then clear the handler so the ProtocolEngine can take over.
 */
async function authenticate(
  transport: WebSocketTransport,
  options: ConnectDaemonOptions
): Promise<void> {
  const requestId = crypto.randomUUID();

  const envelope: Record<string, unknown> = {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: JsonRpcMessageType.Request,
    id: requestId,
    method: DAEMON_AUTHENTICATE_METHOD,
    params: {
      ...(options.apiKey ? { apiKey: options.apiKey } : {}),
      ...(options.token ? { token: options.token } : {}),
      caller: SDK_CALLER,
    },
  };

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Clear handler so ProtocolEngine can install its own
      transport.onMessage(() => {});
      reject(
        new ConnectionError(
          `Daemon authentication timed out after ${DAEMON_AUTHENTICATE_TIMEOUT}ms`
        )
      );
    }, DAEMON_AUTHENTICATE_TIMEOUT);

    transport.onMessage((message: Record<string, unknown>) => {
      // Only handle the auth response
      if (message['id'] !== requestId) {
        return;
      }

      clearTimeout(timer);
      // Clear handler so ProtocolEngine can install its own
      transport.onMessage(() => {});

      if (message['error']) {
        const error = message['error'];
        const errorMessage =
          error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : 'unknown error';
        reject(
          new ConnectionError(`Daemon authentication failed: ${errorMessage}`)
        );
        return;
      }

      resolve();
    });

    transport.send(envelope);
  });
}

export class DaemonConnection {
  private readonly _transport: WebSocketTransport;
  private readonly _multiplexer: SharedTransportMultiplexer;
  private readonly _authToken: string;
  private _closed = false;

  /** @internal */
  constructor(transport: WebSocketTransport, authToken: string) {
    this._transport = transport;
    this._multiplexer = new SharedTransportMultiplexer(transport);
    this._authToken = authToken;
  }

  async createSession(
    options: DaemonSessionOptions = {}
  ): Promise<DaemonSession> {
    this._ensureNotClosed();

    const view = this._multiplexer.createView();
    const client = new DroidClient({ transport: view, methodPrefix: 'daemon' });
    setupClientHandlers(client, {
      permissionHandler: options.permissionHandler,
      askUserHandler: options.askUserHandler,
    });

    let sdkMcpServers:
      | Awaited<ReturnType<typeof startSdkMcpServers>>
      | undefined;

    try {
      sdkMcpServers = await startSdkMcpServers(options.mcpServers);
      const initParams = buildInitParams({
        ...options,
        mcpServers: sdkMcpServers.mcpServers,
      });

      // Daemon requires `token` in init params for session auth.
      // Spread token into initParams — the wire protocol accepts it even
      // though the exec-mode TypeScript type doesn't define it.
      Object.assign(initParams, { token: this._authToken });

      const initResult = await client.initializeSession(initParams);
      const session = new DaemonSession(client, initResult.sessionId);
      return session;
    } catch (error) {
      await sdkMcpServers?.cleanup();
      await client.close();
      throw error;
    }
  }

  async resumeSession(
    sessionId: string,
    options: DaemonResumeOptions = {}
  ): Promise<DaemonSession> {
    this._ensureNotClosed();

    const view = this._multiplexer.createView();
    const client = new DroidClient({ transport: view, methodPrefix: 'daemon' });
    setupClientHandlers(client, {
      permissionHandler: options.permissionHandler,
      askUserHandler: options.askUserHandler,
    });

    let sdkMcpServers:
      | Awaited<ReturnType<typeof startSdkMcpServers>>
      | undefined;

    try {
      sdkMcpServers = await startSdkMcpServers(options.mcpServers);
      // Daemon requires `token` in load params for session auth
      const loadParams: LoadSessionRequestParams = {
        sessionId,
        mcpServers: sdkMcpServers.mcpServers,
      };
      Object.assign(loadParams, { token: this._authToken });
      await client.loadSession(loadParams);
      const session = new DaemonSession(client, sessionId);
      return session;
    } catch (error) {
      await sdkMcpServers?.cleanup();
      await client.close();
      throw error;
    }
  }

  async interruptSession(sessionId: string): Promise<void> {
    this._ensureNotClosed();

    const view = this._multiplexer.createView();
    const client = new DroidClient({ transport: view, methodPrefix: 'daemon' });
    try {
      const loadParams: LoadSessionRequestParams = { sessionId };
      Object.assign(loadParams, { token: this._authToken });
      await client.loadSession(loadParams);
      await client.interruptSession();
    } finally {
      await client.close();
    }
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;
    await this._transport.close();
  }

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Daemon connection has been closed. Call connectDaemon() to create a new connection.'
      );
    }
  }
}

export async function connectDaemon(
  options: ConnectDaemonOptions = {}
): Promise<DaemonConnection> {
  const isLocal =
    !options.url &&
    (!options.machine || options.machine.type === MachineType.Local);

  // For local connections, spawn/discover the daemon and resolve auth token
  let resolvedOptions: ResolvedConnectOptions = options;
  if (isLocal) {
    const { port } = await ensureLocalDaemon();
    resolvedOptions = { ...options, _localPort: port };

    // Auto-resolve auth: FACTORY_API_KEY env var > stored credentials
    if (!options.apiKey && !options.token) {
      const envApiKey = process.env.FACTORY_API_KEY?.trim();
      if (envApiKey) {
        resolvedOptions = { ...resolvedOptions, apiKey: envApiKey };
      } else {
        const token = await resolveLocalAuthToken();
        if (!token) {
          throw new ConnectionError(
            'No stored credentials found. Run `droid auth login` first, ' +
              'or set the FACTORY_API_KEY environment variable.'
          );
        }
        resolvedOptions = { ...resolvedOptions, token };
      }
    }
  }

  const url = resolveWebSocketUrl(resolvedOptions);
  const wsConfig = getWebSocketConfig(resolvedOptions.machine);

  const transport = new WebSocketTransport(wsConfig);

  // Resolve the auth token string used for session-level auth params
  const authToken =
    resolvedOptions.apiKey ?? resolvedOptions.token ?? '';

  try {
    // Connect with optional retry budget
    if (
      resolvedOptions.maxRetries !== undefined &&
      resolvedOptions.maxRetries > 0
    ) {
      let lastError: Error | undefined;

      for (let attempt = 0; attempt <= resolvedOptions.maxRetries; attempt++) {
        try {
          await transport.connect(url);
          await authenticate(transport, resolvedOptions);
          return new DaemonConnection(transport, authToken);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          try {
            await transport.close();
          } catch {
            // Best-effort cleanup between retries
          }
          if (attempt < resolvedOptions.maxRetries) {
            await new Promise<void>((resolve) => setTimeout(resolve, 2_000));
          }
        }
      }

      throw lastError;
    }

    // Single attempt
    await transport.connect(url);
    await authenticate(transport, resolvedOptions);
    return new DaemonConnection(transport, authToken);
  } catch (error) {
    try {
      await transport.close();
    } catch {
      // Best-effort cleanup
    }
    throw error;
  }
}
