/**
 * Unit tests for createSession(), resumeSession(), and DroidSession.
 *
 * Uses InMemoryTransport to simulate the session lifecycle.
 */

import { describe, expect, it } from 'vitest';

import { SDK_TAG } from '../src/constants.js';
import { ConnectionError, SessionNotFoundError } from '../src/errors.js';
import {
  AutonomyLevel,
  ContextStatsAccuracy,
  DroidInteractionMode,
  DroidServerMethod,
  DroidWorkingState,
  JsonRpcErrorCode,
  McpServerType,
  OutputFormatType,
  ReasoningEffort,
  SessionNotificationType,
  SettingsLevel,
} from '../src/schemas/index.js';
import { createSession, resumeSession, DroidSession } from '../src/session.js';
import type { DroidMessage } from '../src/stream.js';
import {
  InMemoryTransport,
  collectStreamText,
  findLastResult,
  makeErrorResponse,
  makeSessionNotification,
  makeSuccessResponse,
  sendDefaultStreamSequence,
  wireTransportSend,
} from './helpers.js';

/**
 * Set up transport to auto-respond to initializeSession.
 * Returns transport ready for use.
 */
function setupInitResponder(
  transport: InMemoryTransport,
  sessionId: string
): void {
  wireTransportSend(transport, ({ method, id }) => {
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
  });
}

async function expectStreamToThrow(
  session: DroidSession,
  prompt: string
): Promise<void> {
  await expect(async () => {
    for await (const _msg of session.stream(prompt)) {
      void _msg;
    }
  }).rejects.toThrow(ConnectionError);
}

/**
 * Set up transport to auto-respond to loadSession.
 */
function setupLoadResponder(
  transport: InMemoryTransport,
  sessionId: string
): void {
  wireTransportSend(transport, ({ method, id }) => {
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
  });
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
  wireTransportSend(transport, ({ method, id }) => {
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
        sendDefaultStreamSequence(transport, {
          deltas: ['Hello world'],
          tokenUsageSessionId: sessionId,
        });
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
      method === DroidServerMethod.LIST_TOOLS ||
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
        } else if (method === DroidServerMethod.LIST_TOOLS) {
          transport.injectMessage(makeSuccessResponse(id, { tools: [] }));
        } else if (method === DroidServerMethod.LIST_SKILLS) {
          transport.injectMessage(makeSuccessResponse(id, { skills: [] }));
        } else {
          transport.injectMessage(makeSuccessResponse(id, { success: true }));
        }
      });
    }
  });
}

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

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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

      expect(transport.isConnected).toBe(false);
    });
  });
});

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

      const originalSend = transport.send.bind(transport);
      transport.send = (message: Record<string, unknown>) => {
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

      expect(transport.isConnected).toBe(false);
    });
  });
});

describe('DroidSession', () => {
  describe('stream() API (VAL-API-004)', () => {
    it('streams DroidMessage until Result', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-stream-001');

      const session = await createSession({ transport });

      const messages: DroidMessage[] = [];
      for await (const msg of session.stream('Hello')) {
        messages.push(msg);
      }

      expect(messages.length).toBeGreaterThanOrEqual(2);

      const results = messages.filter(
        (m) => m.type === 'result' && m.result.length > 0
      );
      expect(results.length).toBeGreaterThanOrEqual(1);

      expect(messages[messages.length - 1].type).toBe('result');

      await session.close();
    });

    it('defaults to message-level events and opts into partial events', async () => {
      const createStreamingSession = async (
        sessionId: string
      ): Promise<DroidSession> => {
        const transport = new InMemoryTransport();
        await transport.connect();

        wireTransportSend(transport, ({ method, id }) => {
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
                  availableModels: [],
                })
              );
            });
          } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
            queueMicrotask(() => {
              transport.injectMessage(makeSuccessResponse(id, {}));
              sendDefaultStreamSequence(transport);
            });
          }
        });

        return createSession({ transport });
      };

      const defaultSession = await createStreamingSession('sess-default');
      const partialSession = await createStreamingSession('sess-partial');

      try {
        const defaultMessages: DroidMessage[] = [];
        for await (const msg of defaultSession.stream('Hello')) {
          defaultMessages.push(msg);
        }

        const partialMessages: DroidMessage[] = [];
        for await (const msg of partialSession.stream('Hello', {
          includePartialMessages: true,
        })) {
          partialMessages.push(msg);
        }

        expect(defaultMessages.map((message) => message.type)).toEqual([
          'assistant',
          'result',
        ]);
        expect(defaultMessages).not.toContainEqual(
          expect.objectContaining({ type: 'assistant_text_delta' })
        );
        expect(defaultMessages).not.toContainEqual(
          expect.objectContaining({ type: 'working_state_changed' })
        );

        expect(partialMessages).toContainEqual(
          expect.objectContaining({ type: 'assistant_text_delta' })
        );
        expect(partialMessages).toContainEqual(
          expect.objectContaining({ type: 'working_state_changed' })
        );
        expect(partialMessages[partialMessages.length - 1].type).toBe('result');
      } finally {
        await defaultSession.close();
        await partialSession.close();
      }
    });

    it('streams backend structured output notifications', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      wireTransportSend(transport, ({ method, id }) => {
        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-structured-notification',
                session: {},
                settings: { modelId: 'test-model', reasoningEffort: 'medium' },
                availableModels: [],
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
            sendDefaultStreamSequence(transport, {
              deltas: [],
              includeTokenUsage: false,
              structuredOutputMessageId: 'msg-structured',
              structuredOutput: { name: 'Ada' },
            });
          });
        }
      });

      const session = await createSession({ transport });
      const messages: DroidMessage[] = [];
      for await (const msg of session.stream('Return a person', {
        outputFormat: {
          type: OutputFormatType.JsonSchema,
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      })) {
        messages.push(msg);
      }

      expect(messages[messages.length - 1]).toMatchObject({
        type: 'result',
        structuredOutput: { name: 'Ada' },
        structuredOutputError: null,
      });

      await session.close();
    });

    it('streams backend structured output errors', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      wireTransportSend(transport, ({ method, id }) => {
        if (method === DroidServerMethod.INITIALIZE_SESSION) {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                sessionId: 'sess-structured-error',
                session: {},
                settings: { modelId: 'test-model', reasoningEffort: 'medium' },
                availableModels: [],
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
            sendDefaultStreamSequence(transport, {
              deltas: [],
              includeTokenUsage: false,
              structuredOutputMessageId: 'msg-structured',
              structuredOutputError: {
                code: 'schema_validation_failed',
                message: '/name must be string',
              },
            });
          });
        }
      });

      const session = await createSession({ transport });
      const messages: DroidMessage[] = [];
      for await (const msg of session.stream('Return a person', {
        outputFormat: {
          type: OutputFormatType.JsonSchema,
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
          },
        },
      })) {
        messages.push(msg);
      }

      expect(messages[messages.length - 1]).toMatchObject({
        type: 'result',
        structuredOutput: null,
        structuredOutputError: {
          code: 'schema_validation_failed',
          message: '/name must be string',
        },
      });

      await session.close();
    });

    it('supports multiple stream calls (multi-turn)', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-stream-multi');

      const session = await createSession({ transport });

      const msgs1: DroidMessage[] = [];
      for await (const msg of session.stream('First message')) {
        msgs1.push(msg);
      }
      expect(msgs1[msgs1.length - 1].type).toBe('result');

      const msgs2: DroidMessage[] = [];
      for await (const msg of session.stream('Second message')) {
        msgs2.push(msg);
      }
      expect(msgs2[msgs2.length - 1].type).toBe('result');

      const addMsgCalls = transport.sentMessages.filter(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.ADD_USER_MESSAGE
      );
      expect(addMsgCalls.length).toBe(2);

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

      expect(transport.isConnected).toBe(false);

      await expectStreamToThrow(session, 'test');
    });

    it('is idempotent — safe to call multiple times', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-close-idempotent');

      const session = await createSession({ transport });

      await session.close();
      await session.close();
      await session.close();
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

    it('delegates listTools to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-tools-001');

      const session = await createSession({ transport });

      const result = await session.listTools({ disabledToolIds: ['Execute'] });

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
      await expect(session.listTools()).rejects.toThrow(ConnectionError);
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

    it('enterSpecMode() delegates spec settings to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-settings-spec-001');

      const session = await createSession({ transport });

      const result = await session.enterSpecMode({
        specModeModelId: 'claude-spec',
        specModeReasoningEffort: ReasoningEffort.High,
      });

      expect(result).toBeDefined();

      const settingsMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.UPDATE_SESSION_SETTINGS
      );
      expect(settingsMsg).toBeDefined();

      const params = (settingsMsg as Record<string, unknown>)[
        'params'
      ] as Record<string, unknown>;
      expect(params['interactionMode']).toBe(DroidInteractionMode.Spec);
      expect(params['specModeModelId']).toBe('claude-spec');
      expect(params['specModeReasoningEffort']).toBe(ReasoningEffort.High);

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

  describe('renameSession()', () => {
    it('delegates renameSession to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-rename-001', {
        [DroidServerMethod.RENAME_SESSION]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                success: true,
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.renameSession({ title: 'My New Title' });

      expect(result.success).toBe(true);

      await session.close();
    });
  });

  describe('getContextStats()', () => {
    it('delegates getContextStats to client', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-context-001', {
        [DroidServerMethod.GET_CONTEXT_STATS]: (id) => {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, {
                used: 25,
                remaining: 75,
                limit: 100,
                accuracy: ContextStatsAccuracy.Estimated,
                updatedAt: '2026-04-20T00:00:00.000Z',
              })
            );
          });
        },
      });

      const session = await createSession({ transport });

      const result = await session.getContextStats();

      expect(result.used).toBe(25);
      expect(result.remaining).toBe(75);
      expect(result.limit).toBe(100);

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

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.SESSION_TITLE_UPDATED, {
          title: 'New Title',
        })
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(notifications.length).toBe(1);

      unsub();

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.SESSION_TITLE_UPDATED, {
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
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: 'msg-1',
                  blockIndex: 0,
                  textDelta: 'Hello',
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          });
        }
      };

      const session = await createSession({ transport });

      const messages: DroidMessage[] = [];
      for await (const msg of session.stream('test', {
        includePartialMessages: true,
      })) {
        messages.push(msg);
        if (msg.type === 'assistant_text_delta') {
          await session.close();
        }
      }

      expect(messages[messages.length - 1].type).toBe('result');
      expect(transport.isConnected).toBe(false);

      await expectStreamToThrow(session, 'test');
    });
  });

  describe('transport errors during stream', () => {
    it('transport error before addUserMessage response rejects stream', async () => {
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
                sessionId: 'sess-transport-err',
                session: {},
                settings: { modelId: 'test', reasoningEffort: 'medium' },
              })
            );
          });
        } else if (method === DroidServerMethod.ADD_USER_MESSAGE) {
          setTimeout(() => {
            transport.injectError(new Error('process crashed'));
          }, 10);
        }
      };

      const session = await createSession({ transport });

      await expect(async () => {
        for await (const _msg of session.stream('test')) {
          void _msg;
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

      for await (const msg of session.stream('test', {
        includePartialMessages: true,
      })) {
        if (
          msg.type === 'working_state_changed' ||
          msg.type === 'assistant_text_delta'
        ) {
          break;
        }
      }

      const result = await collectStreamText(session, 'second turn');
      expect(result.text).toBe('Hello world');
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

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
      transport.send = (message: Record<string, unknown>) => {
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
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.StreamingAssistantMessage }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
                SessionNotificationType.ASSISTANT_TEXT_DELTA,
                {
                  messageId: `msg-${currentTurn}`,
                  blockIndex: 0,
                  textDelta: `Turn ${currentTurn}`,
                }
              )
            );

            transport.injectMessage(
              makeSessionNotification(
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
              makeSessionNotification(
                SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                { newState: DroidWorkingState.Idle }
              )
            );
          });
        }
      };

      const session = await createSession({ transport });

      const result1: DroidMessage[] = [];
      for await (const msg of session.stream('first')) {
        result1.push(msg);
      }
      const turn1 = findLastResult(result1);
      expect(turn1?.type).toBe('result');
      if (turn1?.type === 'result') {
        expect(turn1.tokenUsage).not.toBeNull();
        expect(turn1.tokenUsage!.inputTokens).toBe(100);
        expect(turn1.tokenUsage!.outputTokens).toBe(50);
      }

      const result2: DroidMessage[] = [];
      for await (const msg of session.stream('second')) {
        result2.push(msg);
      }
      const turn2 = findLastResult(result2);
      expect(turn2?.type).toBe('result');
      if (turn2?.type === 'result') {
        expect(turn2.tokenUsage).not.toBeNull();
        expect(turn2.tokenUsage!.inputTokens).toBe(200);
        expect(turn2.tokenUsage!.outputTokens).toBe(75);
      }

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
          void _msg;
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
      await expect(session.renameSession({ title: 'test' })).rejects.toThrow(
        ConnectionError
      );
    });
  });

  describe('double interrupt', () => {
    it('calling interrupt() twice in rapid succession is safe', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-double-int');

      const session = await createSession({ transport });

      let streamComplete = false;
      const streamPromise = (async () => {
        for await (const msg of session.stream('test', {
          includePartialMessages: true,
        })) {
          if (msg.type === 'assistant_text_delta') {
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

  describe('error recovery between turns', () => {
    it('session recovers after a protocol error on the first turn', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      let addUserMessageCount = 0;

      setupFullResponder(transport, 'sess-recovery', {
        [DroidServerMethod.ADD_USER_MESSAGE]: (id) => {
          addUserMessageCount++;
          if (addUserMessageCount === 1) {
            queueMicrotask(() => {
              transport.injectMessage(
                makeErrorResponse(id, -32603, 'Internal server error')
              );
            });
          } else {
            queueMicrotask(() => {
              transport.injectMessage(makeSuccessResponse(id, {}));

              transport.injectMessage(
                makeSessionNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.StreamingAssistantMessage }
                )
              );

              transport.injectMessage(
                makeSessionNotification(
                  SessionNotificationType.ASSISTANT_TEXT_DELTA,
                  {
                    messageId: 'msg-2',
                    blockIndex: 0,
                    textDelta: 'Recovered',
                  }
                )
              );

              transport.injectMessage(
                makeSessionNotification(
                  SessionNotificationType.DROID_WORKING_STATE_CHANGED,
                  { newState: DroidWorkingState.Idle }
                )
              );
            });
          }
        },
      });

      const session = await createSession({ transport });

      await expect(async () => {
        for await (const _msg of session.stream('first')) {
          void _msg;
        }
      }).rejects.toThrow();

      const result = await collectStreamText(session, 'second');
      expect(result.text).toBe('Recovered');
      expect(result.messages.length).toBeGreaterThan(0);

      await session.close();
    });
  });

  describe('stream() with images/files', () => {
    it('passes images array in addUserMessage RPC params', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-images');

      const session = await createSession({ transport });

      for await (const _msg of session.stream('Look at this', {
        images: [{ type: 'base64', data: 'abc123', mediaType: 'image/png' }],
      })) {
        void _msg;
      }

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
        interactionMode: DroidInteractionMode.Spec,
        specModeModelId: 'claude-spec-model',
        specModeReasoningEffort: ReasoningEffort.Max,
        mcpServers: [
          {
            name: 'test-mcp',
            type: McpServerType.Http,
            url: 'https://mcp.example.com',
            headers: [],
          },
        ],
        enabledToolIds: ['tool-x', 'tool-y'],
        disabledToolIds: ['Execute'],
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
      expect(params['interactionMode']).toBe(DroidInteractionMode.Spec);
      expect(params['specModeModelId']).toBe('claude-spec-model');
      expect(params['specModeReasoningEffort']).toBe(ReasoningEffort.Max);
      expect(params['mcpServers']).toEqual([
        {
          name: 'test-mcp',
          type: McpServerType.Http,
          url: 'https://mcp.example.com',
          headers: [],
        },
      ]);
      expect(params['enabledToolIds']).toEqual(['tool-x', 'tool-y']);
      expect(params['disabledToolIds']).toEqual(['Execute']);

      await session.close();
    });
  });

  describe('SDK_TAG auto-injection', () => {
    it('injects SDK_TAG when no user tags are provided', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-sdk-tag-default');

      const session = await createSession({ transport, cwd: '/tmp' });

      const initMsg = transport.sentMessages.find(
        (m) =>
          (m as Record<string, unknown>)['method'] ===
          DroidServerMethod.INITIALIZE_SESSION
      ) as Record<string, unknown>;

      const params = initMsg['params'] as Record<string, unknown>;
      expect(params['tags']).toEqual([SDK_TAG]);

      await session.close();
    });

    it('merges user tags with SDK_TAG', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-sdk-tag-merge');

      const session = await createSession({
        transport,
        cwd: '/tmp',
        tags: [{ name: 'custom', metadata: { env: 'test' } }],
      });

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

      await session.close();
    });
  });

  describe('abortSignal', () => {
    it('closes session when signal fires', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-abort-signal');

      const controller = new AbortController();

      const session = await createSession({
        transport,
        abortSignal: controller.signal,
      });

      expect(session.sessionId).toBe('sess-abort-signal');

      controller.abort();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transport.isConnected).toBe(false);
      await expectStreamToThrow(session, 'test');
    });

    it('closes session immediately when signal is already aborted', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupInitResponder(transport, 'sess-pre-aborted');

      const controller = new AbortController();
      controller.abort();

      const session = await createSession({
        transport,
        abortSignal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transport.isConnected).toBe(false);
      await expectStreamToThrow(session, 'test');
    });
  });

  describe('resumeSession abortSignal', () => {
    it('closes resumed session when signal fires', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupLoadResponder(transport, 'sess-resume-abort');

      const controller = new AbortController();

      const session = await resumeSession('sess-resume-abort', {
        transport,
        abortSignal: controller.signal,
      });

      expect(session.sessionId).toBe('sess-resume-abort');

      controller.abort();

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transport.isConnected).toBe(false);
      await expectStreamToThrow(session, 'test');
    });

    it('closes resumed session immediately when signal is already aborted', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupLoadResponder(transport, 'sess-resume-pre-aborted');

      const controller = new AbortController();
      controller.abort();

      const session = await resumeSession('sess-resume-pre-aborted', {
        transport,
        abortSignal: controller.signal,
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(transport.isConnected).toBe(false);
      await expectStreamToThrow(session, 'test');
    });
  });

  describe('concurrent stream() + updateSettings()', () => {
    it('both resolve without error when called concurrently', async () => {
      const transport = new InMemoryTransport();
      await transport.connect();

      setupFullResponder(transport, 'sess-concurrent-settings');

      const session = await createSession({ transport });

      const [streamResult, settingsResult] = await Promise.all([
        collectStreamText(session, 'test'),
        session.updateSettings({ modelId: 'new-model' }),
      ]);

      expect(streamResult.text).toBe('Hello world');
      expect(settingsResult).toBeDefined();

      const sentMethods = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)['method']
      );
      expect(sentMethods).toContain(DroidServerMethod.ADD_USER_MESSAGE);
      expect(sentMethods).toContain(DroidServerMethod.UPDATE_SESSION_SETTINGS);

      await session.close();
    });
  });
});
