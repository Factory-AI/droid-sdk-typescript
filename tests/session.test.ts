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
  AutonomyLevel,
  DroidClientMethod,
  DroidInteractionMode,
  DroidServerMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JsonRpcErrorCode,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  McpServerType,
  ReasoningEffort,
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
              sessionId,
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
                total: 0,
                connected: 0,
                connecting: 0,
                failed: 0,
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
        expect(typeof result.tokenUsage.cacheCreationTokens).toBe('number');
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

  describe('getRewindInfo()', () => {
    it('delegates getRewindInfo to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-rewind-info-001', {
        [DroidServerMethod.GET_REWIND_INFO]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                availableFiles: [
                  { filePath: '/src/main.ts', contentHash: 'abc', size: 100 },
                ],
                createdFiles: [],
                evictedFiles: [],
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.getRewindInfo({ messageId: 'msg-1' });

      expect(result).toBeDefined();
      expect(result.availableFiles).toHaveLength(1);
      expect(result.createdFiles).toHaveLength(0);
      expect(result.evictedFiles).toHaveLength(0);

      await session.close();
    });
  });

  describe('executeRewind()', () => {
    it('delegates executeRewind to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-rewind-exec-001', {
        [DroidServerMethod.EXECUTE_REWIND]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                newSessionId: 'new-sess-001',
                restoredCount: 2,
                deletedCount: 1,
                failedRestoreCount: 0,
                failedDeleteCount: 0,
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.executeRewind({
        messageId: 'msg-1',
        filesToRestore: [
          { filePath: '/src/a.ts', contentHash: 'h1', size: 50 },
        ],
        filesToDelete: [{ filePath: '/src/b.ts' }],
        forkTitle: 'Rewind test',
      });

      expect(result.newSessionId).toBe('new-sess-001');
      expect(result.restoredCount).toBe(2);

      await session.close();
    });
  });

  describe('compactSession()', () => {
    it('delegates compactSession to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-compact-001', {
        [DroidServerMethod.COMPACT_SESSION]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                newSessionId: 'compact-sess-001',
                removedCount: 15,
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.compactSession({
        customInstructions: 'Keep context',
      });

      expect(result.newSessionId).toBe('compact-sess-001');
      expect(result.removedCount).toBe(15);

      await session.close();
    });

    it('works without params (defaults to empty object)', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-compact-002', {
        [DroidServerMethod.COMPACT_SESSION]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                newSessionId: 'compact-sess-002',
                removedCount: 5,
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.compactSession();

      expect(result.newSessionId).toBe('compact-sess-002');

      await session.close();
    });
  });

  describe('forkSession()', () => {
    it('delegates forkSession to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-fork-001', {
        [DroidServerMethod.FORK_SESSION]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                newSessionId: 'forked-sess-001',
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.forkSession();

      expect(result.newSessionId).toBe('forked-sess-001');

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

  describe('close() during active stream', () => {
    it('close() during active stream closes transport and subsequent calls throw', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      // Wire addUserMessage to send streaming state + one delta,
      // then send Idle after a delay (simulating close racing with the stream)
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
                sessionId: 'sess-close-stream',
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

            // Send Idle so the stream completes
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

      const messages: DroidMessage[] = [];
      for await (const msg of session.stream('test')) {
        messages.push(msg);
        if (msg.type === 'assistant_text_delta') {
          // Close session mid-stream — this won't terminate the current generator
          // but marks the session as closed for future use
          await session.close();
        }
      }

      // Stream completed (turn_complete was emitted)
      expect(messages[messages.length - 1].type).toBe('turn_complete');
      expect(transport.isConnected).toBe(false);

      // Session is now closed — subsequent calls throw
      await expect(session.send('test')).rejects.toThrow(ConnectionError);
    });
  });

  describe('concurrent usage', () => {
    it('second stream() call while first is active receives its own messages', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let addUserMessageCount = 0;

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
                sessionId: 'sess-concurrent',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          addUserMessageCount++;
          const callIndex = addUserMessageCount;
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
                messageId: `msg-${callIndex}`,
                blockIndex: 0,
                textDelta: `Response ${callIndex}`,
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

      const msgsA: DroidMessage[] = [];
      const msgsB: DroidMessage[] = [];

      // Start both streams concurrently
      const promiseA = (async () => {
        for await (const msg of session.stream('A')) {
          msgsA.push(msg);
        }
      })();

      const promiseB = (async () => {
        for await (const msg of session.stream('B')) {
          msgsB.push(msg);
        }
      })();

      await Promise.all([promiseA, promiseB]);

      // Both should have received messages and completed with turn_complete
      expect(msgsA.length).toBeGreaterThan(0);
      expect(msgsB.length).toBeGreaterThan(0);
      expect(msgsA[msgsA.length - 1].type).toBe('turn_complete');
      expect(msgsB[msgsB.length - 1].type).toBe('turn_complete');

      await session.close();
    });
  });

  describe('transport errors during stream', () => {
    it('transport error before addUserMessage response rejects stream', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

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
                sessionId: 'sess-transport-err',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          // Don't respond — inject a transport error instead
          setTimeout(() => {
            transport.injectError(new Error('process crashed'));
          }, 10);
        }
      };

      const session = await createSession({ transport });

      // The stream should throw because addUserMessage fails with transport error
      await expect(async () => {
        for await (const _msg of session.stream('test')) {
          // should not yield
        }
      }).rejects.toThrow(ConnectionError);
    });
  });

  describe('break from stream() for-await', () => {
    it('breaking from stream() for-await loop does not leak listeners', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-break-001');

      const session = await createSession({ transport });

      // First turn: break early after first message
      for await (const msg of session.stream('test')) {
        if (
          msg.type === 'working_state_changed' ||
          msg.type === 'assistant_text_delta'
        ) {
          break;
        }
      }

      // Session should still be usable for a second turn
      const result = await session.send('second turn');
      expect(result.text).toBe('Hello world');
      expect(result.messages.length).toBeGreaterThanOrEqual(3);

      // Verify two addUserMessage requests were sent
      const addMsgCalls = transport.sentMessages.filter(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_USER_MESSAGE
      );
      expect(addMsgCalls.length).toBe(2);

      await session.close();
    });
  });

  describe('multi-turn state isolation', () => {
    it('token usage from turn 1 does not leak into turn 2', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let turnCount = 0;

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
                sessionId: 'sess-token-iso',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          turnCount++;
          const currentTurn = turnCount;

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
                messageId: `msg-${currentTurn}`,
                blockIndex: 0,
                textDelta: `Turn ${currentTurn}`,
              })
            );

            transport.injectMessage(
              makeNotification(
                SessionNotificationType.SESSION_TOKEN_USAGE_CHANGED,
                {
                  sessionId: 'sess-token-iso',
                  tokenUsage: {
                    inputTokens: currentTurn * 100,
                    outputTokens: currentTurn === 1 ? 50 : 75,
                    cacheCreationTokens: 0,
                    cacheReadTokens: 0,
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

      const session = await createSession({ transport });

      // Turn 1
      const result1 = await session.send('first');
      expect(result1.tokenUsage).not.toBeNull();
      expect(result1.tokenUsage!.inputTokens).toBe(100);
      expect(result1.tokenUsage!.outputTokens).toBe(50);

      // Turn 2
      const result2 = await session.send('second');
      expect(result2.tokenUsage).not.toBeNull();
      expect(result2.tokenUsage!.inputTokens).toBe(200);
      expect(result2.tokenUsage!.outputTokens).toBe(75);

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

    it('rewind/compact/fork methods throw after close', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-post-close-rewind');

      const session = await createSession({ transport });
      await session.close();

      await expect(
        session.getRewindInfo({ messageId: 'msg-1' })
      ).rejects.toThrow(ConnectionError);
      await expect(
        session.executeRewind({
          messageId: 'msg-1',
          filesToRestore: [],
          filesToDelete: [],
          forkTitle: 'test',
        })
      ).rejects.toThrow(ConnectionError);
      await expect(session.compactSession()).rejects.toThrow(ConnectionError);
      await expect(session.forkSession()).rejects.toThrow(ConnectionError);
    });
  });

  // =========================================================================
  // #14 — Double interrupt is idempotent
  // =========================================================================
  describe('double interrupt', () => {
    it('calling interrupt() twice in rapid succession is safe', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-double-int');

      const session = await createSession({ transport });

      // Start a stream so the agent is in a non-idle state
      let streamComplete = false;
      const streamPromise = (async () => {
        for await (const msg of session.stream('test')) {
          if (msg.type === 'assistant_text_delta') {
            // Fire two interrupts in rapid succession
            await Promise.all([session.interrupt(), session.interrupt()]);
          }
        }
        streamComplete = true;
      })();

      await streamPromise;
      expect(streamComplete).toBe(true);

      await session.close();
    });
  });

  // =========================================================================
  // #15 — session.send() while session.stream() active
  // =========================================================================
  describe('concurrent send() and stream()', () => {
    it('concurrent stream() and send() both complete without error', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-concurrent-send');

      const session = await createSession({ transport });

      const msgsA: DroidMessage[] = [];

      const [, resultB] = await Promise.all([
        (async () => {
          for await (const msg of session.stream('A')) {
            msgsA.push(msg);
          }
        })(),
        session.send('B'),
      ]);

      // stream() completed with turn_complete
      expect(msgsA[msgsA.length - 1].type).toBe('turn_complete');

      // send() completed with text
      expect(resultB.text.length).toBeGreaterThan(0);
      expect(resultB.messages[resultB.messages.length - 1].type).toBe(
        'turn_complete'
      );

      await session.close();
    });
  });

  // =========================================================================
  // #16 — Error recovery between turns
  // =========================================================================
  describe('error recovery between turns', () => {
    it('session recovers after a protocol error on the first turn', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let addUserMessageCount = 0;

      setupFullResponder(transport, 'sess-recovery', {
        [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
          addUserMessageCount++;
          if (addUserMessageCount === 1) {
            // First call: respond with a protocol error
            queueMicrotask(() => {
              transport.injectMessage(
                makeErrorResponse(id, -32603, 'Internal server error')
              );
            });
          } else {
            // Second call: respond normally with streaming
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
                  messageId: 'msg-2',
                  blockIndex: 0,
                  textDelta: 'Recovered',
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
        },
      });

      const session = await createSession({ transport });

      // First send: protocol error
      await expect(async () => {
        for await (const _msg of session.stream('first')) {
          // should throw
        }
      }).rejects.toThrow();

      // Second send: should succeed — session recovered
      const result = await session.send('second');
      expect(result.text).toBe('Recovered');
      expect(result.messages.length).toBeGreaterThan(0);

      await session.close();
    });
  });

  // =========================================================================
  // #17 — stream() with images/files
  // =========================================================================
  describe('stream() with images/files', () => {
    it('passes images array in addUserMessage RPC params', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-images');

      const session = await createSession({ transport });

      for await (const _msg of session.stream('Look at this', {
        images: [{ type: 'base64', data: 'abc123', mediaType: 'image/png' }],
      })) {
        // consume
      }

      // Find the addUserMessage request
      const addMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_USER_MESSAGE
      ) as Record<string, unknown>;
      expect(addMsg).toBeDefined();

      const params = addMsg['params'] as Record<string, unknown>;
      expect(params['images']).toEqual([
        { type: 'base64', data: 'abc123', mediaType: 'image/png' },
      ]);

      await session.close();
    });
  });

  // =========================================================================
  // #18 — createSession() with all options
  // =========================================================================
  describe('createSession() with all options', () => {
    it('passes all session options to initializeSession RPC params', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-all-opts');

      const session = await createSession({
        transport,
        cwd: '/my/project',
        machineId: 'custom-machine',
        modelId: 'claude-test-model',
        reasoningEffort: ReasoningEffort.High,
        autonomyLevel: AutonomyLevel.High,
        interactionMode: DroidInteractionMode.Auto,
        mcpServers: [
          {
            name: 'test-mcp',
            type: McpServerType.Http,
            url: 'https://mcp.example.com',
            headers: [],
          },
        ],
        enabledToolIds: ['tool-x', 'tool-y'],
      });

      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INITIALIZE_SESSION
      ) as Record<string, unknown>;
      expect(initMsg).toBeDefined();

      const params = initMsg['params'] as Record<string, unknown>;
      expect(params['cwd']).toBe('/my/project');
      expect(params['machineId']).toBe('custom-machine');
      expect(params['modelId']).toBe('claude-test-model');
      expect(params['reasoningEffort']).toBe(ReasoningEffort.High);
      expect(params['autonomyLevel']).toBe(AutonomyLevel.High);
      expect(params['interactionMode']).toBe(DroidInteractionMode.Auto);
      expect(params['mcpServers']).toEqual([
        {
          name: 'test-mcp',
          type: McpServerType.Http,
          url: 'https://mcp.example.com',
          headers: [],
        },
      ]);
      expect(params['enabledToolIds']).toEqual(['tool-x', 'tool-y']);

      await session.close();
    });
  });

  // =========================================================================
  // #25 — Concurrent send() + updateSessionSettings()
  // =========================================================================
  describe('concurrent send() + updateSettings()', () => {
    it('both resolve without error when called concurrently', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-concurrent-settings');

      const session = await createSession({ transport });

      const [sendResult, settingsResult] = await Promise.all([
        session.send('test'),
        session.updateSettings({ modelId: 'new-model' }),
      ]);

      expect(sendResult.text).toBe('Hello world');
      expect(settingsResult).toBeDefined();

      // Verify both methods were called
      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)['method']
      );
      expect(sentMethods).toContain(DroidServerMethod.ADD_USER_MESSAGE);
      expect(sentMethods).toContain(DroidServerMethod.UPDATE_SESSION_SETTINGS);

      await session.close();
    });
  });
});
