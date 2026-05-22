import type { DroidClient } from '../client.js';
import { ConnectionError } from '../errors.js';
import { MessageBridge, wireAbortSignal } from '../helpers.js';
import type { NotificationCallback, NotificationFilter } from '../protocol.js';
import type { MessageOptions } from '../session.js';
import type { DroidStreamEvent, DroidStreamMessage } from '../stream.js';
import type { SendOptions } from './types.js';

export class DaemonSession {
  private _client: DroidClient;
  private _sessionId: string;
  private _closed = false;
  private readonly _activeBridges = new Set<MessageBridge>();

  /** @internal */
  constructor(client: DroidClient, sessionId: string) {
    this._client = client;
    this._sessionId = sessionId;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  stream(
    prompt: string,
    options?: MessageOptions & { includePartialMessages?: false }
  ): AsyncGenerator<DroidStreamMessage, void, undefined>;
  stream(
    prompt: string,
    options: MessageOptions & { includePartialMessages: true }
  ): AsyncGenerator<DroidStreamEvent, void, undefined>;
  async *stream(
    prompt: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidStreamEvent, void, undefined> {
    this._ensureNotClosed();
    this._throwIfAborted(options?.abortSignal);

    const startedAt = Date.now();
    let resolveDone: () => void = () => {};
    const donePromise = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const bridge = new MessageBridge(resolveDone, {
      includePartialMessages: options?.includePartialMessages,
      sessionId: this._sessionId,
      startedAt,
      outputFormat: options?.outputFormat,
    });
    this._activeBridges.add(bridge);
    const unsubscribe = this._client.onNotification(bridge.notificationHandler);
    let resolveAbort: () => void = () => {};
    const abortPromise = new Promise<void>((resolve) => {
      resolveAbort = resolve;
    });
    const cleanupAbortSignal = wireAbortSignal(options?.abortSignal, () => {
      bridge.signalDone();
      resolveAbort();
      void this._client.interruptSession().catch(() => {});
    });

    try {
      await Promise.race([
        this._client.addUserMessage({
          text: prompt,
          images: options?.images,
          files: options?.files,
          outputFormat: options?.outputFormat,
        }),
        donePromise,
        abortPromise,
      ]);
      this._throwIfAborted(options?.abortSignal);

      for await (const msg of bridge.messages()) {
        this._throwIfAborted(options?.abortSignal);
        yield msg;
      }
      this._throwIfAborted(options?.abortSignal);
    } finally {
      cleanupAbortSignal();
      unsubscribe();
      this._activeBridges.delete(bridge);
    }
  }

  async send(prompt: string, options?: SendOptions): Promise<void> {
    this._ensureNotClosed();

    await this._client.addUserMessage({
      text: prompt,
      images: options?.images,
      files: options?.files,
      outputFormat: options?.outputFormat,
    });
  }

  async interrupt(): Promise<void> {
    this._ensureNotClosed();
    await this._client.interruptSession();
  }

  async close(): Promise<void> {
    if (this._closed) {
      return;
    }
    this._closed = true;

    for (const bridge of this._activeBridges) {
      bridge.signalDone();
    }

    try {
      await this._client.closeSession({ reason: 'other' }).catch(() => {});
    } finally {
      await this._client.close();
    }
  }

  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void {
    return this._client.onNotification(callback, filter);
  }

  private _ensureNotClosed(): void {
    if (this._closed) {
      throw new ConnectionError(
        'Daemon session has been closed. Create a new session to continue.'
      );
    }
  }

  private _throwIfAborted(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error(
            typeof signal.reason === 'string'
              ? signal.reason
              : 'Operation aborted'
          );
    }
  }
}
