/**
 * Offline DroidResult metadata check.
 *
 * Verifies that `run()` / `session.send()` results include sessionId,
 * durationMs, turnCount, success, and error metadata.
 *
 * Usage:
 *   npx tsx examples/result-metadata.ts
 */

import assert from 'node:assert/strict';

import {
  DroidClientMethod,
  DroidErrorType,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
  run,
  type DroidClientTransport,
  type ErrorCallback,
  type MessageCallback,
} from '../src/index.js';

type JsonMessage = Record<string, unknown>;

class ResultMetadataTransport implements DroidClientTransport {
  readonly sentMessages: JsonMessage[] = [];

  private messageHandler: MessageCallback | null = null;
  private _isConnected = false;

  constructor(
    private readonly sessionId: string,
    private readonly emitError: boolean
  ) {}

  get isConnected(): boolean {
    return this._isConnected;
  }

  async connect(): Promise<void> {
    this._isConnected = true;
  }

  send(message: JsonMessage): void {
    assert.equal(this._isConnected, true, 'transport should be connected');
    this.sentMessages.push(message);

    const method = message['method'];
    const id = String(message['id']);

    if (method === DroidServerMethod.INITIALIZE_SESSION) {
      queueMicrotask(() => {
        this.injectMessage(
          makeSuccessResponse(id, {
            sessionId: this.sessionId,
            session: {},
            settings: {
              modelId: 'offline-model',
              reasoningEffort: 'medium',
            },
          })
        );
      });
    }

    if (method === DroidServerMethod.ADD_USER_MESSAGE) {
      queueMicrotask(() => {
        this.injectMessage(makeSuccessResponse(id, {}));
        this.sendTurn();
      });
    }
  }

  onMessage(callback: MessageCallback): void {
    this.messageHandler = callback;
  }

  onError(_callback: ErrorCallback): void {
    // This example only exercises protocol-level success and error events.
  }

  async close(): Promise<void> {
    this._isConnected = false;
  }

  private injectMessage(message: JsonMessage): void {
    this.messageHandler?.(message);
  }

  private sendTurn(): void {
    this.injectMessage(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.StreamingAssistantMessage }
      )
    );

    if (this.emitError) {
      this.injectMessage(
        makeSessionNotification(SessionNotificationType.ERROR, {
          message: 'Offline error event',
          errorType: DroidErrorType.ERROR,
          timestamp: '2026-05-02T00:00:00.000Z',
        })
      );
    } else {
      this.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          messageId: 'msg-1',
          blockIndex: 0,
          textDelta: 'Metadata OK',
        })
      );
    }

    this.injectMessage(
      makeSessionNotification(
        SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
        {
          sessionId: this.sessionId,
          tokenUsage: {
            inputTokens: 12,
            outputTokens: this.emitError ? 0 : 3,
            cacheCreationTokens: 0,
            cacheReadTokens: 0,
            thinkingTokens: 0,
          },
        }
      )
    );

    this.injectMessage(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.Idle }
      )
    );
  }
}

function makeSuccessResponse(id: string, result: JsonMessage): JsonMessage {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'response',
    id,
    result,
  };
}

function makeSessionNotification(
  notificationType: string,
  payload: JsonMessage
): JsonMessage {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'notification',
    method: DroidClientMethod.SESSION_NOTIFICATION,
    params: {
      notification: {
        type: notificationType,
        ...payload,
      },
    },
  };
}

async function main(): Promise<void> {
  const successTransport = new ResultMetadataTransport(
    'offline-result-success',
    false
  );
  await successTransport.connect();

  const success = await run('Check result metadata', {
    transport: successTransport,
  });

  assert.equal(success.sessionId, 'offline-result-success');
  assert.equal(success.text, 'Metadata OK');
  assert.equal(success.success, true);
  assert.equal(success.error, null);
  assert.equal(success.turnCount, 1);
  assert.equal(success.tokenUsage?.inputTokens, 12);
  assert.equal(successTransport.isConnected, false);
  assert.equal(typeof success.durationMs, 'number');
  assert.ok(success.durationMs >= 0);

  const errorTransport = new ResultMetadataTransport(
    'offline-result-error',
    true
  );
  await errorTransport.connect();

  const error = await run('Check error metadata', {
    transport: errorTransport,
  });

  assert.equal(error.sessionId, 'offline-result-error');
  assert.equal(error.success, false);
  assert.equal(error.error?.message, 'Offline error event');
  assert.equal(error.turnCount, 1);
  assert.equal(errorTransport.isConnected, false);

  console.log('result metadata check passed');
}

main().catch((error: unknown) => {
  console.error('result metadata check failed:', error);
  process.exit(1);
});
