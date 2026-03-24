/**
 * Error class hierarchy for the Factory Droid SDK.
 *
 * All SDK errors extend Error directly (no MetaError dependency).
 * Each error class sets its `name` property to the class name for
 * reliable `instanceof` checks and readable stack traces.
 */

/**
 * Raised when a connection to the droid process fails.
 *
 * Carries optional context about the working directory and executable path
 * that were used when attempting to spawn the process.
 */
export class ConnectionError extends Error {
  /** The working directory used when spawning the process. */
  readonly cwd: string;

  /** The executable path used when spawning the process. */
  readonly execPath: string;

  constructor(message: string, options?: { cwd?: string; execPath?: string }) {
    super(message);
    this.name = "ConnectionError";
    this.cwd = options?.cwd ?? "";
    this.execPath = options?.execPath ?? "";
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

/**
 * Raised when a JSON-RPC protocol error occurs.
 *
 * Carries the optional JSON-RPC error code and any additional data
 * returned in the error response.
 */
export class ProtocolError extends Error {
  /** The JSON-RPC error code, if available. */
  readonly code: number | undefined;

  /** Additional error data from the JSON-RPC response. */
  readonly data: unknown;

  constructor(
    message: string,
    options?: { code?: number; data?: unknown },
  ) {
    super(message);
    this.name = "ProtocolError";
    this.code = options?.code;
    this.data = options?.data;
    Object.setPrototypeOf(this, ProtocolError.prototype);
  }
}

/**
 * Base error for session-related errors.
 */
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

/**
 * Raised when a session cannot be found.
 *
 * Constructs a default message of "Session not found: {sessionId}".
 */
export class SessionNotFoundError extends SessionError {
  /** The ID of the session that was not found. */
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
    this.sessionId = sessionId;
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

/**
 * Raised when a request to the droid process times out.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

/**
 * Raised when the droid subprocess exits unexpectedly.
 *
 * Carries the exit code (if the process exited normally) and the signal
 * name (if the process was killed by a signal).
 */
export class ProcessExitError extends Error {
  /** The exit code of the process, or null if terminated by signal. */
  readonly exitCode: number | null;

  /** The signal that terminated the process, or null if exited normally. */
  readonly signal: string | null;

  constructor(
    message: string,
    options?: { exitCode?: number | null; signal?: string | null },
  ) {
    super(message);
    this.name = "ProcessExitError";
    this.exitCode = options?.exitCode ?? null;
    this.signal = options?.signal ?? null;
    Object.setPrototypeOf(this, ProcessExitError.prototype);
  }
}
