/**
 * Unit tests for createSession(), resumeSession(), and DroidSession.
 *
 * Uses InMemoryTransport to simulate the session lifecycle.
 * Covers VAL-API-002, VAL-API-003, VAL-API-004, VAL-API-005, VAL-API-006,
 * VAL-API-011, VAL-API-012, VAL-API-013, VAL-API-014.
 */

import { describe, expect, it } from 'vitest';

import { ConnectionError, SessionNotFoundError } from '../src/errors.js';
import {
  DroidClientMethod,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JsonRpcErrorCode,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  McpServerType,
  SessionNotificationType,
  SettingsLevel,
} from '../src/schemas/index.js';
import { createSession, resumeSession, DroidSession } from '../src/session.js';
import type { DroidResult } from '../src/session.js';
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

function makeErrorResponse(
  id: string,
  code: number,
  message: string
): Record<string, unknown> {
  return {
    jsonrpc: JSONRPC_VERSION,
    factoryApiVersion: LEGACY_FACTORY_API_VERSION,
    factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
    type: 'response',
    id,
    error: { code, message },
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

/**
 * Set up transport to auto-respond to initializeSession.
 * Returns transport ready for use.
 */
function setupInitResponder(
  transport: InMemoryTransport,
  sessionId: string
): void {
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
            sessionId,
            session: {},
            settings: { modelId: 'test-model', reasoningEffort: 'medium' },
            availableModels: [],
          })
        );
      });
    }
  };
}

/**
 * Set up transport to auto-respond to loadSession.
 */
function setupLoadResponder(
  transport: InMemoryTransport,
  sessionId: string
): void {
  const originalSend = transport.send.bind(transport);
  transport.send = (message: object) => {
    originalSend(message);
    const msg = message as Record<string, unknown>;
    const method = msg['method'] as string;
    const id = msg['id'] as string;

    if (method === DroidServerMethod.LOAD_SESSION) {
      queueMicrotask(() => {
        transport.injectMessage(
          makeSuccessResponse(id, {
            session: { id: sessionId },
            settings: { modelId: 'test-model', reasoningEffort: 'medium' },
          })
        );
      });
    }
  };
}

/**
 * Set up a fully-automated transport that responds to init, addUserMessage,
 * and sends streaming messages.
 */
function setupFullResponder(
  transport: InMemoryTransport,
  sessionId: string,
  responseMethods?: Record<string, (id: string) => void>
): void {
  const originalSend = transport.send.bind(transport);
  transport.send = (message: object) => {
    originalSend(message);
    const msg = message as Record<string, unknown>;
    const method = msg['method'] as string;
    const id = msg['id'] as string;

    if (responseMethods && responseMethods[method]) {
      responseMethods[method](id);
      return;
    }

    if (method === DroidServerMethod.INITIALIZE_SESSION) {
      queueMicrotask(() => {
        transport.injectMessage(
          makeSuccessResponse(id, {
            sessionId,
            session: {},
            settings: { modelId: 'test-model', reasoningEffort: 'medium' },
          })
        );
      });
    } else if (method === DroidServerMethod.LOAD_SESSION) {
      queueMicrotask(() => {
        transport.injectMessage(
          makeSuccessResponse(id, {
            session: { id: sessionId },
            settings: { modelId: 'test-model', reasoningEffort: 'medium' },
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
            textDelta: 'Hello world',
          })
        );

        transport.injectMessage(
          makeNotification(
            SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
            {
              tokenUsage: {
                inputTokens: 100,
                outputTokens: 50,
                cacheCreationTokens: 0,
                cacheReadTokens: 10,
                thinkingTokens: 5,
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
    } else if (method === DroidServerMethod.INTERRUPT_SESSION) {
      queueMicrotask(() => {
        transport.injectMessage(makeSuccessResponse(id, {}));
      });
    } else if (method === DroidServerMethod.UPDATE_SESSION_SETTINGS) {
      queueMicrotask(() => {
        transport.injectMessage(makeSuccessResponse(id, {}));
      });
    } else if (
      method === DroidServerMethod.ADD_MCP_SERVER ||
      method === DroidServerMethod.REMOVE_MCP_SERVER ||
      method === DroidServerMethod.TOGGLE_MCP_SERVER ||
      method === DroidServerMethod.LIST_MCP_SERVERS ||
      method === DroidServerMethod.LIST_MCP_TOOLS ||
      method === DroidServerMethod.AUTHENTICATE_MCP_SERVER ||
      method === DroidServerMethod.LIST_SKILLS
    ) {
      queueMicrotask(() => {
        if (method === DroidServerMethod.LIST_MCP_SERVERS) {
          transport.injectMessage(
            makeSuccessResponse(id, {
              servers: [],
              summary: {
                status: 'ready',
                totalServers: 0,
                connectedServers: 0,
              },
            })
          );
        } else if (method === DroidServerMethod.LIST_MCP_TOOLS) {
          transport.injectMessage(makeSuccessResponse(id, { tools: [] }));
        } else if (method === DroidServerMethod.LIST_SKILLS) {
          transport.injectMessage(makeSuccessResponse(id, { skills: [] }));
        } else {
          transport.injectMessage(makeSuccessResponse(id, { success: true }));
        }
      });
    }
  };
}

// ---------------------------------------------------------------------------
// Tests: createSession
// ---------------------------------------------------------------------------

describe('createSession()', () => {
  describe('VAL-API-002: returns functional session', () => {
    it('returns DroidSession with valid sessionId and initResult', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-create-001');

      const session = await createSession({ transport });

      expect(session).toBeInstanceOf(DroidSession);
      expect(session.sessionId).toBe('sess-create-001');
      expect(session.initResult).toBeDefined();
      expect((session.initResult as Record<string, unknown>).sessionId).toBe(
        'sess-create-001'
      );

      await session.close();
    });

    it('passes init options to initializeSession', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-create-002');

      const session = await createSession({
        transport,
        cwd: '/my/project',
        machineId: 'my-machine',
        modelId: 'claude-test',
      });

      // Check that initializeSession was called with correct params
      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INITIALIZE_SESSION
      ) as Record<string, unknown>;

      const params = initMsg['params'] as Record<string, unknown>;
      expect(params['cwd']).toBe('/my/project');
      expect(params['machineId']).toBe('my-machine');
      expect(params['modelId']).toBe('claude-test');

      await session.close();
    });

    it('cleans up transport on init failure', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Set up transport to return error for init
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeErrorResponse(id, -32603, 'Internal error')
            );
          });
        }
      };

      await expect(createSession({ transport })).rejects.toThrow();

      // Transport should be closed on failure
      expect(transport.isConnected).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: resumeSession
// ---------------------------------------------------------------------------

describe('resumeSession()', () => {
  describe('VAL-API-003: loads existing session', () => {
    it('returns DroidSession connected to existing session', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupLoadResponder(transport, 'sess-resume-001');

      const session = await resumeSession('sess-resume-001', { transport });

      expect(session).toBeInstanceOf(DroidSession);
      expect(session.sessionId).toBe('sess-resume-001');
      expect(session.initResult).toBeDefined();

      await session.close();
    });

    it('passes sessionId to loadSession', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupLoadResponder(transport, 'sess-resume-002');

      const session = await resumeSession('sess-resume-002', { transport });

      const loadMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.LOAD_SESSION
      ) as Record<string, unknown>;

      const params = loadMsg['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-resume-002');

      await session.close();
    });
  });

  describe('VAL-API-014: resumeSession with invalid ID throws SessionNotFoundError', () => {
    it('throws SessionNotFoundError for non-existent session', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Set up transport to return ENTITY_NOT_FOUND error
      const originalSend = transport.send.bind(transport);
      transport.send = (message: object) => {
        originalSend(message);
        const msg = message as Record<string, unknown>;
        const method = msg['method'] as string;
        const id = msg['id'] as string;

        if (method === DroidServerMethod.LOAD_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeErrorResponse(
                id,
                JsonRpcErrorCode.ENTITY_NOT_FOUND,
                'Session not found'
              )
            );
          });
        }
      };

      await expect(
        resumeSession('non-existent-session', { transport })
      ).rejects.toThrow(SessionNotFoundError);

      // Transport should be cleaned up
      expect(transport.isConnected).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: DroidSession
// ---------------------------------------------------------------------------

describe('DroidSession', () => {
  describe('stream() (VAL-API-004)', () => {
    it('returns AsyncGenerator yielding DroidMessage until TurnComplete', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-stream-001');

      const session = await createSession({ transport });

      const messages: DroidMessage[] = [];
      for await (const msg of session.stream('Hello')) {
        messages.push(msg);
      }

      // Should have messages including text deltas and turn_complete
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // Text delta should be present
      const textDeltas = messages.filter(
        (m) => m.type === 'assistant_text_delta'
      );
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);

      // Last message should be turn_complete
      expect(messages[messages.length - 1].type).toBe('turn_complete');

      await session.close();
    });

    it('supports multiple stream calls (multi-turn)', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-stream-multi');

      const session = await createSession({ transport });

      // First turn
      const msgs1: DroidMessage[] = [];
      for await (const msg of session.stream('First message')) {
        msgs1.push(msg);
      }
      expect(msgs1[msgs1.length - 1].type).toBe('turn_complete');

      // Second turn
      const msgs2: DroidMessage[] = [];
      for await (const msg of session.stream('Second message')) {
        msgs2.push(msg);
      }
      expect(msgs2[msgs2.length - 1].type).toBe('turn_complete');

      // Both turns should have sent addUserMessage
      const addMsgCalls = transport.sentMessages.filter(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_USER_MESSAGE
      );
      expect(addMsgCalls.length).toBe(2);

      await session.close();
    });
  });

  describe('send() (VAL-API-005)', () => {
    it('returns DroidResult with text, messages, tokenUsage', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-send-001');

      const session = await createSession({ transport });

      const result = await session.send('Write hello');

      // DroidResult structure (VAL-API-013)
      expect(result).toBeDefined();
      expect(typeof result.text).toBe('string');
      expect(result.text).toBe('Hello world');
      expect(Array.isArray(result.messages)).toBe(true);
      expect(result.messages.length).toBeGreaterThanOrEqual(3);

      // Token usage should be present
      expect(result.tokenUsage).toBeDefined();
      expect(result.tokenUsage!.inputTokens).toBe(100);
      expect(result.tokenUsage!.outputTokens).toBe(50);

      await session.close();
    });

    it('concatenates multiple text deltas', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Custom responder that sends multiple deltas
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
                sessionId: 'sess-concat',
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
                textDelta: 'Hello ',
              })
            );
            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'beautiful ',
              })
            );
            transport.injectMessage(
              makeNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
                messageId: 'msg-1',
                blockIndex: 0,
                textDelta: 'world!',
              })
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

      const session = await createSession({ transport });
      const result = await session.send('Test');

      expect(result.text).toBe('Hello beautiful world!');

      await session.close();
    });
  });

  describe('close() (VAL-API-006)', () => {
    it('closes transport and rejects pending requests', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-close-001');

      const session = await createSession({ transport });

      await session.close();

      // Transport should be closed
      expect(transport.isConnected).toBe(false);

      // Calling methods after close should throw
      await expect(session.send('test')).rejects.toThrow(ConnectionError);
    });

    it('is idempotent — safe to call multiple times', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-close-idempotent');

      const session = await createSession({ transport });

      await session.close();
      await session.close(); // Second call should not throw
      await session.close(); // Third call should not throw
    });
  });

  describe('MCP methods (VAL-API-011)', () => {
    it('delegates addMcpServer to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-mcp-001');

      const session = await createSession({ transport });

      const result = await session.addMcpServer({
        name: 'test-server',
        type: McpServerType.Stdio,
        command: 'npx',
        args: ['mcp-server'],
      });

      expect(result).toBeDefined();
      expect((result as Record<string, unknown>).success).toBe(true);

      // Verify the correct method was called
      const mcpMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_MCP_SERVER
      );
      expect(mcpMsg).toBeDefined();

      await session.close();
    });

    it('delegates removeMcpServer to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-mcp-002');

      const session = await createSession({ transport });

      const result = await session.removeMcpServer({
        serverName: 'test-server',
        settingsLevel: SettingsLevel.User,
      });

      expect(result).toBeDefined();

      await session.close();
    });

    it('delegates toggleMcpServer to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-mcp-003');

      const session = await createSession({ transport });

      const result = await session.toggleMcpServer({
        serverName: 'test-server',
        enabled: true,
        settingsLevel: SettingsLevel.User,
      });

      expect(result).toBeDefined();

      await session.close();
    });

    it('delegates listMcpServers to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-mcp-004');

      const session = await createSession({ transport });

      const result = await session.listMcpServers();

      expect(result).toBeDefined();
      expect(result.servers).toBeDefined();

      await session.close();
    });

    it('delegates listMcpTools to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-mcp-005');

      const session = await createSession({ transport });

      const result = await session.listMcpTools();

      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();

      await session.close();
    });

    it('delegates authenticateMcpServer to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-mcp-006');

      const session = await createSession({ transport });

      const result = await session.authenticateMcpServer({
        serverName: 'test-server',
      });

      expect(result).toBeDefined();

      await session.close();
    });

    it('throws ConnectionError on MCP calls after close', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-mcp-closed');

      const session = await createSession({ transport });
      await session.close();

      await expect(session.listMcpServers()).rejects.toThrow(ConnectionError);
      await expect(session.listMcpTools()).rejects.toThrow(ConnectionError);
    });
  });

  describe('updateSettings() (VAL-API-012)', () => {
    it('delegates updateSettings to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-settings-001');

      const session = await createSession({ transport });

      const result = await session.updateSettings({ modelId: 'new-model' });

      expect(result).toBeDefined();

      // Verify the correct method was called
      const settingsMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.UPDATE_SESSION_SETTINGS
      );
      expect(settingsMsg).toBeDefined();

      const params = (settingsMsg as Record<string, unknown>)[
        'params'
      ] as Record<string, unknown>;
      expect(params['modelId']).toBe('new-model');

      await session.close();
    });
  });

  describe('DroidResult structure (VAL-API-013)', () => {
    it('has text, messages array, and tokenUsage', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-result-001');

      const session = await createSession({ transport });

      const result: DroidResult = await session.send('Test');

      // Verify structure
      expect(typeof result.text).toBe('string');
      expect(Array.isArray(result.messages)).toBe(true);

      // tokenUsage should be present or null (present in our mock)
      expect(result.tokenUsage).not.toBeNull();
      if (result.tokenUsage) {
        expect(typeof result.tokenUsage.inputTokens).toBe('number');
        expect(typeof result.tokenUsage.outputTokens).toBe('number');
        expect(typeof result.tokenUsage.cacheReadTokens).toBe('number');
        expect(typeof result.tokenUsage.cacheWriteTokens).toBe('number');
        expect(typeof result.tokenUsage.thinkingTokens).toBe('number');
      }

      await session.close();
    });

    it('returns null tokenUsage when no usage notification received', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Set up responder without token usage
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
                sessionId: 'sess-no-tokens',
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
                textDelta: 'Hi',
              })
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

      const session = await createSession({ transport });
      const result = await session.send('Test');

      expect(result.tokenUsage).toBeNull();

      await session.close();
    });
  });

  describe('interrupt()', () => {
    it('sends interrupt_session request', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-interrupt-001');

      const session = await createSession({ transport });

      await session.interrupt();

      const interruptMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INTERRUPT_SESSION
      );
      expect(interruptMsg).toBeDefined();

      await session.close();
    });
  });

  describe('listSkills()', () => {
    it('delegates listSkills to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-skills-001');

      const session = await createSession({ transport });

      const result = await session.listSkills();

      expect(result).toBeDefined();
      expect(result.skills).toBeDefined();

      await session.close();
    });
  });

  describe('onNotification()', () => {
    it('registers notification callback', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-notif-001');

      const session = await createSession({ transport });

      const notifications: unknown[] = [];
      const unsub = session.onNotification((n) => {
        notifications.push(n);
      });

      // Inject a notification
      transport.injectMessage(
        makeNotification(SessionNotificationType.SESSION_TITLE_UPDATED, {
          title: 'New Title',
        })
      );

      // Allow microtask to propagate
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(notifications.length).toBe(1);

      // Unsubscribe
      unsub();

      // New notification should not be received
      transport.injectMessage(
        makeNotification(SessionNotificationType.SESSION_TITLE_UPDATED, {
          title: 'Another Title',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(notifications.length).toBe(1);

      await session.close();
    });
  });

  describe('post-close behavior', () => {
    it('stream() throws after close', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-post-close');

      const session = await createSession({ transport });
      await session.close();

      await expect(async () => {
        for await (const _msg of session.stream('test')) {
          // should not reach here
        }
      }).rejects.toThrow(ConnectionError);
    });

    it('interrupt() throws after close', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-post-close-int');

      const session = await createSession({ transport });
      await session.close();

      await expect(session.interrupt()).rejects.toThrow(ConnectionError);
    });

    it('updateSettings() throws after close', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-post-close-settings');

      const session = await createSession({ transport });
      await session.close();

      await expect(session.updateSettings({ modelId: 'x' })).rejects.toThrow(
        ConnectionError
      );
    });
  });
});
