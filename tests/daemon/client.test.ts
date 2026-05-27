import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DaemonClient } from '../../src/daemon/client.js';
import { ConnectionError, SessionError } from '../../src/errors.js';
import { ToolConfirmationOutcome } from '../../src/schemas/enums.js';
import {
  InMemoryTransport,
  makeErrorResponse,
  makeServerRequest,
  makeSuccessResponse,
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

async function initializeClient(
  transport: InMemoryTransport,
  client: DaemonClient,
  sessionId = 'test-session'
): Promise<void> {
  const initPromise = client.initializeSession({
    machineId: 'default',
    cwd: '.',
  });
  const sent = transport.sentMessages[transport.sentMessages.length - 1]!;
  transport.injectMessage(
    makeSuccessResponse(sent['id'] as string, initResponse(sessionId))
  );
  await initPromise;
}

describe('DaemonClient', () => {
  let transport: InMemoryTransport;
  let client: DaemonClient;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    client = new DaemonClient({ transport, token: 'test-token' });
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {
      // Already closed
    }
  });

  describe('constructor and getters', () => {
    it('starts with null sessionId', () => {
      expect(client.sessionId).toBeNull();
    });

    it('reports isConnected when transport is healthy', () => {
      expect(client.isConnected).toBe(true);
    });

    it('reports not connected after close', async () => {
      await client.close();
      expect(client.isConnected).toBe(false);
    });
  });

  describe('initializeSession', () => {
    it('sends daemon.initialize_session with token', async () => {
      await initializeClient(transport, client, 'sess-1');

      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.initialize_session'
      )!;
      expect(sent).toBeDefined();
      const params = sent['params'] as Record<string, unknown>;
      expect(params['token']).toBe('test-token');
      expect(params['machineId']).toBe('default');
      expect(params['cwd']).toBe('.');
    });

    it('sets sessionId from response', async () => {
      await initializeClient(transport, client, 'my-session-123');
      expect(client.sessionId).toBe('my-session-123');
    });

    it('throws when client is closed', async () => {
      await client.close();
      await expect(
        client.initializeSession({ machineId: 'x', cwd: '.' })
      ).rejects.toThrow(ConnectionError);
    });

    it('propagates protocol errors', async () => {
      const initPromise = client.initializeSession({
        machineId: 'default',
        cwd: '.',
      });
      const sent = transport.sentMessages[transport.sentMessages.length - 1]!;
      transport.injectMessage(
        makeErrorResponse(sent['id'] as string, -32600, 'Invalid request')
      );
      await expect(initPromise).rejects.toThrow();
    });
  });

  describe('loadSession', () => {
    it('sends daemon.load_session with token and sessionId', async () => {
      const loadPromise = client.loadSession({ sessionId: 'existing-sess' });
      const sent = transport.sentMessages[transport.sentMessages.length - 1]!;
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, loadResponse())
      );
      await loadPromise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['token']).toBe('test-token');
      expect(params['sessionId']).toBe('existing-sess');
      expect(sent['method']).toBe('daemon.load_session');
    });

    it('sets sessionId from params', async () => {
      const loadPromise = client.loadSession({
        sessionId: 'loaded-session-id',
      });
      const sent = transport.sentMessages[transport.sentMessages.length - 1]!;
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, loadResponse())
      );
      await loadPromise;
      expect(client.sessionId).toBe('loaded-session-id');
    });

    it('throws when client is closed', async () => {
      await client.close();
      await expect(client.loadSession({ sessionId: 'x' })).rejects.toThrow(
        ConnectionError
      );
    });
  });

  describe('addUserMessage', () => {
    it('sends daemon.add_user_message with sessionId and text', async () => {
      await initializeClient(transport, client, 'sess-1');

      const addPromise = client.addUserMessage({ text: 'Hello' });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_user_message'
      )!;
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { messageId: 'msg-1' })
      );
      await addPromise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-1');
      expect(params['text']).toBe('Hello');
    });

    it('passes optional images, files, outputFormat', async () => {
      await initializeClient(transport, client);

      const images = [
        {
          type: 'base64' as const,
          mediaType: 'image/png' as const,
          data: 'abc',
        },
      ];
      const addPromise = client.addUserMessage({
        text: 'Analyze',
        images,
        outputFormat: {
          type: 'json_schema' as const,
          schema: { type: 'object' },
        },
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_user_message'
      )!;
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { messageId: 'msg-2' })
      );
      await addPromise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['images']).toEqual(images);
      expect(params['outputFormat']).toBeDefined();
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.addUserMessage({ text: 'hello' })).rejects.toThrow(
        SessionError
      );
    });

    it('throws ConnectionError when client is closed', async () => {
      await initializeClient(transport, client);
      await client.close();
      await expect(client.addUserMessage({ text: 'hello' })).rejects.toThrow(
        ConnectionError
      );
    });
  });

  describe('interruptSession', () => {
    it('sends daemon.interrupt_session with sessionId', async () => {
      await initializeClient(transport, client, 'sess-int');

      const intPromise = client.interruptSession();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.interrupt_session'
      )!;
      transport.injectMessage(makeSuccessResponse(sent['id'] as string, {}));
      await intPromise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-int');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.interruptSession()).rejects.toThrow(SessionError);
    });
  });

  describe('closeSession', () => {
    it('sends daemon.close_session with sessionId', async () => {
      await initializeClient(transport, client, 'sess-close');

      const closePromise = client.closeSession({ reason: 'other' });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.close_session'
      )!;
      transport.injectMessage(makeSuccessResponse(sent['id'] as string, {}));
      await closePromise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-close');
      expect(params['reason']).toBe('other');
    });

    it('uses empty params by default', async () => {
      await initializeClient(transport, client, 'sess-close2');

      const closePromise = client.closeSession();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.close_session'
      )!;
      transport.injectMessage(makeSuccessResponse(sent['id'] as string, {}));
      await closePromise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-close2');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.closeSession()).rejects.toThrow(SessionError);
    });
  });

  describe('onNotification', () => {
    it('returns an unsubscribe function', () => {
      const unsub = client.onNotification(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('fires callback for notifications', async () => {
      await initializeClient(transport, client);
      const notifications: unknown[] = [];
      client.onNotification((n) => notifications.push(n));

      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'notification',
        method: 'daemon.session_notification',
        params: {
          notification: {
            type: 'droid_working_state_changed',
            newState: 'idle',
          },
        },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(notifications.length).toBeGreaterThan(0);
    });

    it('stops firing after unsubscribe', async () => {
      await initializeClient(transport, client);
      const notifications: unknown[] = [];
      const unsub = client.onNotification((n) => notifications.push(n));
      unsub();

      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'notification',
        method: 'daemon.session_notification',
        params: {
          notification: { type: 'error', message: 'test' },
        },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(notifications).toHaveLength(0);
    });

    it('supports multiple listeners', async () => {
      await initializeClient(transport, client);
      const a: unknown[] = [];
      const b: unknown[] = [];
      client.onNotification((n) => a.push(n));
      client.onNotification((n) => b.push(n));

      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'notification',
        method: 'daemon.session_notification',
        params: {
          notification: {
            type: 'droid_working_state_changed',
            newState: 'idle',
          },
        },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(a.length).toBeGreaterThan(0);
      expect(b.length).toBeGreaterThan(0);
    });

    it('idempotent unsubscribe is safe', () => {
      const unsub = client.onNotification(() => {});
      unsub();
      unsub(); // Should not throw
    });
  });

  describe('permission handler', () => {
    it('returns Cancel when no handler set', async () => {
      await initializeClient(transport, client, 'perm-sess');

      const permRequest = makeServerRequest(
        'perm-1',
        'daemon.request_permission',
        {
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
          options: [
            { label: 'Yes', value: 'proceed_once' },
            { label: 'No', value: 'cancel' },
          ],
        }
      );
      transport.injectMessage(permRequest);

      await new Promise((r) => setTimeout(r, 50));

      const response = transport.sentMessages.find(
        (m) => m['id'] === 'perm-1' && m['type'] === 'response'
      );
      expect(response).toBeDefined();
      const result = response!['result'] as Record<string, unknown>;
      expect(result['selectedOption']).toBe(ToolConfirmationOutcome.Cancel);
    });

    it('delegates to registered handler', async () => {
      await initializeClient(transport, client, 'perm-sess');

      client.setPermissionHandler(() => ToolConfirmationOutcome.ProceedOnce);

      const permRequest = makeServerRequest(
        'perm-2',
        'daemon.request_permission',
        {
          toolUses: [
            {
              toolUse: {
                type: 'tool_use',
                id: 'tu-2',
                name: 'Create',
                input: {},
              },
              confirmationType: 'create',
              details: {
                type: 'create',
                filePath: '/a.txt',
                fileName: 'a.txt',
                content: '',
              },
            },
          ],
          options: [
            { label: 'Yes', value: 'proceed_once' },
            { label: 'No', value: 'cancel' },
          ],
        }
      );
      transport.injectMessage(permRequest);

      await new Promise((r) => setTimeout(r, 50));

      const response = transport.sentMessages.find(
        (m) => m['id'] === 'perm-2' && m['type'] === 'response'
      );
      expect(response).toBeDefined();
      const result = response!['result'] as Record<string, unknown>;
      expect(result['selectedOption']).toBe(
        ToolConfirmationOutcome.ProceedOnce
      );
    });

    it('supports async permission handler', async () => {
      await initializeClient(transport, client, 'perm-sess');

      client.setPermissionHandler(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return ToolConfirmationOutcome.ProceedOnce;
      });

      const permRequest = makeServerRequest(
        'perm-3',
        'daemon.request_permission',
        {
          toolUses: [
            {
              toolUse: {
                type: 'tool_use',
                id: 'tu-3',
                name: 'Edit',
                input: {},
              },
              confirmationType: 'edit',
              details: { type: 'edit', filePath: '/b.txt', fileName: 'b.txt' },
            },
          ],
          options: [],
        }
      );
      transport.injectMessage(permRequest);

      await new Promise((r) => setTimeout(r, 100));

      const response = transport.sentMessages.find(
        (m) => m['id'] === 'perm-3' && m['type'] === 'response'
      );
      expect(response).toBeDefined();
    });
  });

  describe('ask-user handler', () => {
    it('returns cancelled when no handler set', async () => {
      await initializeClient(transport, client, 'ask-sess');

      const askRequest = makeServerRequest('ask-1', 'daemon.ask_user', {
        sessionId: 'ask-sess',
        toolCallId: 'tc-1',
        questions: [
          {
            index: 0,
            topic: 'Feature',
            question: 'Which one?',
            options: ['A', 'B'],
          },
        ],
      });
      transport.injectMessage(askRequest);

      await new Promise((r) => setTimeout(r, 50));

      const response = transport.sentMessages.find(
        (m) => m['id'] === 'ask-1' && m['type'] === 'response'
      );
      expect(response).toBeDefined();
      const result = response!['result'] as Record<string, unknown>;
      expect(result['cancelled']).toBe(true);
      expect(result['answers']).toEqual([]);
    });

    it('delegates to registered handler', async () => {
      await initializeClient(transport, client, 'ask-sess');

      client.setAskUserHandler((params) => ({
        cancelled: false,
        answers: params.questions.map((q) => ({
          index: q.index,
          question: q.question,
          answer: q.options[0] ?? 'default',
        })),
      }));

      const askRequest = makeServerRequest('ask-2', 'daemon.ask_user', {
        sessionId: 'ask-sess',
        toolCallId: 'tc-2',
        questions: [
          { index: 0, topic: 'Choice', question: 'Pick?', options: ['X', 'Y'] },
        ],
      });
      transport.injectMessage(askRequest);

      await new Promise((r) => setTimeout(r, 50));

      const response = transport.sentMessages.find(
        (m) => m['id'] === 'ask-2' && m['type'] === 'response'
      );
      expect(response).toBeDefined();
      const result = response!['result'] as Record<string, unknown>;
      expect(result['cancelled']).toBe(false);
      const answers = result['answers'] as Array<Record<string, unknown>>;
      expect(answers[0]!['answer']).toBe('X');
    });
  });

  describe('close()', () => {
    it('is idempotent', async () => {
      await client.close();
      await client.close(); // Should not throw
    });

    it('clears notification listeners', async () => {
      const notifications: unknown[] = [];
      client.onNotification((n) => notifications.push(n));
      await client.close();

      // Notifications after close should not fire
      try {
        transport.injectMessage({
          jsonrpc: '2.0',
          type: 'notification',
          method: 'daemon.session_notification',
          params: { notification: { type: 'error', message: 'late' } },
        });
      } catch {
        // Transport may be closed
      }
      await new Promise((r) => setTimeout(r, 10));
      expect(notifications).toHaveLength(0);
    });

    it('makes all subsequent RPC calls throw', async () => {
      await initializeClient(transport, client);
      await client.close();

      await expect(client.addUserMessage({ text: 'hi' })).rejects.toThrow(
        ConnectionError
      );
      await expect(client.interruptSession()).rejects.toThrow(ConnectionError);
      await expect(client.closeSession()).rejects.toThrow(ConnectionError);
      await expect(
        client.initializeSession({ machineId: 'x', cwd: '.' })
      ).rejects.toThrow(ConnectionError);
      await expect(client.loadSession({ sessionId: 'x' })).rejects.toThrow(
        ConnectionError
      );
    });
  });
});
