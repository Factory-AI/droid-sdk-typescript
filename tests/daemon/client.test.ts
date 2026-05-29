import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DaemonClient } from '../../src/daemon/client.js';
import { ConnectionError, SessionError } from '../../src/errors.js';
import {
  AutonomyLevel,
  McpServerType,
  SettingsLevel,
  ToolConfirmationOutcome,
} from '../../src/schemas/enums.js';
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
    client = new DaemonClient({ transport, apiKey: 'test-token' });
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

  describe('updateSessionSettings', () => {
    it('sends daemon.update_session_settings with params', async () => {
      await initializeClient(transport, client, 'sess-settings');

      const promise = client.updateSessionSettings({
        autonomyLevel: AutonomyLevel.High,
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.update_session_settings'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(makeSuccessResponse(sent['id'] as string, {}));
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-settings');
      expect(params['autonomyLevel']).toBe('high');
    });

    it('throws SessionError when no active session', async () => {
      await expect(
        client.updateSessionSettings({ autonomyLevel: AutonomyLevel.High })
      ).rejects.toThrow(SessionError);
    });
  });

  describe('compactSession', () => {
    it('sends daemon.compact_session', async () => {
      await initializeClient(transport, client, 'sess-compact');

      const promise = client.compactSession({});
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.compact_session'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, {
          newSessionId: 'compacted-sess',
          removedCount: 3,
        })
      );
      const result = await promise;

      expect(result.newSessionId).toBe('compacted-sess');
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-compact');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.compactSession({})).rejects.toThrow(SessionError);
    });
  });

  describe('forkSession', () => {
    it('sends daemon.fork_session', async () => {
      await initializeClient(transport, client, 'sess-fork');

      const promise = client.forkSession();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.fork_session'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, {
          newSessionId: 'forked-sess',
        })
      );
      const result = await promise;

      expect(result.newSessionId).toBe('forked-sess');
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-fork');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.forkSession()).rejects.toThrow(SessionError);
    });
  });

  describe('getContextBreakdown', () => {
    it('sends daemon.get_context_breakdown', async () => {
      await initializeClient(transport, client, 'sess-ctx');

      const promise = client.getContextBreakdown();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.get_context_breakdown'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, {
          modelId: 'test-model',
          modelDisplayName: 'Test Model',
          contextBudget: 200000,
          usedTokens: 1000,
          freeTokens: 199000,
          categories: [{ name: 'messages', tokens: 800, colorKey: 'messages' }],
        })
      );
      const result = await promise;

      expect(result.modelId).toBe('test-model');
      expect(result.usedTokens).toBe(1000);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-ctx');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.getContextBreakdown()).rejects.toThrow(SessionError);
    });
  });

  describe('renameSession', () => {
    it('sends daemon.rename_session with title', async () => {
      await initializeClient(transport, client, 'sess-rename');

      const promise = client.renameSession({ title: 'New Title' });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.rename_session'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { success: true })
      );
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-rename');
      expect(params['title']).toBe('New Title');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.renameSession({ title: 'x' })).rejects.toThrow(
        SessionError
      );
    });
  });

  describe('getRewindInfo', () => {
    it('sends daemon.get_rewind_info with messageId', async () => {
      await initializeClient(transport, client, 'sess-rewind');

      const promise = client.getRewindInfo({ messageId: 'msg-123' });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.get_rewind_info'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, {
          availableFiles: [],
          createdFiles: [],
          evictedFiles: [],
        })
      );
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-rewind');
      expect(params['messageId']).toBe('msg-123');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.getRewindInfo({ messageId: 'x' })).rejects.toThrow(
        SessionError
      );
    });
  });

  describe('executeRewind', () => {
    it('sends daemon.execute_rewind with messageId', async () => {
      await initializeClient(transport, client, 'sess-exec-rewind');

      const promise = client.executeRewind({
        messageId: 'msg-456',
        filesToRestore: [],
        filesToDelete: [],
        forkTitle: 'Rewind test',
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.execute_rewind'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, {
          newSessionId: 'rewound-sess',
          restoredCount: 2,
          deletedCount: 1,
          failedRestoreCount: 0,
          failedDeleteCount: 0,
        })
      );
      const result = await promise;

      expect(result.newSessionId).toBe('rewound-sess');
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-exec-rewind');
      expect(params['messageId']).toBe('msg-456');
    });

    it('throws SessionError when no active session', async () => {
      await expect(
        client.executeRewind({
          messageId: 'x',
          filesToRestore: [],
          filesToDelete: [],
          forkTitle: 'test',
        })
      ).rejects.toThrow(SessionError);
    });
  });

  describe('addMcpServer', () => {
    it('sends daemon.add_mcp_server with params', async () => {
      await initializeClient(transport, client, 'sess-mcp-add');

      const promise = client.addMcpServer({
        name: 'test-server',
        type: McpServerType.Stdio,
        command: 'node',
        args: ['server.js'],
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_mcp_server'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { success: true })
      );
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-mcp-add');
      expect(params['name']).toBe('test-server');
    });

    it('throws SessionError when no active session', async () => {
      await expect(
        client.addMcpServer({
          name: 'x',
          type: McpServerType.Stdio,
          command: 'y',
        })
      ).rejects.toThrow(SessionError);
    });
  });

  describe('removeMcpServer', () => {
    it('sends daemon.remove_mcp_server', async () => {
      await initializeClient(transport, client, 'sess-mcp-rm');

      const promise = client.removeMcpServer({
        serverName: 'test-server',
        settingsLevel: SettingsLevel.User,
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.remove_mcp_server'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { success: true })
      );
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-mcp-rm');
      expect(params['serverName']).toBe('test-server');
    });

    it('throws SessionError when no active session', async () => {
      await expect(
        client.removeMcpServer({
          serverName: 'x',
          settingsLevel: SettingsLevel.User,
        })
      ).rejects.toThrow(SessionError);
    });
  });

  describe('toggleMcpServer', () => {
    it('sends daemon.toggle_mcp_server', async () => {
      await initializeClient(transport, client, 'sess-mcp-toggle');

      const promise = client.toggleMcpServer({
        serverName: 'test-server',
        enabled: false,
        settingsLevel: SettingsLevel.User,
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.toggle_mcp_server'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { success: true })
      );
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-mcp-toggle');
      expect(params['serverName']).toBe('test-server');
      expect(params['enabled']).toBe(false);
    });

    it('throws SessionError when no active session', async () => {
      await expect(
        client.toggleMcpServer({
          serverName: 'x',
          enabled: true,
          settingsLevel: SettingsLevel.User,
        })
      ).rejects.toThrow(SessionError);
    });
  });

  describe('listMcpServers', () => {
    it('sends daemon.list_mcp_servers', async () => {
      await initializeClient(transport, client, 'sess-mcp-list');

      const promise = client.listMcpServers();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.list_mcp_servers'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, {
          servers: [],
          summary: { total: 0, connected: 0, connecting: 0, failed: 0 },
        })
      );
      const result = await promise;

      expect(result.servers).toEqual([]);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-mcp-list');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.listMcpServers()).rejects.toThrow(SessionError);
    });
  });

  describe('listMcpTools', () => {
    it('sends daemon.list_mcp_tools', async () => {
      await initializeClient(transport, client, 'sess-mcp-tools');

      const promise = client.listMcpTools();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.list_mcp_tools'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { tools: [] })
      );
      const result = await promise;

      expect(result.tools).toEqual([]);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-mcp-tools');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.listMcpTools()).rejects.toThrow(SessionError);
    });
  });

  describe('authenticateMcpServer', () => {
    it('sends daemon.authenticate_mcp_server', async () => {
      await initializeClient(transport, client, 'sess-mcp-auth');

      const promise = client.authenticateMcpServer({
        serverName: 'test-server',
      });
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.authenticate_mcp_server'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { success: true })
      );
      await promise;

      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-mcp-auth');
      expect(params['serverName']).toBe('test-server');
    });

    it('throws SessionError when no active session', async () => {
      await expect(
        client.authenticateMcpServer({ serverName: 'x' })
      ).rejects.toThrow(SessionError);
    });
  });

  describe('listSkills', () => {
    it('sends daemon.list_skills', async () => {
      await initializeClient(transport, client, 'sess-skills');

      const promise = client.listSkills();
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.list_skills'
      )!;
      expect(sent).toBeDefined();
      transport.injectMessage(
        makeSuccessResponse(sent['id'] as string, { skills: [] })
      );
      const result = await promise;

      expect(result.skills).toEqual([]);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('sess-skills');
    });

    it('throws SessionError when no active session', async () => {
      await expect(client.listSkills()).rejects.toThrow(SessionError);
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
