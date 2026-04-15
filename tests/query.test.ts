/**
 * Unit tests for query() function and DroidQuery type.
 *
 * Uses InMemoryTransport to simulate the full query lifecycle.
 * Covers VAL-API-001, VAL-API-007, VAL-API-008, VAL-API-009, VAL-API-010.
 */

import { describe, expect, it } from 'vitest';

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
  let _messageCount = 0;

  const originalSend = transport.send.bind(transport);
  transport.send = (message: Record<string, unknown>) => {
    originalSend(message);
    const msg = message as Record<string, unknown>;
    const method = msg['method'] as string;
    const id = msg['id'] as string;

    _messageCount++;

    if (method === DroidServerMethod.INITIALIZE_SESSION) {
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
      queueMicrotask(() => {
        transport.injectMessage(makeSuccessResponse(id, {}));

        transport.injectMessage(
          makeNotification(
            SessionNotificationType.DROID_WORKING_STATE_CHANGED,
            { newState: DroidWorkingState.StreamingAssistantMessage }
          )
        );

        for (const delta of deltas) {
          transport.injectMessage(
            makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
              messageId: 'msg-1',
              blockIndex: 0,
              textDelta: delta,
            })
          );
        }

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

      expect(messages.length).toBeGreaterThanOrEqual(5);

      expect(messages[0].type).toBe('working_state_changed');

      const textDeltas = messages.filter(
        (m) => m.type === 'assistant_text_delta'
      );
      expect(textDeltas.length).toBe(2);

      const lastMsg = messages[messages.length - 1];
      expect(lastMsg.type).toBe('turn_complete');

      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)['method']
      );
      expect(sentMethods).toContain(DroidServerMethod.INITIALIZE_SESSION);
      expect(sentMethods).toContain(DroidServerMethod.ADD_USER_MESSAGE);

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
        enabledToolIds: ['Read'],
        disabledToolIds: ['Execute'],
        transport,
      });

      for await (const _msg of q) {
        void _msg;
      }

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
      expect(params['enabledToolIds']).toEqual(['Read']);
      expect(params['disabledToolIds']).toEqual(['Execute']);
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
        void _msg;
      }

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

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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

      expect(messages[messages.length - 1].type).toBe('turn_complete');

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

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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

      expect(messages.length).toBeGreaterThanOrEqual(1);

      expect(transport.isConnected).toBe(false);
    });
  });

  describe('DroidQuery.sessionId (VAL-API-009)', () => {
    it('is null before initialization', () => {
      const transport = new InMemoryTransport();
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

      const iterator = q[Symbol.asyncIterator]();
      const first = await iterator.next();
      expect(first.done).toBe(false);

      expect(q.sessionId).toBe('sess-id-test');

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

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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
          break;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transport.isConnected).toBe(false);
    });
  });

  describe('abort before initialization', () => {
    it('abort() during init terminates generator without hanging', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
        originalSend(message);
      };

      const q = query({ prompt: 'Test', transport });

      setTimeout(() => q.abort(), 50);

      const messages: DroidMessage[] = [];
      try {
        for await (const msg of q) {
          messages.push(msg);
        }
      } catch {
        void 0;
      }

      expect(transport.isConnected).toBe(false);
    });
  });

  describe('query() with askUserHandler', () => {
    it('invokes askUserHandler when server sends ASK_USER request', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let askHandlerCalled = false;
      let receivedParams: Record<string, unknown> | null = null;

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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

            transport.injectMessage(
              makeServerRequest('ask-q-1', DroidClientMethod.ASK_USER, {
                toolCallId: 'tool-ask-1',
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

      const askResponse = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['type'] === 'response' &&
          (m as Record<string, unknown>)['id'] === 'ask-q-1'
      ) as Record<string, unknown>;
      expect(askResponse).toBeDefined();
      expect(
        (askResponse['result'] as Record<string, unknown>)['cancelled']
      ).toBe(false);

      expect(messages[messages.length - 1].type).toBe('turn_complete');
    });
  });

  describe('permission and ask-user handlers', () => {
    it('invokes permissionHandler when set', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let permissionCalled = false;

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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

            transport.injectMessage(
              makeServerRequest(
                'perm-req-1',
                DroidClientMethod.REQUEST_PERMISSION,
                {
                  toolUses: [
                    {
                      toolUse: {
                        type: 'tool_use',
                        id: 'tu-exec-1',
                        name: 'execute',
                        input: { command: 'rm -rf /' },
                      },
                      confirmationType: 'exec',
                      details: {
                        type: 'exec',
                        fullCommand: 'rm -rf /',
                        command: 'rm -rf /',
                      },
                    },
                  ],
                  options: [
                    { label: 'Proceed once', value: 'proceed_once' },
                    { label: 'Cancel', value: 'cancel' },
                  ],
                }
              )
            );

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
        void _msg;
      }

      expect(permissionCalled).toBe(true);
    });
  });
});
