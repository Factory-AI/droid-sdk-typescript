/**
 * Core transport interfaces for the Factory Droid SDK.
 *
 * DroidClientTransport defines the contract for communication with a droid
 * process. ProcessTransport is the primary implementation; InMemoryTransport
 * (in tests/helpers.ts) is the test mock.
 */

/**
 * Callback for receiving parsed JSON-RPC messages from the transport.
 */
export type MessageCallback = (message: object) => void;

/**
 * Callback for receiving transport-level errors (e.g. process exit).
 */
export type ErrorCallback = (error: Error) => void;

/**
 * Transport interface for communicating with a droid process.
 *
 * Implementations handle the low-level details of sending and receiving
 * newline-delimited JSON messages (JSONL) over some channel (stdio pipe,
 * in-memory buffer, etc.).
 */
export interface DroidClientTransport {
  /**
   * Send a JSON-RPC message to the droid process.
   *
   * The transport serializes the object as a single JSON line followed by
   * a newline character. Concurrent sends are serialized to prevent
   * interleaving.
   *
   * @param message - A JSON-serializable object (typically a JSON-RPC request or response).
   */
  send(message: object): void;

  /**
   * Register a callback to receive parsed JSON-RPC messages from the
   * droid process. Only one handler is active at a time; subsequent calls
   * replace the previous handler.
   *
   * @param callback - Invoked for each parsed JSON object received from the process.
   */
  onMessage(callback: MessageCallback): void;

  /**
   * Register a callback to receive transport-level errors (process exit,
   * spawn failure, etc.). Only one handler is active at a time; subsequent
   * calls replace the previous handler.
   *
   * @param callback - Invoked with the error when the transport encounters a fault.
   */
  onError(callback: ErrorCallback): void;

  /**
   * Close the transport and release resources.
   *
   * For ProcessTransport this sends SIGTERM to the subprocess, waits a
   * grace period, then escalates to SIGKILL. Idempotent — safe to call
   * multiple times.
   */
  close(): Promise<void>;

  /**
   * Whether the transport is currently connected and able to send/receive
   * messages.
   */
  readonly isConnected: boolean;

  /**
   * Establish (or re-establish) the connection.
   *
   * For ProcessTransport this spawns the child process. For
   * InMemoryTransport this is a no-op that flips `isConnected` to true.
   *
   * Calling `connect()` after `close()` enables reconnection.
   */
  connect?(): Promise<void>;
}

/**
 * Options for constructing a ProcessTransport.
 */
export interface ProcessTransportOptions {
  /** Path to the droid executable. Defaults to `"droid"`. */
  execPath?: string;

  /**
   * Arguments passed to the executable.
   * Defaults to `["exec", "--input-format", "stream-jsonrpc", "--output-format", "stream-jsonrpc"]`.
   */
  execArgs?: string[];

  /** Working directory for the subprocess. */
  cwd?: string;

  /** Additional environment variables merged with `process.env`. */
  env?: Record<string, string>;

  /**
   * Seconds to wait after SIGTERM before escalating to SIGKILL.
   * Defaults to `5`.
   */
  gracePeriod?: number;
}
