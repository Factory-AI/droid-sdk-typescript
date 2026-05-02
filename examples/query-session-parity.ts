/**
 * Offline query/session parity check.
 *
 * Verifies that `query()` still exposes lazy initialization metadata,
 * streams the expected messages, and closes its transport.
 *
 * Usage:
 *   npx tsx examples/query-session-parity.ts
 */

import assert from 'node:assert/strict';

import {
  DroidClientMethod,
  DroidMessageType,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
  query,
  type DroidClientTransport,
  type DroidMessage,
  type ErrorCallback,
  type MessageCallback,
} from '../src/index.js';

type JsonMessage = Record<string, unknown>;

class OfflineTransport implements DroidClientTransport {
  readonly sentMessages: JsonMessage[] = [];

  private messageHandler: MessageCallback | null = null;
  private _isConnected = false;

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
            sessionId: 'offline-query-session',
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
        this.sendStream();
      });
    }
  }

  onMessage(callback: MessageCallback): void {
    this.messageHandler = callback;
  }

  onError(_callback: ErrorCallback): void {
    // This example only exercises the successful path.
  }

  async close(): Promise<void> {
    this._isConnected = false;
  }

  private injectMessage(message: JsonMessage): void {
    this.messageHandler?.(message);
  }

  private sendStream(): void {
    this.injectMessage(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.StreamingAssistantMessage }
      )
    );

    for (const textDelta of ['Hello', ' world']) {
      this.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          messageId: 'msg-1',
          blockIndex: 0,
          textDelta,
        })
      );
    }

    this.injectMessage(
      makeSessionNotification(
        SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
        {
          sessionId: 'offline-query-session',
          tokenUsage: {
            inputTokens: 10,
            outputTokens: 2,
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
  const transport = new OfflineTransport();
  await transport.connect();

  const stream = query({
    prompt: 'Offline parity prompt',
    transport,
    cwd: '/offline/project',
  });

  assert.equal(stream.sessionId, null);
  assert.equal(stream.initResult, null);

  const initResult = await stream.initialized;
  assert.equal(initResult.sessionId, 'offline-query-session');
  assert.equal(stream.sessionId, 'offline-query-session');
  assert.equal(stream.initResult, initResult);
  assert.deepEqual(
    transport.sentMessages.map((message) => message['method']),
    [DroidServerMethod.INITIALIZE_SESSION],
    'initialized should not send the prompt before iteration'
  );

  const messages: DroidMessage[] = [];
  for await (const message of stream) {
    messages.push(message);
  }

  const text = messages
    .filter((message) => message.type === DroidMessageType.AssistantTextDelta)
    .map((message) => message.text)
    .join('');
  const lastMessage = messages[messages.length - 1];

  assert.equal(text, 'Hello world');
  assert.equal(lastMessage.type, DroidMessageType.TurnComplete);
  if (lastMessage.type === DroidMessageType.TurnComplete) {
    assert.equal(lastMessage.tokenUsage?.inputTokens, 10);
    assert.equal(lastMessage.tokenUsage?.outputTokens, 2);
  }
  assert.equal(transport.isConnected, false);

  console.log('query/session parity check passed');
}

main().catch((error: unknown) => {
  console.error('query/session parity check failed:', error);
  process.exit(1);
});
