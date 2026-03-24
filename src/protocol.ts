/**
 * JSON-RPC 2.0 protocol engine for the Factory Droid SDK.
 *
 * Sits between the transport layer and the client API. Handles:
 *
 * - Envelope construction for outbound requests
 * - Request/response correlation via pending promises keyed by UUID
 * - Configurable per-request timeouts
 * - Notification dispatch to registered listeners with optional type filtering
 * - Server→client request handling (permission, ask_user)
 * - Error code mapping (ENTITY_NOT_FOUND → SessionNotFoundError)
 * - Sticky transport error: once a transport error fires, all
 *   pending and subsequent requests are immediately rejected
 * - Edge cases: unknown response IDs, duplicate response IDs,
 *   malformed responses, null-id error responses
 */

import { v4 as uuidv4 } from "uuid";

import {
  ConnectionError,
  ProtocolError,
  SessionNotFoundError,
  TimeoutError,
} from "./errors.js";
import {
  DEFAULT_REQUEST_TIMEOUT,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
} from "./schemas/constants.js";
import {
  DroidClientMethod,
  JsonRpcErrorCode,
} from "./schemas/enums.js";
import type { DroidClientTransport } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Handler for server→client permission requests.
 * Receives request params and returns the selected ToolConfirmationOutcome string.
 */
export type PermissionHandler = (
  params: Record<string, unknown>,
) => string | Promise<string>;

/**
 * Handler for server→client ask-user requests.
 * Receives request params and returns a result with cancelled flag and answers.
 */
export type AskUserHandler = (
  params: Record<string, unknown>,
) => Record<string, unknown> | Promise<Record<string, unknown>>;

/**
 * Callback for incoming notification messages.
 */
export type NotificationCallback = (notification: Record<string, unknown>) => void;

/**
 * Optional filter for notification listeners.
 */
export interface NotificationFilter {
  /** Only dispatch notifications whose `params.notification.type` matches. */
  type?: string;
}

/**
 * Internal state for a pending request awaiting a response.
 */
interface PendingRequest {
  readonly method: string;
  readonly requestId: string;
  readonly params: Record<string, unknown>;
  readonly resolve: (value: Record<string, unknown>) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Internal entry in the notification listener registry.
 */
interface NotificationListener {
  readonly callback: NotificationCallback;
  readonly filter?: NotificationFilter;
}

// ---------------------------------------------------------------------------
// ProtocolEngine
// ---------------------------------------------------------------------------

/**
 * JSON-RPC 2.0 protocol engine.
 *
 * Manages request/response correlation, timeout handling, notification
 * dispatch, server→client request handling, and error mapping.
 *
 * After construction the engine immediately registers itself on the
 * transport's `onMessage` and `onError` callbacks.
 *
 * @example
 * ```ts
 * const engine = new ProtocolEngine({ transport });
 * const result = await engine.sendRequest("droid.list_skills", {});
 * engine.close();
 * ```
 */
export class ProtocolEngine {
  private readonly _transport: DroidClientTransport;
  private readonly _defaultTimeout: number;

  /** Pending requests keyed by UUID string. */
  private readonly _pendingRequests = new Map<string, PendingRequest>();

  /** Notification listener registry. */
  private readonly _notificationListeners = new Set<NotificationListener>();

  /** Server→client request handlers. */
  private _permissionHandler: PermissionHandler | null = null;
  private _askUserHandler: AskUserHandler | null = null;

  /** Sticky transport error — once set, all requests fail immediately. */
  private _transportError: Error | null = null;

  /** Closed flag — once true, new requests are rejected. */
  private _closed = false;

  /**
   * Create a new ProtocolEngine.
   *
   * @param options.transport - A connected DroidClientTransport implementation.
   * @param options.defaultTimeout - Default timeout in ms for sendRequest (default 30 000).
   */
  constructor(options: {
    transport: DroidClientTransport;
    defaultTimeout?: number;
  }) {
    this._transport = options.transport;
    this._defaultTimeout = options.defaultTimeout ?? DEFAULT_REQUEST_TIMEOUT;

    // Wire up transport callbacks
    this._transport.onMessage((message: object) => {
      this._handleMessage(message as Record<string, unknown>);
    });
    this._transport.onError((error: Error) => {
      this._handleTransportError(error);
    });
  }

  // ------------------------------------------------------------------
  // Public API: Sending requests
  // ------------------------------------------------------------------

  /**
   * Send a JSON-RPC request and wait for the response.
   *
   * Constructs the full envelope, registers a pending promise, sends
   * via transport, and returns the parsed response `result` field.
   *
   * @param method - The RPC method name (e.g. `"droid.list_skills"`).
   * @param params - Method parameters object.
   * @param timeout - Timeout in ms. Defaults to `defaultTimeout`.
   * @returns The `result` field from the JSON-RPC success response.
   * @throws {ConnectionError} If the engine is closed.
   * @throws {ConnectionError} If the transport has a sticky error.
   * @throws {TimeoutError} If no response arrives within the timeout.
   * @throws {ProtocolError} If the response contains a protocol error.
   * @throws {SessionNotFoundError} If error code is ENTITY_NOT_FOUND.
   */
  async sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeout?: number,
  ): Promise<Record<string, unknown>> {
    // Check closed state
    if (this._closed) {
      throw new ConnectionError("Protocol engine is closed");
    }

    // Check sticky transport error
    if (this._transportError !== null) {
      throw new ConnectionError(
        `Transport error: ${this._transportError.message}`,
      );
    }

    const effectiveTimeout = timeout ?? this._defaultTimeout;
    const requestId = uuidv4();

    // Build envelope
    const envelope: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
      type: "request",
      id: requestId,
      method,
      params,
    };

    // Create a promise that will be resolved when we get a matching response
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      // Set up timeout
      const timer = setTimeout(() => {
        this._pendingRequests.delete(requestId);
        reject(
          new TimeoutError(
            `Request ${method} timed out after ${effectiveTimeout}ms`,
          ),
        );
      }, effectiveTimeout);

      // Store as pending
      const pending: PendingRequest = {
        method,
        requestId,
        params,
        resolve,
        reject,
        timer,
      };
      this._pendingRequests.set(requestId, pending);

      // Send via transport
      try {
        this._transport.send(envelope);
      } catch (sendError) {
        // Clean up pending and reject
        clearTimeout(timer);
        this._pendingRequests.delete(requestId);
        if (sendError instanceof Error) {
          reject(
            new ConnectionError(`Failed to send request: ${sendError.message}`),
          );
        } else {
          reject(new ConnectionError("Failed to send request"));
        }
      }
    });
  }

  // ------------------------------------------------------------------
  // Public API: Notification listeners
  // ------------------------------------------------------------------

  /**
   * Register a callback for incoming notification messages.
   *
   * Multiple listeners can be registered. Each receives the full
   * parsed notification object.
   *
   * @param callback - Invoked with the notification object.
   * @param filter - Optional filter to only receive specific notification types.
   * @returns An unsubscribe function. Calling it again is safe (no-op).
   */
  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter,
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

  // ------------------------------------------------------------------
  // Public API: Server→client request handlers
  // ------------------------------------------------------------------

  /**
   * Register a handler for server→client permission requests.
   *
   * The handler receives the request params and should return a
   * ToolConfirmationOutcome string value.
   *
   * Replaces any previously registered handler.
   */
  setPermissionHandler(handler: PermissionHandler): void {
    this._permissionHandler = handler;
  }

  /**
   * Remove the permission request handler (restores default Cancel).
   */
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

  /**
   * Remove the ask-user request handler (restores default cancelled=true).
   */
  clearAskUserHandler(): void {
    this._askUserHandler = null;
  }

  // ------------------------------------------------------------------
  // Public API: Health check
  // ------------------------------------------------------------------

  /**
   * Whether the engine is in a healthy state — not closed and no
   * sticky transport error.
   */
  get isHealthy(): boolean {
    return !this._closed && this._transportError === null;
  }

  // ------------------------------------------------------------------
  // Public API: Close
  // ------------------------------------------------------------------

  /**
   * Close the protocol engine.
   *
   * Rejects all pending requests, closes the transport, and prevents
   * new requests. Idempotent — safe to call multiple times.
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    // Reject all pending
    const error = new ConnectionError(
      "Protocol engine closed: pending requests cancelled",
    );
    this._rejectAllPending(error);

    // Clear handlers and listeners
    this._permissionHandler = null;
    this._askUserHandler = null;
    this._notificationListeners.clear();

    // Close the transport
    await this._transport.close();
  }

  // ------------------------------------------------------------------
  // Internal: Message handling
  // ------------------------------------------------------------------

  /**
   * Handle an incoming parsed message from the transport.
   * Dispatches to response handler, notification handler, or
   * server→client request handler based on message type.
   */
  private _handleMessage(parsed: Record<string, unknown>): void {
    const msgType = parsed["type"];

    if (msgType === "response") {
      this._handleResponse(parsed);
    } else if (msgType === "notification") {
      this._handleNotification(parsed);
    } else if (msgType === "request") {
      // Server→client request — handle asynchronously
      void this._handleServerRequest(parsed);
    } else {
      // Fallback detection by content
      if ("result" in parsed || "error" in parsed) {
        this._handleResponse(parsed);
      } else if ("method" in parsed && !("id" in parsed)) {
        this._handleNotification(parsed);
      } else if ("method" in parsed && "id" in parsed) {
        void this._handleServerRequest(parsed);
      }
      // else: unknown format — silently ignore
    }
  }

  /**
   * Handle an incoming response message.
   * Matches by ID to resolve the correct pending Promise.
   */
  private _handleResponse(response: Record<string, unknown>): void {
    const responseId = response["id"] as string | null | undefined;

    // Null-id error response — log but don't crash
    if (responseId == null) {
      return;
    }

    const pending = this._pendingRequests.get(responseId);

    if (pending == null) {
      // Unknown response ID — already timed out or duplicate
      return;
    }

    // Remove from pending and clear its timeout
    this._pendingRequests.delete(responseId);
    clearTimeout(pending.timer);

    // Check for error response and map to exceptions
    const errorObj = response["error"];
    if (errorObj != null && typeof errorObj === "object") {
      const error = errorObj as Record<string, unknown>;
      const code = error["code"] as number | undefined;
      const message = (error["message"] as string) ?? "Unknown error";
      const data = error["data"];

      if (code === JsonRpcErrorCode.ENTITY_NOT_FOUND) {
        // Extract sessionId from the original request params
        const sessionId = String(
          pending.params["sessionId"] ?? pending.requestId,
        );
        pending.reject(new SessionNotFoundError(sessionId));
        return;
      }

      pending.reject(new ProtocolError(message, { code, data }));
      return;
    }

    // Resolve with the full response
    pending.resolve(response as Record<string, unknown>);
  }

  /**
   * Handle an incoming notification message.
   * Dispatches to all registered notification listeners that match.
   */
  private _handleNotification(notification: Record<string, unknown>): void {
    // Extract the notification type for filtering
    const params = notification["params"] as Record<string, unknown> | undefined;
    const innerNotification = params?.["notification"] as
      | Record<string, unknown>
      | undefined;
    const notificationType = innerNotification?.["type"] as string | undefined;

    for (const listener of this._notificationListeners) {
      // Apply type filter if present
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

  /**
   * Handle an incoming server→client request.
   * Dispatches to the appropriate handler based on the method field.
   */
  private async _handleServerRequest(
    request: Record<string, unknown>,
  ): Promise<void> {
    const method = request["method"] as string;
    const requestId = request["id"] as string;
    const params = (request["params"] as Record<string, unknown>) ?? {};

    if (method === DroidClientMethod.REQUEST_PERMISSION) {
      await this._handlePermissionRequest(requestId, params);
    } else if (method === DroidClientMethod.ASK_USER) {
      await this._handleAskUserRequest(requestId, params);
    }
    // Unknown server→client methods are silently ignored
  }

  /**
   * Handle droid.request_permission server→client request.
   */
  private async _handlePermissionRequest(
    requestId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const handler = this._permissionHandler;

    if (handler == null) {
      // Default: Cancel
      this._sendResponse(requestId, { selectedOption: "cancel" });
      return;
    }

    try {
      const selectedOption = await Promise.resolve(handler(params));
      this._sendResponse(requestId, { selectedOption });
    } catch (exc) {
      const errorMessage =
        exc instanceof Error ? exc.message : String(exc);
      this._sendErrorResponse(
        requestId,
        JsonRpcErrorCode.INTERNAL_ERROR,
        "Failed to handle permission request",
        errorMessage,
      );
    }
  }

  /**
   * Handle droid.ask_user server→client request.
   */
  private async _handleAskUserRequest(
    requestId: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const handler = this._askUserHandler;

    if (handler == null) {
      // Default: cancelled=true
      this._sendResponse(requestId, { cancelled: true, answers: [] });
      return;
    }

    try {
      const result = await Promise.resolve(handler(params));
      this._sendResponse(requestId, result);
    } catch (exc) {
      const errorMessage =
        exc instanceof Error ? exc.message : String(exc);
      this._sendErrorResponse(
        requestId,
        JsonRpcErrorCode.INTERNAL_ERROR,
        "Failed to handle ask-user request",
        errorMessage,
      );
    }
  }

  // ------------------------------------------------------------------
  // Internal: Transport error handling
  // ------------------------------------------------------------------

  /**
   * Handle a transport error.
   * Sets the sticky transport error and rejects all pending requests.
   * The original error is preserved as `cause` on the ConnectionError.
   */
  private _handleTransportError(error: Error): void {
    this._transportError = error;
    const connectionError = new ConnectionError(
      `Transport error: ${error.message}`,
    );
    connectionError.cause = error;
    this._rejectAllPending(connectionError);
  }

  // ------------------------------------------------------------------
  // Internal: Response helpers
  // ------------------------------------------------------------------

  /**
   * Send a JSON-RPC success response back to the server.
   */
  private _sendResponse(
    requestId: string,
    result: Record<string, unknown>,
  ): void {
    const response: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
      type: "response",
      id: requestId,
      result,
    };
    try {
      this._transport.send(response);
    } catch {
      // Failed to send response — log but don't crash
    }
  }

  /**
   * Send a JSON-RPC error response back to the server.
   */
  private _sendErrorResponse(
    requestId: string,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    const errorObj: Record<string, unknown> = { code, message };
    if (data !== undefined) {
      errorObj["data"] = data;
    }

    const response: Record<string, unknown> = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
      type: "response",
      id: requestId,
      error: errorObj,
    };
    try {
      this._transport.send(response);
    } catch {
      // Failed to send error response — don't crash
    }
  }

  /**
   * Reject all pending requests with the given error.
   */
  private _rejectAllPending(error: Error): void {
    const pending = new Map(this._pendingRequests);
    this._pendingRequests.clear();

    for (const req of pending.values()) {
      clearTimeout(req.timer);
      req.reject(error);
    }
  }
}
