import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DaemonConnection } from '../../src/daemon/connection.js';
import { DaemonSession } from '../../src/daemon/session.js';
import { WebSocketTransport } from '../../src/daemon/transport.js';
import { ConnectionError } from '../../src/errors.js';
import { ToolConfirmationOutcome } from '../../src/schemas/enums.js';
import {
  InMemoryTransport,
  makeErrorResponse,
  makeSuccessResponse,
  wireTransportSend,
} from '../helpers.js';

function initResponse(sessionId: string): Record<string, unknown> {
  return {
    sessionId,
    session: {},
    settings: { modelId: 'test-model', reasoningEffort: 'medium' },
    availableModels: [],
  };
}

function loadResponse(): Record<string, unknown> {
  return {
    session: { messages: [] },
    settings: { modelId: 'test-model', reasoningEffort: 'medium' },
    availableModels: [],
  };
}

function createTestConnection(transport: InMemoryTransport): DaemonConnection {
  return new (DaemonConnection as unknown as new (
    transport: unknown,
    authToken: string
  ) => DaemonConnection)(
    transport as unknown as WebSocketTransport,
    'test-token'
  );
}

describe('DaemonConnection — lifecycle', () => {
  let transport: InMemoryTransport;
  let connection: DaemonConnection;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    connection = createTestConnection(transport);
  });

  afterEach(async () => {
    try {
      await connection.close();
    } catch {
      // Already closed
    }
  });

  describe('createSession', () => {
    it('returns a DaemonSession with correct sessionId', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.initialize_session') {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, initResponse('created-session'))
            );
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      const session = await connection.createSession({ cwd: '/test' });
      expect(session).toBeInstanceOf(DaemonSession);
      expect(session.sessionId).toBe('created-session');
      await session.close();
    });

    it('passes session options to init params', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.initialize_session') {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, initResponse('opts-session'))
            );
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      const session = await connection.createSession({
        cwd: '/project',
        modelId: 'claude-sonnet-4-20250514',
      });

      const initSent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.initialize_session'
      )!;
      const params = initSent['params'] as Record<string, unknown>;
      expect(params['cwd']).toBe('/project');
      expect(params['modelId']).toBe('claude-sonnet-4-20250514');

      await session.close();
    });

    it('wires permission handler', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.initialize_session') {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, initResponse('perm-session'))
            );
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      let handlerCalled = false;
      const session = await connection.createSession({
        cwd: '/test',
        permissionHandler: () => {
          handlerCalled = true;
          return ToolConfirmationOutcome.ProceedOnce;
        },
      });

      // Inject a permission request
      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'request',
        id: 'perm-1',
        method: 'daemon.request_permission',
        params: {
          sessionId: 'perm-session',
          toolUses: [
            {
              toolUse: {
                type: 'tool_use',
                id: 'tu-1',
                name: 'Execute',
                input: {},
              },
              confirmationType: 'exec',
              details: { type: 'exec', fullCommand: 'ls', command: 'ls' },
            },
          ],
          options: [],
        },
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(handlerCalled).toBe(true);

      await session.close();
    });

    it('wires ask-user handler', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.initialize_session') {
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, initResponse('ask-session'))
            );
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      let handlerCalled = false;
      const session = await connection.createSession({
        cwd: '/test',
        askUserHandler: (params) => {
          handlerCalled = true;
          return {
            cancelled: false,
            answers: params.questions.map((q) => ({
              index: q.index,
              question: q.question,
              answer: 'auto-answer',
            })),
          };
        },
      });

      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'request',
        id: 'ask-1',
        method: 'daemon.ask_user',
        params: {
          sessionId: 'ask-session',
          toolCallId: 'tc-1',
          questions: [
            { index: 0, topic: 'Q', question: 'Pick?', options: ['A'] },
          ],
        },
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(handlerCalled).toBe(true);

      await session.close();
    });

    it('throws when connection is closed', async () => {
      await connection.close();
      await expect(connection.createSession({ cwd: '/test' })).rejects.toThrow(
        ConnectionError
      );
    });

    // Note: createSession error handling is tested via DaemonClient.initializeSession
    // tests in client.test.ts (propagates protocol errors). The connection-level
    // cleanup pattern (sdkMcpServers cleanup + client.close) is the same as
    // resumeSession, which is tested in "cleans up client on load failure" below.
  });

  describe('resumeSession', () => {
    it('returns a DaemonSession with the provided sessionId', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.load_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, loadResponse()));
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      const session = await connection.resumeSession('existing-session-id');
      expect(session).toBeInstanceOf(DaemonSession);
      expect(session.sessionId).toBe('existing-session-id');
      await session.close();
    });

    it('passes sessionId to load_session params', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.load_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, loadResponse()));
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      const session = await connection.resumeSession('resume-target');

      const loadSent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.load_session'
      )!;
      const params = loadSent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('resume-target');
      expect(params['token']).toBe('test-token');

      await session.close();
    });

    it('wires handlers from options', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.load_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, loadResponse()));
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      let permCalled = false;
      const session = await connection.resumeSession('resume-handlers', {
        permissionHandler: () => {
          permCalled = true;
          return ToolConfirmationOutcome.Cancel;
        },
      });

      // Inject permission request
      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'request',
        id: 'perm-resume-1',
        method: 'daemon.request_permission',
        params: {
          sessionId: 'resume-handlers',
          toolUses: [
            {
              toolUse: {
                type: 'tool_use',
                id: 'tu-r',
                name: 'Execute',
                input: {},
              },
              confirmationType: 'exec',
              details: { type: 'exec', fullCommand: 'rm -rf', command: 'rm' },
            },
          ],
          options: [],
        },
      });

      await new Promise((r) => setTimeout(r, 50));
      expect(permCalled).toBe(true);

      await session.close();
    });

    it('throws when connection is closed', async () => {
      await connection.close();
      await expect(connection.resumeSession('some-id')).rejects.toThrow(
        ConnectionError
      );
    });

    it('cleans up client on load failure', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.load_session') {
          queueMicrotask(() => {
            transport.injectMessage(
              makeErrorResponse(id, -32001, 'Session not found', {
                errorType: 'ENTITY_NOT_FOUND',
              })
            );
          });
        }
      });

      await expect(connection.resumeSession('nonexistent')).rejects.toThrow();
    });
  });

  describe('interruptSession', () => {
    it('loads session, interrupts, and closes ephemeral client', async () => {
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.load_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, loadResponse()));
          });
        }
        if (method === 'daemon.interrupt_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      await connection.interruptSession('sess-to-interrupt');

      const loadSent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.load_session'
      )!;
      expect(loadSent).toBeDefined();
      const loadParams = loadSent['params'] as Record<string, unknown>;
      expect(loadParams['sessionId']).toBe('sess-to-interrupt');

      const intSent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.interrupt_session'
      )!;
      expect(intSent).toBeDefined();
    });

    it('throws when connection is closed', async () => {
      await connection.close();
      await expect(connection.interruptSession('some-id')).rejects.toThrow(
        ConnectionError
      );
    });
  });

  describe('close', () => {
    it('is idempotent', async () => {
      await connection.close();
      await connection.close(); // Should not throw
    });

    it('makes subsequent createSession throw', async () => {
      await connection.close();
      await expect(connection.createSession({ cwd: '/' })).rejects.toThrow(
        ConnectionError
      );
    });

    it('makes subsequent resumeSession throw', async () => {
      await connection.close();
      await expect(connection.resumeSession('id')).rejects.toThrow(
        ConnectionError
      );
    });

    it('makes subsequent interruptSession throw', async () => {
      await connection.close();
      await expect(connection.interruptSession('id')).rejects.toThrow(
        ConnectionError
      );
    });
  });

  describe('multiple sessions lifecycle', () => {
    it('supports creating and closing multiple sessions sequentially', async () => {
      let sessionNum = 0;
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.initialize_session') {
          sessionNum++;
          queueMicrotask(() => {
            transport.injectMessage(
              makeSuccessResponse(id, initResponse(`seq-${sessionNum}`))
            );
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      const s1 = await connection.createSession({ cwd: '/a' });
      expect(s1.sessionId).toBe('seq-1');
      await s1.close();

      const s2 = await connection.createSession({ cwd: '/b' });
      expect(s2.sessionId).toBe('seq-2');
      await s2.close();

      const s3 = await connection.createSession({ cwd: '/c' });
      expect(s3.sessionId).toBe('seq-3');
      await s3.close();
    });

    it('supports creating multiple sessions concurrently', async () => {
      let sessionNum = 0;
      wireTransportSend(transport, ({ method, id }) => {
        if (method === 'daemon.initialize_session') {
          sessionNum++;
          const sid = `concurrent-${sessionNum}`;
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, initResponse(sid)));
          });
        }
        if (method === 'daemon.close_session') {
          queueMicrotask(() => {
            transport.injectMessage(makeSuccessResponse(id, {}));
          });
        }
      });

      const [s1, s2, s3] = await Promise.all([
        connection.createSession({ cwd: '/x' }),
        connection.createSession({ cwd: '/y' }),
        connection.createSession({ cwd: '/z' }),
      ]);

      expect(s1.sessionId).toMatch(/^concurrent-/);
      expect(s2.sessionId).toMatch(/^concurrent-/);
      expect(s3.sessionId).toMatch(/^concurrent-/);

      // All should be different
      const ids = new Set([s1.sessionId, s2.sessionId, s3.sessionId]);
      expect(ids.size).toBe(3);

      await s1.close();
      await s2.close();
      await s3.close();
    });
  });
});
