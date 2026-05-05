/**
 * Offline structured output check.
 *
 * Verifies that `run()` sends a Claude-style outputFormat and parses
 * the assistant JSON text into `result.structuredOutput`.
 *
 * Usage:
 *   npx tsx examples/structured-output.ts
 */

import assert from 'node:assert/strict';

import { z } from 'zod';

import {
  DroidClientMethod,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  JsonRpcMessageType,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
  run,
  type DroidClientTransport,
  type ErrorCallback,
  type MessageCallback,
} from '../src/index.js';

const JsonMessageSchema = z.record(z.unknown());
type JsonMessage = z.infer<typeof JsonMessageSchema>;

class StructuredOutputTransport implements DroidClientTransport {
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
            sessionId: 'offline-structured-output',
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
        this.sendStructuredTurn();
      });
    }
  }

  onMessage(callback: MessageCallback): void {
    this.messageHandler = callback;
  }

  onError(_callback: ErrorCallback): void {
    // This example only exercises protocol-level success notifications.
  }

  async close(): Promise<void> {
    this._isConnected = false;
  }

  private injectMessage(message: JsonMessage): void {
    this.messageHandler?.(message);
  }

  private sendStructuredTurn(): void {
    this.injectMessage(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.StreamingAssistantMessage }
      )
    );
    this.injectMessage(
      makeSessionNotification(SessionNotificationType.CREATE_MESSAGE, {
        message: {
          id: 'msg-structured',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                name: 'Ada Lovelace',
                language: 'TypeScript',
              }),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      })
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
    type: JsonRpcMessageType.Response,
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
    type: JsonRpcMessageType.Notification,
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
  const transport = new StructuredOutputTransport();
  await transport.connect();

  const outputFormat = {
    type: 'json_schema' as const,
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        language: { type: 'string' },
      },
      required: ['name', 'language'],
    },
  };

  const result = await run('Return a person as JSON', {
    transport,
    outputFormat,
  });

  const addUserMessage = transport.sentMessages.find(
    (message) => message['method'] === DroidServerMethod.ADD_USER_MESSAGE
  );
  const addUserMessageParams = JsonMessageSchema.parse(
    addUserMessage?.['params']
  );

  assert.deepEqual(addUserMessageParams['outputFormat'], outputFormat);
  assert.deepEqual(result.structuredOutput, {
    name: 'Ada Lovelace',
    language: 'TypeScript',
  });

  console.log('Structured output example passed');
}

main().catch((error: unknown) => {
  console.error('Structured output example failed:', error);
  process.exit(1);
});
