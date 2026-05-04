import { v4 as uuidv4 } from 'uuid';

import {
  ConnectionError,
  ProtocolError,
  SessionNotFoundError,
  TimeoutError,
} from './errors.js';
import {
  DEFAULT_REQUEST_TIMEOUT,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
} from './schemas/constants.js';
import {
  DroidClientMethod,
  JsonRpcErrorCode,
  ToolConfirmationOutcome,
} from './schemas/enums.js';
import {
  AskUserRequestParamsSchema,
  AskUserResultSchema,
  RequestPermissionRequestParamsSchema,
  RequestPermissionResultSchema,
  SessionNotificationParamsSchema,
} from './schemas/server.js';
import type {
  AskUserRequestParams,
  AskUserResult,
  RequestPermissionHandlerResult,
  RequestPermissionRequestParams,
  RequestPermissionResult,
} from './schemas/server.js';
import { JsonRpcMessageSchema, type JsonRpcError } from './schemas/shared.js';
import type { DroidClientTransport } from './types.js';

export type PermissionHandler = (
  params: RequestPermissionRequestParams
) => RequestPermissionHandlerResult | Promise<RequestPermissionHandlerResult>;

export type AskUserHandler = (
  params: AskUserRequestParams
) => AskUserResult | Promise<AskUserResult>;

export type NotificationCallback = (
  notification: Record<string, unknown>
) => void;

export interface NotificationFilter {
  type?: string;
}

interface PendingRequest {
  readonly method: string;
  readonly requestId: string;
  readonly params: Record<string, unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

interface NotificationListener {
  readonly callback: NotificationCallback;
  readonly filter?: NotificationFilter;
}

export class ProtocolEngine {
  private readonly _transport: DroidClientTransport;
  private readonly _defaultTimeout: number;

  private readonly _pendingRequests = new Map<string, PendingRequest>();
  private readonly _notificationListeners = new Set<NotificationListener>();
  private _permissionHandler: PermissionHandler | null = null;
  private _askUserHandler: AskUserHandler | null = null;
  private _transportError: Error | null = null;
  private _closed = false;

  constructor(options: {
    transport: DroidClientTransport;
    defaultTimeout?: number;
  }) {
    this._transport = options.transport;
    this._defaultTimeout = options.defaultTimeout ?? DEFAULT_REQUEST_TIMEOUT;

    this._transport.onMessage((message: Record<string, unknown>) => {
      this._handleMessage(message);
    });
    this._transport.onError((error: Error) => {
      this._handleTransportError(error);
    });
  }

  async sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeout?: number
  ): Promise<unknown> {
    if (this._closed) {
      throw new ConnectionError('Protocol engine is closed');
    }

    if (this._transportError !== null) {
      throw new ConnectionError(
        `Transport error: ${this._transportError.message}`
      );
    }

    const effectiveTimeout = timeout ?? this._defaultTimeout;
    const requestId = uuidv4();

    const envelope = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
      type: 'request' as const,
      id: requestId,
      method,
      params,
    };

    // Create a promise that will be resolved when we get a matching response
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(requestId);
        reject(
          new TimeoutError(
            `Request ${method} timed out after ${effectiveTimeout}ms`
          )
        );
      }, effectiveTimeout);

      const pending: PendingRequest = {
        method,
        requestId,
        params,
        resolve,
        reject,
        timer,
      };
      this._pendingRequests.set(requestId, pending);

      try {
        this._transport.send(envelope);
      } catch (sendError) {
        clearTimeout(timer);
        this._pendingRequests.delete(requestId);
        if (sendError instanceof Error) {
          reject(
            new ConnectionError(`Failed to send request: ${sendError.message}`)
          );
        } else {
          reject(new ConnectionError('Failed to send request'));
        }
      }
    });
  }

  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    const listener: NotificationListener = { callback, filter };
    this._notificationListeners.add(listener);

    let unsubscribed = false;
    return () => {
      if (!unsubscribed) {
        unsubscribed = true;
        this._notificationListeners.delete(listener);
      }
    };
  }

  setPermissionHandler(handler: PermissionHandler): void {
    this._permissionHandler = handler;
  }

  clearPermissionHandler(): void {
    this._permissionHandler = null;
  }

  /**
   * Register a handler for server→client ask-user requests.
   *
   * The handler receives the request params and should return
   * a result object with `cancelled` and `answers` keys.
   *
   * Replaces any previously registered handler.
   */
  setAskUserHandler(handler: AskUserHandler): void {
    this._askUserHandler = handler;
  }

  clearAskUserHandler(): void {
    this._askUserHandler = null;
  }

  get isHealthy(): boolean {
    return !this._closed && this._transportError === null;
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    const error = new ConnectionError(
      'Protocol engine closed: pending requests cancelled'
    );
    this._rejectAllPending(error);

    this._permissionHandler = null;
    this._askUserHandler = null;
    this._notificationListeners.clear();

    await this._transport.close();
  }

  private _handleMessage(raw: Record<string, unknown>): void {
    const parsed = JsonRpcMessageSchema.safeParse(raw);

    if (!parsed.success) {
      // Malformed message — silently ignore
      return;
    }

    const msg = parsed.data;
    switch (msg.type) {
      case 'response':
        this._handleResponse(msg.id, msg.result, msg.error);
        break;
      case 'notification':
        this._handleNotification(msg);
        break;
      case 'request':
        void this._handleServerRequest(msg.method, msg.id, msg.params);
        break;
    }
  }

  private _handleResponse(
    responseId: string | null,
    result: unknown,
    error: JsonRpcError | undefined
  ): void {
    if (responseId == null) {
      return;
    }

    const pending = this._pendingRequests.get(responseId);

    if (pending == null) {
      return;
    }

    this._pendingRequests.delete(responseId);
    clearTimeout(pending.timer);

    if (error != null) {
      if (error.code === JsonRpcErrorCode.ENTITY_NOT_FOUND) {
        const sessionId = String(
          pending.params['sessionId'] ?? pending.requestId
        );
        pending.reject(new SessionNotFoundError(sessionId));
        return;
      }

      pending.reject(
        new ProtocolError(error.message, { code: error.code, data: error.data })
      );
      return;
    }

    pending.resolve(result);
  }

  private _handleNotification(notification: Record<string, unknown>): void {
    let notificationType: string | undefined;
    const parsed = SessionNotificationParamsSchema.safeParse(
      notification['params']
    );
    if (parsed.success) {
      notificationType = parsed.data.notification.type;
    }

    for (const listener of this._notificationListeners) {
      if (
        listener.filter?.type != null &&
        listener.filter.type !== notificationType
      ) {
        continue;
      }

      try {
        listener.callback(notification);
      } catch {
        // Notification listener raised — don't crash the engine
      }
    }
  }

  private async _handleServerRequest(
    method: string,
    requestId: string,
    params: unknown
  ): Promise<void> {
    if (method === DroidClientMethod.REQUEST_PERMISSION) {
      await this._handlePermissionRequest(requestId, params);
    } else if (method === DroidClientMethod.ASK_USER) {
      await this._handleAskUserRequest(requestId, params);
    }
  }

  private async _handlePermissionRequest(
    requestId: string,
    params: unknown
  ): Promise<void> {
    const handler = this._permissionHandler;

    if (handler == null) {
      // Default: Cancel
      this._sendResponse(
        requestId,
        RequestPermissionResultSchema.parse({
          selectedOption: ToolConfirmationOutcome.Cancel,
        })
      );
      return;
    }

    try {
      const parsedParams = RequestPermissionRequestParamsSchema.parse(params);
      const selection = await Promise.resolve(handler(parsedParams));
      const result =
        typeof selection === 'string'
          ? { selectedOption: selection }
          : selection;
      this._sendResponse(
        requestId,
        RequestPermissionResultSchema.parse(result)
      );
    } catch (exc) {
      const errorMessage = exc instanceof Error ? exc.message : String(exc);
      this._sendErrorResponse(
        requestId,
        JsonRpcErrorCode.INTERNAL_ERROR,
        'Failed to handle permission request',
        errorMessage
      );
    }
  }

  private async _handleAskUserRequest(
    requestId: string,
    params: unknown
  ): Promise<void> {
    const handler = this._askUserHandler;

    if (handler == null) {
      // Default: cancelled=true
      this._sendResponse(
        requestId,
        AskUserResultSchema.parse({ cancelled: true, answers: [] })
      );
      return;
    }

    try {
      const parsedParams = AskUserRequestParamsSchema.parse(params);
      const result = await Promise.resolve(handler(parsedParams));
      this._sendResponse(requestId, AskUserResultSchema.parse(result));
    } catch (exc) {
      const errorMessage = exc instanceof Error ? exc.message : String(exc);
      this._sendErrorResponse(
        requestId,
        JsonRpcErrorCode.INTERNAL_ERROR,
        'Failed to handle ask-user request',
        errorMessage
      );
    }
  }

  /**
   * Handle a transport error.
   * Sets the sticky transport error and rejects all pending requests.
   * The original error is preserved as `cause` on the ConnectionError.
   */
  private _handleTransportError(error: Error): void {
    this._transportError = error;
    const connectionError = new ConnectionError(
      `Transport error: ${error.message}`
    );
    connectionError.cause = error;
    this._rejectAllPending(connectionError);
  }

  private _sendResponse(
    requestId: string,
    result: RequestPermissionResult | AskUserResult
  ): void {
    const response: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
      type: 'response',
      id: requestId,
      result,
    };
    this._sendBestEffort(response);
  }

  private _sendErrorResponse(
    requestId: string,
    code: number,
    message: string,
    data?: unknown
  ): void {
    const errorObj: Record<string, unknown> = { code, message };
    if (data !== undefined) {
      errorObj['data'] = data;
    }

    const response: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
      type: 'response',
      id: requestId,
      error: errorObj,
    };
    this._sendBestEffort(response);
  }

  private _sendBestEffort(message: Record<string, unknown>): void {
    try {
      this._transport.send(message);
    } catch {
      // The transport is already failing; dropping the reply is safer than
      // throwing from a server→client callback path.
    }
  }

  private _rejectAllPending(error: Error): void {
    const pending = new Map(this._pendingRequests);
    this._pendingRequests.clear();

    for (const req of pending.values()) {
      clearTimeout(req.timer);
      req.reject(error);
    }
  }
}
