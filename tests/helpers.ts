/**
 * Test helpers for the Factory Droid SDK.
 *
 * InMemoryTransport implements DroidClientTransport for use in unit tests
 * without spawning real processes. It captures sent messages and allows
 * injecting messages and errors for test control.
 */

import type {
  DroidClientTransport,
  ErrorCallback,
  MessageCallback,
} from '../src/types.js';

/**
 * In-memory transport mock for testing.
 *
 * Usage:
 * ```ts
 * const transport = new InMemoryTransport();
 * await transport.connect();
 *
 * transport.onMessage((msg) => { ... });
 * transport.onError((err) => { ... });
 *
 * transport.send({ jsonrpc: "2.0", ... }); // captured in sentMessages
 * transport.injectMessage({ ... });         // fires onMessage handler
 * transport.injectError(new Error("boom")); // fires onError handler
 * ```
 */
export class InMemoryTransport implements DroidClientTransport {
  /** All messages passed to `send()`, in order. */
  readonly sentMessages: Record<string, unknown>[] = [];

  private messageHandler: MessageCallback | null = null;
  private errorHandler: ErrorCallback | null = null;
  private _isConnected = false;

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    this._isConnected = true;
  }

  send(message: Record<string, unknown>): void {
    if (!this._isConnected) {
      throw new Error('InMemoryTransport is not connected');
    }
    this.sentMessages.push(message);
  }

  onMessage(callback: MessageCallback): void {
    this.messageHandler = callback;
  }

  onError(callback: ErrorCallback): void {
    this.errorHandler = callback;
  }

  async close(): Promise<void> {
    this._isConnected = false;
  }

  // -----------------------------------------------------------------------
  // Test control methods
  // -----------------------------------------------------------------------

  /**
   * Inject a message as if it were received from the droid process.
   * Fires the registered `onMessage` handler.
   */
  injectMessage(message: Record<string, unknown>): void {
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }

  /**
   * Inject an error as if the transport encountered a fault.
   * Fires the registered `onError` handler.
   */
  injectError(error: Error): void {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }
}
