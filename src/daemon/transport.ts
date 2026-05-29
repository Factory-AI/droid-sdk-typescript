import WebSocket from 'ws';

import { ConnectionError } from '../errors.js';
import type {
  DroidClientTransport,
  ErrorCallback,
  MessageCallback,
} from '../types.js';
import { isRecord } from '../utils.js';
import { DEFAULT_WS_CONFIG } from './types.js';
import type { WebSocketTransportOptions } from './types.js';

export class WebSocketTransport implements DroidClientTransport {
  private readonly maxConnectRetries: number;
  private readonly initialRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly connectionTimeoutMs: number;

  private ws: WebSocket | null = null;
  private messageHandler: MessageCallback | null = null;
  private errorHandler: ErrorCallback | null = null;
  private _isConnected = false;
  private isClosing = false;

  constructor(options: WebSocketTransportOptions = {}) {
    this.maxConnectRetries =
      options.maxConnectRetries ?? DEFAULT_WS_CONFIG.maxConnectRetries;
    this.initialRetryDelayMs =
      options.initialRetryDelayMs ?? DEFAULT_WS_CONFIG.initialRetryDelayMs;
    this.maxRetryDelayMs =
      options.maxRetryDelayMs ?? DEFAULT_WS_CONFIG.maxRetryDelayMs;
    this.connectionTimeoutMs =
      options.connectionTimeoutMs ?? DEFAULT_WS_CONFIG.connectionTimeoutMs;
  }

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(url?: string): Promise<void> {
    if (!url) {
      throw new ConnectionError('WebSocket URL is required');
    }

    if (this._isConnected) {
      throw new ConnectionError('Transport already connected');
    }

    this.isClosing = false;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxConnectRetries; attempt++) {
      try {
        await this._doConnect(url);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxConnectRetries) {
          const delay = Math.min(
            this.initialRetryDelayMs * 2 ** attempt,
            this.maxRetryDelayMs
          );
          await new Promise<void>((resolve) => {
            setTimeout(resolve, delay);
          });
        }
      }
    }

    throw lastError;
  }

  send(message: Record<string, unknown>): void {
    if (!this._isConnected || !this.ws) {
      throw new ConnectionError('WebSocket transport not connected');
    }

    try {
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new ConnectionError(`Failed to send WebSocket message: ${msg}`);
    }
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

    const ws = this.ws;
    this.ws = null;

    if (ws && ws.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        ws.once('close', () => resolve());
        ws.close(1000, 'Client disconnect');

        // Safety timeout — don't hang forever waiting for close
        setTimeout(() => resolve(), 5_000);
      });
    }

    this.isClosing = false;
  }

  private async _doConnect(url: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const ws = new WebSocket(url);

      const handleOpen = () => {
        if (settled) return;
        settled = true;
        cleanup();

        this.ws = ws;
        this._isConnected = true;
        this._setupOngoingHandlers(ws);
        resolve();
      };

      const handleError = (error: Error) => {
        if (settled) return;
        settled = true;
        cleanup();

        try {
          ws.close();
        } catch {
          // Best-effort cleanup
        }

        reject(
          new ConnectionError(`WebSocket connection failed: ${error.message}`)
        );
      };

      const handleClose = (code: number, reason: Buffer) => {
        if (settled) return;
        settled = true;
        cleanup();

        reject(
          new ConnectionError(
            `WebSocket closed before opening (code: ${code}, reason: ${reason.toString()})`
          )
        );
      };

      ws.once('open', handleOpen);
      ws.once('error', handleError);
      ws.once('close', handleClose);

      timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;

        try {
          ws.close();
        } catch {
          // Best-effort cleanup
        }

        reject(
          new ConnectionError(
            `WebSocket connection timeout after ${this.connectionTimeoutMs}ms: ${url}`
          )
        );
      }, this.connectionTimeoutMs);
    });
  }

  private _setupOngoingHandlers(ws: WebSocket): void {
    ws.on('message', (data: WebSocket.Data) => {
      if (!this.messageHandler) return;

      const text = typeof data === 'string' ? data : data.toString();
      try {
        const parsed: unknown = JSON.parse(text);
        if (isRecord(parsed)) {
          this.messageHandler(parsed);
        }
      } catch {
        // Malformed JSON — skip silently
      }
    });

    ws.on('error', (error: Error) => {
      if (!this.isClosing && this.errorHandler) {
        this.errorHandler(
          new ConnectionError(`WebSocket error: ${error.message}`)
        );
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this._isConnected = false;
      this.ws = null;

      if (!this.isClosing && this.errorHandler) {
        this.errorHandler(
          new ConnectionError(
            `WebSocket closed (code: ${code}, reason: ${reason.toString()})`
          )
        );
      }
    });
  }
}
