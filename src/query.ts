import { DroidClient } from './client.js';
import {
  MessageBridge,
  buildInitParams,
  closeQuietly,
  createConfiguredClient,
  wireAbortSignal,
} from './helpers.js';
import type { InitializeSessionResult } from './schemas/client.js';
import type { CreateSessionOptions } from './session.js';
import type { DroidMessage } from './stream.js';
import type { DroidClientTransport } from './types.js';

export interface QueryOptions extends CreateSessionOptions {
  prompt: string;
}

export interface DroidQuery extends AsyncGenerator<
  DroidMessage,
  void,
  undefined
> {
  interrupt(): Promise<void>;
  abort(): void;
  /** `null` before initialization completes. */
  readonly sessionId: string | null;
  /** `null` before initialization completes. */
  readonly initResult: InitializeSessionResult | null;
  readonly initialized: Promise<InitializeSessionResult>;
}

class DroidQueryImpl implements DroidQuery {
  private _generator: AsyncGenerator<DroidMessage, void, undefined>;
  private _getSessionId: () => string | null;
  private _getInitResult: () => InitializeSessionResult | null;
  private _getInitialized: () => Promise<InitializeSessionResult>;
  private _interruptFn: () => Promise<void>;
  private _abortFn: () => void;

  constructor(
    generator: AsyncGenerator<DroidMessage, void, undefined>,
    getSessionId: () => string | null,
    getInitResult: () => InitializeSessionResult | null,
    getInitialized: () => Promise<InitializeSessionResult>,
    interruptFn: () => Promise<void>,
    abortFn: () => void
  ) {
    this._generator = generator;
    this._getSessionId = getSessionId;
    this._getInitResult = getInitResult;
    this._getInitialized = getInitialized;
    this._interruptFn = interruptFn;
    this._abortFn = abortFn;
  }

  get sessionId(): string | null {
    return this._getSessionId();
  }

  get initResult(): InitializeSessionResult | null {
    return this._getInitResult();
  }

  get initialized(): Promise<InitializeSessionResult> {
    return this._getInitialized();
  }

  async interrupt(): Promise<void> {
    return this._interruptFn();
  }

  abort(): void {
    this._abortFn();
  }

  next(...args: [] | [undefined]): Promise<IteratorResult<DroidMessage, void>> {
    return this._generator.next(...args);
  }

  return(
    value: void | PromiseLike<void>
  ): Promise<IteratorResult<DroidMessage, void>> {
    return this._generator.return(value);
  }

  throw(e: unknown): Promise<IteratorResult<DroidMessage, void>> {
    return this._generator.throw(e);
  }

  [Symbol.asyncIterator](): DroidQueryImpl {
    return this;
  }
}

/**
 * Spawns a droid process, initializes a session, sends the prompt, and
 * yields {@link DroidMessage} events. Resources are cleaned up automatically.
 */
export function query(options: QueryOptions): DroidQuery {
  let transport: DroidClientTransport | null = null;
  let client: DroidClient | null = null;
  let sessionId: string | null = null;
  let initResult: InitializeSessionResult | null = null;
  let aborted = false;
  let initializationPromise: Promise<InitializeSessionResult> | null = null;
  let promptPromise: Promise<void> | null = null;

  const bridge = new MessageBridge();

  const ensureInitialized = (): Promise<InitializeSessionResult> => {
    if (initResult) {
      return Promise.resolve(initResult);
    }
    if (initializationPromise) {
      return initializationPromise;
    }

    initializationPromise = (async () => {
      try {
        if (aborted) {
          throw new Error('Query aborted before initialization');
        }

        const configuredClient = await createConfiguredClient(options);
        transport = configuredClient.transport;
        client = configuredClient.client;
        client.onNotification(bridge.notificationHandler);

        if (aborted) {
          throw new Error('Query aborted before initialization');
        }

        const result = await client.initializeSession(buildInitParams(options));
        sessionId = result.sessionId;
        initResult = result;
        return result;
      } catch (error) {
        const closer = client ?? transport;
        client = null;
        transport = null;
        await closeQuietly(closer);
        throw error;
      }
    })();

    return initializationPromise;
  };

  const ensurePromptSent = (): Promise<void> => {
    if (promptPromise) {
      return promptPromise;
    }

    promptPromise = (async () => {
      await ensureInitialized();
      if (aborted || client === null) {
        return;
      }

      await client.addUserMessage({ text: options.prompt });
    })();

    return promptPromise;
  };

  async function* generateMessages(): AsyncGenerator<
    DroidMessage,
    void,
    undefined
  > {
    if (aborted) return;

    await ensurePromptSent();
    if (aborted) return;

    for await (const msg of bridge.messages()) {
      if (aborted) return;
      yield msg;
    }
  }

  const generator = generateMessages();

  async function* wrappedGenerator(): AsyncGenerator<
    DroidMessage,
    void,
    undefined
  > {
    try {
      yield* generator;
    } finally {
      const closer = client ?? transport;
      client = null;
      transport = null;
      await closeQuietly(closer);
    }
  }

  const droidQuery = new DroidQueryImpl(
    wrappedGenerator(),
    () => sessionId,
    () => initResult,
    () => ensureInitialized(),
    async () => {
      if (client && !aborted) {
        await client.interruptSession();
      }
    },
    () => {
      aborted = true;
      bridge.signalDone();
      const closer = client ?? transport;
      client = null;
      transport = null;
      void closeQuietly(closer);
    }
  );

  wireAbortSignal(options.abortSignal, () => droidQuery.abort());

  return droidQuery;
}
