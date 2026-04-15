export class ConnectionError extends Error {
  readonly cwd: string;

  readonly execPath: string;

  constructor(message: string, options?: { cwd?: string; execPath?: string }) {
    super(message);
    this.name = 'ConnectionError';
    this.cwd = options?.cwd ?? '';
    this.execPath = options?.execPath ?? '';
    Object.setPrototypeOf(this, ConnectionError.prototype);
  }
}

export class ProtocolError extends Error {
  readonly code: number | undefined;

  readonly data: unknown;

  constructor(message: string, options?: { code?: number; data?: unknown }) {
    super(message);
    this.name = 'ProtocolError';
    this.code = options?.code;
    this.data = options?.data;
    Object.setPrototypeOf(this, ProtocolError.prototype);
  }
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

export class SessionNotFoundError extends SessionError {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
    this.sessionId = sessionId;
    Object.setPrototypeOf(this, SessionNotFoundError.prototype);
  }
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

export class ProcessExitError extends Error {
  readonly exitCode: number | null;

  readonly signal: string | null;

  constructor(
    message: string,
    options?: { exitCode?: number | null; signal?: string | null }
  ) {
    super(message);
    this.name = 'ProcessExitError';
    this.exitCode = options?.exitCode ?? null;
    this.signal = options?.signal ?? null;
    Object.setPrototypeOf(this, ProcessExitError.prototype);
  }
}
