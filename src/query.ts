import { closeQuietly, wireAbortSignal } from './helpers.js';
import type { InitializeSessionResult } from './schemas/client.js';
import {
  DroidSession,
  createSession,
  type CreateSessionOptions,
  type MessageOptions,
} from './session.js';
import type { DroidMessage } from './stream.js';

export interface QueryOptions
  extends CreateSessionOptions, Pick<MessageOptions, 'outputFormat'> {
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

function isInitializeSessionResult(
  result: DroidSession['initResult']
): result is InitializeSessionResult {
  return 'sessionId' in result;
}

function waitForAbort(signal: AbortSignal): {
  promise: Promise<never>;
  cleanup: () => void;
} {
  if (signal.aborted) {
    return {
      promise: Promise.reject(new Error('Query aborted before initialization')),
      cleanup: () => {},
    };
  }

  let cleanup = () => {};
  const promise = new Promise<never>((_, reject) => {
    const listener = () => {
      reject(new Error('Query aborted before initialization'));
    };
    signal.addEventListener('abort', listener, { once: true });
    cleanup = () => signal.removeEventListener('abort', listener);
  });

  return { promise, cleanup };
}

/**
 * Spawns a droid process, initializes a session, sends the prompt, and
 * yields {@link DroidMessage} events. Resources are cleaned up automatically.
 */
export function query(options: QueryOptions): DroidQuery {
  let session: DroidSession | null = null;
  let sessionId: string | null = null;
  let initResult: InitializeSessionResult | null = null;
  let aborted = false;
  let initializationPromise: Promise<InitializeSessionResult> | null = null;
  let cleanupAbortSignal: () => void = () => {};
  const operationAbortController = new AbortController();

  const closeActiveSession = async (): Promise<void> => {
    const closer = session;
    session = null;
    await closeQuietly(closer);
  };

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

        const sessionPromise = createSession({
          ...options,
          abortSignal: operationAbortController.signal,
        });
        void sessionPromise.then(
          (lateSession) => {
            if (aborted) {
              void closeQuietly(lateSession);
            }
          },
          () => {}
        );

        const abortWait = waitForAbort(operationAbortController.signal);
        const createdSession = await Promise.race([
          sessionPromise,
          abortWait.promise,
        ]).finally(abortWait.cleanup);

        if (aborted) {
          await closeQuietly(createdSession);
          throw new Error('Query aborted before initialization');
        }

        const result = createdSession.initResult;
        if (!isInitializeSessionResult(result)) {
          await closeQuietly(createdSession);
          throw new Error('Expected createSession() to return an init result');
        }

        session = createdSession;
        sessionId = createdSession.sessionId;
        initResult = result;
        return result;
      } catch (error) {
        await closeActiveSession();
        throw error;
      }
    })();

    return initializationPromise;
  };

  async function* generateMessages(): AsyncGenerator<
    DroidMessage,
    void,
    undefined
  > {
    if (aborted) return;

    await ensureInitialized();
    if (aborted) return;

    if (session === null) {
      return;
    }

    try {
      for await (const msg of session.stream(options.prompt, {
        abortSignal: operationAbortController.signal,
        outputFormat: options.outputFormat,
      })) {
        if (aborted) return;
        yield msg;
      }
    } catch (error) {
      if (aborted) return;
      throw error;
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
      cleanupAbortSignal();
      await closeActiveSession();
    }
  }

  const droidQuery = new DroidQueryImpl(
    wrappedGenerator(),
    () => sessionId,
    () => initResult,
    () => ensureInitialized(),
    async () => {
      if (session && !aborted) {
        await session.interrupt();
      }
    },
    () => {
      aborted = true;
      if (!operationAbortController.signal.aborted) {
        operationAbortController.abort(new Error('Query aborted'));
      }
      cleanupAbortSignal();
      if (!session) {
        void closeQuietly(options.transport);
      }
      void closeActiveSession();
    }
  );

  cleanupAbortSignal = wireAbortSignal(options.abortSignal, () =>
    droidQuery.abort()
  );

  return droidQuery;
}
