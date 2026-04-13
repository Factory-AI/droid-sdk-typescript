/**
 * Unit tests for query() function and DroidQuery type.
 *
 * Uses InMemoryTransport to simulate the full query lifecycle.
 * Covers VAL-API-001, VAL-API-007, VAL-API-008, VAL-API-009, VAL-API-010.
 */

import { describe, expect, it } from 'vitest';

import { SDK_TAG } from '../src/constants.js';
import { query } from '../src/query.js';
import {
  DroidClientMethod,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
} from '../src/schemas/index.js';
import type { DroidMessage } from '../src/stream.js';
import { InMemoryTransport } from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuccessResponse(
  id: string,
  result: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'response',
    id,
    result,
  };
}

function makeNotification(
  notificationType: string,
  payload: Record<string, unknown> = {}
): Record<string, unknown> {
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

function makeServerRequest(
  id: string,
  method: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'request',
    id,
    method,
    params,
  };
}

/**
 * Simulate a full query lifecycle on the transport:
 * 1. Respond to initializeSession request
 * 2. Respond to addUserMessage request
 * 3. Send streaming notifications
 * 4. Send working_state_changed to idle (triggers TurnComplete)
 */
function simulateQueryLifecycle(
  transport: InMemoryTransport,
  sessionId: string,
  deltas: string[] = ['Hello', ' world']
): void {
  // We need to intercept the sent messages and respond appropriately
  let _messageCount = 0;

  const originalSend = transport.send.bind(transport);
  transport.send = (message: object) => {
    originalSend(message);
    const msg = message as Record<string, unknown>;
    const method = msg['method'] as string;
    const id = msg['id'] as string;

    _messageCount++;

    if (method === DroidServerMethod.INITIALIZE_SESSION) {
      // Respond with sessionId
      queueMicrotask(() => {
        transport.injectMessage(
          makeSuccessResponse(id, {
            sessionId,
            session: {},
            settings: {
              modelId: 'test-model',
              reasoningEffort: 'medium',
            },
          })
        );
      });
    } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
      // Respond to addUserMessage then send streaming notifications
      queueMicrotask(() => {
        transport.injectMessage(makeSuccessResponse(id, {}));

        // Send working state change to non-idle
        transport.injectMessage(
          makeNotification(
            SessionNotificationType.DROID_WORKING_STATE_CHANGED,
            { newState: DroidWorkingState.StreamingAssistantMessage }
          )
        );

        // Send text deltas
        for (const delta of deltas) {
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: delta,
            })
          );
        }

        // Send token usage
        transport.injectMessage(
          makeNotification(
            SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
            {
              tokenUsage: {
                inputTokens: 100,
                outputTokens: 50,
                cacheCreationTokens: 0,
                cacheReadTokens: 10,
                thinkingTokens: 0,
              },
            }
          )
        );

        // Send working state change to idle (triggers TurnComplete)
        transport.injectMessage(
          makeNotification(
            SessionNotificationType.DROID_WORKING_STATE_CHANGED,
            { newState: DroidWorkingState.Idle }
          )
        );
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('query()', () => {
  describe('lifecycle (VAL-API-001)', () => {
    it('spawns transport, initializes session, sends message, yields DroidMessage, cleans up', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-001', ['Hello', ' world']);

      const messages: DroidMessage[] = [];
      const q = query({
        prompt: 'Test prompt',
        cwd: '/tmp',
        transport,
      });

      for await (const msg of q) {
        messages.push(msg);
      }

      // Should have received messages: working_state_changed, text deltas, token_usage_update, working_state_changed (idle), turn_complete
      expect(messages.length).toBeGreaterThanOrEqual(5);

      // First message should be working state change
      expect(messages[0].type).toBe('working_state_changed');

      // Should contain text deltas
      const textDeltas = messages.filter(
        (m) => m.type === 'assistant_text_delta'
      );
      expect(textDeltas.length).toBe(2);

      // Last message should be turn_complete
      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.type).toBe('turn_complete');

      // Transport should have been sent initializeSession and addUserMessage
      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)['method']
      );
      expect(sentMethods).toContain(DroidServerMethod.INITIALIZE_SESSION);
      expect(sentMethods).toContain(DroidServerMethod.ADD_USER_MESSAGE);

      // Transport should be closed after query completes
      expect(transport.isConnected).toBe(false);
    });

    it('passes QueryOptions to initializeSession', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-002');

      const q = query({
        prompt: 'Test',
        cwd: '/my/project',
        machineId: 'my-machine',
        modelId: 'claude-test',
        transport,
      });

      for await (const _msg of q) {
        // consume all messages
      }

      // Check that initializeSession was called with correct params
      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INITIALIZE_SESSION
      ) as Record<string, unknown>;
      expect(initMsg).toBeDefined();

      const params = initMsg['params'] as Record<string, unknown>;
      expect(params['cwd']).toBe('/my/project');
      expect(params['machineId']).toBe('my-machine');
      expect(params['modelId']).toBe('claude-test');
    });

    it('sends the prompt as user message', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-003');

      const q = query({
        prompt: 'Fix the bug',
        transport,
      });

      for await (const _msg of q) {
        // consume
      }

      // Check addUserMessage was called with the prompt
      const addMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_USER_MESSAGE
      ) as Record<string, unknown>;
      expect(addMsg).toBeDefined();

      const params = addMsg['params'] as Record<string, unknown>;
      expect(params['text']).toBe('Fix the bug');
    });
  });

  describe('DroidQuery.interrupt() (VAL-API-007)', () => {
    it('sends interrupt_session request', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let interruptResponseSent = false;

      // Custom lifecycle that waits for interrupt
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-int',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            // Start streaming
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Starting...',
              })
            );
          });
        } else if (method === DroidServerMethod.INTERRUPT_SESSION) {
          interruptResponseSent = true;
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            // After interrupt, agent winds down
            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          });
        }
      };

      const q = query({ prompt: 'Long task', transport });

      const messages: DroidMessage[] = [];
      let interrupted = false;

      for await (const msg of q) {
        messages.push(msg);
        if (msg.type === 'assistant_text_delta' && !interrupted) {
          interrupted = true;
          await q.interrupt();
        }
      }

      expect(interruptResponseSent).toBe(true);

      // Should have received turn_complete at the end
      expect(messages[messages.length - 1].type).toBe('turn_complete');

      // Verify interrupt_session was sent
      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)['method']
      );
      expect(sentMethods).toContain(DroidServerMethod.INTERRUPT_SESSION);
    });
  });

  describe('DroidQuery.abort() (VAL-API-008)', () => {
    it('forcefully closes transport and terminates generator', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Only respond to init and addUserMessage, then stream forever
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-abort',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Starting...',
              })
            );
          });
        }
      };

      const q = query({ prompt: 'Abort me', transport });

      const messages: DroidMessage[] = [];
      for await (const msg of q) {
        messages.push(msg);
        if (msg.type === 'assistant_text_delta') {
          q.abort();
        }
      }

      // Generator should have terminated
      expect(messages.length).toBeGreaterThanOrEqual(1);

      // Transport should be closed
      expect(transport.isConnected).toBe(false);
    });
  });

  describe('DroidQuery.sessionId (VAL-API-009)', () => {
    it('is null before initialization', () => {
      const transport = new InMemoryTransport();
      // Don't connect or start — just create the query
      // sessionId should be null since we haven't started iteration
      const q = query({
        prompt: 'Test',
        transport,
      });

      expect(q.sessionId).toBeNull();
    });

    it('is accessible after initialization', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-id-test');

      const q = query({ prompt: 'Test', transport });

      // Consume first message to trigger initialization
      const iterator = q[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);

      // sessionId should now be set
      expect(q.sessionId).toBe('sess-id-test');

      // Consume rest
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
      }
    });
  });

  describe('cleanup on early break (VAL-API-010)', () => {
    it('closes transport when breaking out of generator early', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Set up lifecycle that never completes
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-break',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            // Send several deltas
            for (let i = 0; i < 10; i++) {
              transport.injectMessage(
                makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: `delta-${i} `,
                })
              );
            }
          });
        }
      };

      const q = query({ prompt: 'Long output', transport });

      let count = 0;
      for await (const _msg of q) {
        count++;
        if (count >= 3) {
          break; // Early break
        }
      }

      // Give cleanup a tick
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Transport should be closed (no resource leak)
      expect(transport.isConnected).toBe(false);
    });
  });

  // =========================================================================
  // #13 — query().abort() before initialization
  // =========================================================================
  describe('abort before initialization', () => {
    it('abort() during init terminates generator without hanging', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Transport that never responds to init (simulates slow startup)
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        // Never respond — init hangs
      };

      const q = query({ prompt: 'Test', transport });

      // Abort after a short delay (init is pending)
      setTimeout(() => q.abort(), 50);

      const messages: DroidMessage[] = [];
      // The for-await should terminate because abort() kills the transport
      // which rejects the pending init request
      try {
        for await (const msg of q) {
          messages.push(msg);
        }
      } catch {
        // Expected — abort during init causes a ConnectionError
      }

      // Transport should be closed
      expect(transport.isConnected).toBe(false);
    });
  });

  // =========================================================================
  // #21 — query() with askUserHandler
  // =========================================================================
  describe('query() with askUserHandler', () => {
    it('invokes askUserHandler when server sends ASK_USER request', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let askHandlerCalled = false;
      let receivedParams: Record<string, unknown> | null = null;

      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-ask-query',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            // Server sends ASK_USER request
            transport.injectMessage(
              makeServerRequest('ask-q-1', DroidClientMethod.ASK_USER, {
                questions: [
                  {
                    index: 0,
                    topic: 'Lang',
                    question: 'Which language?',
                    options: ['TypeScript', 'Python'],
                  },
                ],
              })
            );

            // After handler responds, continue
            setTimeout(() => {
              transport.injectMessage(
                makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: 'Using TypeScript.',
                })
              );

              transport.injectMessage(
                makeNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.Idle }
                )
              );
            }, 30);
          });
        }
      };

      const q = query({
        prompt: 'Set up project',
        transport,
        askUserHandler: (params) => {
          askHandlerCalled = true;
          receivedParams = params;
          return {
            cancelled: false,
            answers: [
              { index: 0, question: 'Which language?', answer: 'TypeScript' },
            ],
          };
        },
      });

      const messages: DroidMessage[] = [];
      for await (const msg of q) {
        messages.push(msg);
      }

      expect(askHandlerCalled).toBe(true);
      expect(receivedParams).not.toBeNull();
      expect(
        (receivedParams as unknown as Record<string, unknown>)['questions']
      ).toBeDefined();

      // Verify response was sent back
      const askResponse = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['type'] === 'response' &&
          (m as Record<string, unknown>)['id'] === 'ask-q-1'
      ) as Record<string, unknown>;
      expect(askResponse).toBeDefined();
      expect(
        (askResponse['result'] as Record<string, unknown>)['cancelled']
      ).toBe(false);

      // Stream should have completed
      expect(messages[messages.length - 1].type).toBe('turn_complete');
    });
  });

  // =========================================================================
  // SDK_TAG auto-injection
  // =========================================================================
  describe('SDK_TAG auto-injection', () => {
    it('injects SDK_TAG when no user tags are provided', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-sdk-tag-q-default');

      const q = query({ prompt: 'Test', transport });

      for await (const _msg of q) {
        // consume
      }

      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INITIALIZE_SESSION
      ) as Record<string, unknown>;

      const params = initMsg['params'] as Record<string, unknown>;
      expect(params['tags']).toEqual([SDK_TAG]);
    });

    it('merges user tags with SDK_TAG', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-sdk-tag-q-merge');

      const q = query({
        prompt: 'Test',
        transport,
        tags: [{ name: 'custom', metadata: { env: 'test' } }],
      });

      for await (const _msg of q) {
        // consume
      }

      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INITIALIZE_SESSION
      ) as Record<string, unknown>;

      const params = initMsg['params'] as Record<string, unknown>;
      expect(params['tags']).toEqual([
        { name: 'custom', metadata: { env: 'test' } },
        SDK_TAG,
      ]);
    });
  });

  // =========================================================================
  // abortSignal support
  // =========================================================================
  describe('abortSignal', () => {
    it('aborts the query when signal fires', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Only respond to init and addUserMessage, then stream without completing
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-abort-signal',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'Hello',
              })
            );
          });
        }
      };

      const controller = new AbortController();

      const q = query({
        prompt: 'Long task',
        transport,
        abortSignal: controller.signal,
      });

      const messages: DroidMessage[] = [];
      for await (const msg of q) {
        messages.push(msg);
        if (msg.type === 'assistant_text_delta') {
          controller.abort();
        }
      }

      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(transport.isConnected).toBe(false);
    });

    it('terminates immediately when signal is already aborted', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      const controller = new AbortController();
      controller.abort(); // Already aborted

      const q = query({
        prompt: 'Test',
        transport,
        abortSignal: controller.signal,
      });

      const messages: DroidMessage[] = [];
      try {
        for await (const msg of q) {
          messages.push(msg);
        }
      } catch {
        // Expected — abort during init causes a ConnectionError
      }

      // No messages should be yielded since the generator exits immediately
      expect(messages).toHaveLength(0);

      // No RPC requests should have been sent
      expect(transport.sentMessages).toHaveLength(0);
    });

    it('does not interfere when signal is never aborted', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      simulateQueryLifecycle(transport, 'sess-signal-noop');

      const controller = new AbortController();

      const q = query({
        prompt: 'Test',
        transport,
        abortSignal: controller.signal,
      });

      const messages: DroidMessage[] = [];
      for await (const msg of q) {
        messages.push(msg);
      }

      // Should complete normally with turn_complete
      expect(messages[messages.length - 1].type).toBe('turn_complete');
      expect(transport.isConnected).toBe(false);
    });
  });

  describe('permission and ask-user handlers', () => {
    it('invokes permissionHandler when set', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let permissionCalled = false;

      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-perm',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));

            // Send a permission request from the server
            transport.injectMessage(
              makeServerRequest(
                'perm-req-1',
                DroidClientMethod.REQUEST_PERMISSION,
                { toolName: 'execute', command: 'rm -rf /' }
              )
            );

            // After response, continue streaming
            setTimeout(() => {
              transport.injectMessage(
                makeNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.StreamingAssistantMessage }
                )
              );
              transport.injectMessage(
                makeNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.Idle }
                )
              );
            }, 20);
          });
        }
      };

      const q = query({
        prompt: 'Do something',
        transport,
        permissionHandler: (_params) => {
          permissionCalled = true;
          return 'proceed_once';
        },
      });

      for await (const _msg of q) {
        // consume
      }

      expect(permissionCalled).toBe(true);
    });
  });
});
