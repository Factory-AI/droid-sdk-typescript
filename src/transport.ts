import { type ChildProcess, spawn } from 'node:child_process';
import * as readline from 'node:readline';

import { ConnectionError, ProcessExitError } from './errors.js';
import type {
  DroidClientTransport,
  ErrorCallback,
  MessageCallback,
  ProcessTransportOptions,
} from './types.js';
import { isRecord } from './utils.js';

const DEFAULT_EXEC_ARGS = [
  'exec',
  '--input-format',
  'stream-jsonrpc',
  '--output-format',
  'stream-jsonrpc',
];

const DEFAULT_GRACE_PERIOD_MS = 5_000;

export class ProcessTransport implements DroidClientTransport {
  private readonly execPath: string;
  private readonly execArgs: string[];
  private readonly cwd: string | undefined;
  private readonly env: Record<string, string> | undefined;
  private readonly gracePeriodMs: number;

  private childProcess: ChildProcess | null = null;
  private readlineInterface: readline.Interface | null = null;
  private messageHandler: MessageCallback | null = null;
  private errorHandler: ErrorCallback | null = null;

  /** Once set, all subsequent `send()` calls throw immediately. */
  private processError: Error | null = null;

  /** Serializes stdin writes to prevent interleaving. */
  private writeChain: Promise<void> = Promise.resolve();

  private _isConnected = false;
  private isClosing = false;

  constructor(options: ProcessTransportOptions = {}) {
    this.execPath = options.execPath ?? 'droid';
    this.execArgs = options.execArgs
      ? [...options.execArgs]
      : [...DEFAULT_EXEC_ARGS];
    this.cwd = options.cwd;
    this.env = options.env;
    this.gracePeriodMs =
      (options.gracePeriod ?? DEFAULT_GRACE_PERIOD_MS / 1_000) * 1_000;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    if (this._isConnected) {
      throw new ConnectionError('Transport already connected', {
        execPath: this.execPath,
      });
    }

    this.processError = null;
    this.isClosing = false;
    this.writeChain = Promise.resolve();

    const mergedEnv = this.env ? { ...process.env, ...this.env } : undefined;

    try {
      this.childProcess = spawn(this.execPath, this.execArgs, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.cwd,
        env: mergedEnv,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? `Failed to start droid process: ${err.message}`
          : 'Failed to start droid process';
      throw new ConnectionError(message, {
        execPath: this.execPath,
        cwd: this.cwd,
      });
    }

    this._isConnected = true;
    this.setupHandlers();
  }

  send(message: Record<string, unknown>): void {
    if (this.processError) {
      throw this.processError;
    }
    if (!this._isConnected || !this.childProcess || !this.childProcess.stdin) {
      throw new ConnectionError('Transport not connected', {
        execPath: this.execPath,
      });
    }

    const line = JSON.stringify(message) + '\n';

    // Chain writes to prevent interleaving on concurrent calls.
    const previousChain = this.writeChain;

    this.writeChain = (async () => {
      // Wait for the previous write to finish (ignore its error — it's
      // already been reported to the caller of the previous send()).
      await previousChain.catch(() => {});

      if (
        !this.childProcess ||
        !this.childProcess.stdin ||
        this.childProcess.killed ||
        this.isClosing
      ) {
        throw new ConnectionError('Process disconnected before write', {
          execPath: this.execPath,
        });
      }

      if (this.processError) {
        throw this.processError;
      }

      await new Promise<void>((resolve, reject) => {
        if (!this.childProcess || !this.childProcess.stdin) {
          reject(
            new ConnectionError('Process stdin unavailable', {
              execPath: this.execPath,
            })
          );
          return;
        }

        const stdin = this.childProcess.stdin;
        if ('writable' in stdin && !stdin.writable) {
          reject(
            new ConnectionError('Process stdin is not writable', {
              execPath: this.execPath,
            })
          );
          return;
        }

        stdin.write(line, (error) => {
          if (error) {
            const msg = error.message || String(error);
            if (msg.includes('EPIPE') || msg.includes('ECONNRESET')) {
              reject(
                new ConnectionError('Process stdin closed during write', {
                  execPath: this.execPath,
                })
              );
            } else {
              reject(
                new ConnectionError(
                  `Failed to write to process stdin: ${msg}`,
                  { execPath: this.execPath }
                )
              );
            }
          } else {
            resolve();
          }
        });
      });
    })();
  }

  onMessage(callback: MessageCallback): void {
    this.messageHandler = callback;
  }

  onError(callback: ErrorCallback): void {
    this.errorHandler = callback;
  }

  async close(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    this._isConnected = false;

    const proc = this.childProcess;
    this.childProcess = null;

    if (this.readlineInterface) {
      this.readlineInterface.close();
      this.readlineInterface = null;
    }

    if (proc && proc.exitCode === null && !proc.killed) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Escalate to SIGKILL
          if (proc.exitCode === null && !proc.killed) {
            try {
              proc.kill('SIGKILL');
            } catch {
              // Process may already be gone
            }
          }
        }, this.gracePeriodMs);

        proc.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });

        // Close stdin first, then SIGTERM
        if (proc.stdin) {
          try {
            proc.stdin.end();
          } catch {
            // Ignore
          }
        }

        try {
          proc.kill('SIGTERM');
        } catch {
          // Process may already be gone — resolve immediately
          clearTimeout(timeout);
          resolve();
        }
      });
    }

    this.isClosing = false;
  }

  private setupHandlers(): void {
    const proc = this.childProcess;
    if (!proc || !proc.stdout) {
      return;
    }

    this.readlineInterface = readline.createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });

    this.readlineInterface.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      // Protocol messages are JSON objects, not JSON-RPC batch arrays.
      if (trimmed.startsWith('{')) {
        try {
          const parsed: unknown = JSON.parse(trimmed);
          if (this.messageHandler && isRecord(parsed)) {
            this.messageHandler(parsed);
          }
        } catch {
          // Malformed JSON — skip silently
        }
      }
    });

    proc.on('error', (error) => {
      this.processError = new ConnectionError(
        `Failed to start droid process: ${error.message}`,
        {
          execPath: this.execPath,
          cwd: this.cwd,
        }
      );
      this._isConnected = false;
      if (!this.isClosing && this.errorHandler) {
        this.errorHandler(this.processError);
      }
    });

    proc.on('exit', (code, signal) => {
      if (this.readlineInterface) {
        this.readlineInterface.close();
        this.readlineInterface = null;
      }

      this._isConnected = false;

      if (!this.isClosing) {
        const exitCode = code ?? null;
        const exitSignal = signal ?? null;

        let message: string;
        if (exitSignal) {
          message = `Droid process was killed (${exitSignal})`;
        } else if (exitCode !== null && exitCode !== 0) {
          message = `Droid process exited unexpectedly (exit code ${exitCode})`;
        } else if (exitCode === 0) {
          message = 'Droid process exited normally';
        } else {
          message = 'Droid process exited unexpectedly';
        }

        this.processError = new ProcessExitError(message, {
          exitCode,
          signal: exitSignal,
        });

        if (this.errorHandler) {
          this.errorHandler(this.processError);
        }
      }
    });
  }
}
