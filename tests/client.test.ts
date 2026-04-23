/**
 * Unit tests for DroidClient.
 *
 * Uses InMemoryTransport to simulate transport communication.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DroidClient } from '../src/client.js';
import {
  ConnectionError,
  SessionError,
  SessionNotFoundError,
} from '../src/errors.js';
import {
  ContextStatsAccuracy,
  DroidClientMethod,
  DroidServerMethod,
  JSONRPC_VERSION,
  JsonRpcErrorCode,
  SettingsLevel,
  McpServerType,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import {
  getLastSentId,
  InMemoryTransport,
  makeErrorResponse,
  makePermissionRequestParams,
  makeServerRequest,
  makeSessionNotification,
  makeSuccessResponse,
} from './helpers.js';

/** Create a DroidClient + InMemoryTransport pair, pre-connected. */
async function createTestClient(): Promise<{
  client: DroidClient;
  transport: InMemoryTransport;
}> {
  const transport = new InMemoryTransport();
  await transport.connect();
  const client = new DroidClient({ transport });
  return { client, transport };
}

/** Initialize a session on the client (sends init request, responds with success). */
async function initializeTestSession(
  client: DroidClient,
  transport: InMemoryTransport,
  sessionId = 'test-session-123'
): Promise<void> {
  const initPromise = client.initializeSession({
    machineId: 'test-machine',
    cwd: '/tmp/test',
  });

  await vi.waitFor(() => {
    expect(transport.sentMessages.length).toBeGreaterThan(0);
  });

  const requestId = getLastSentId(transport);
  transport.injectMessage(
    makeSuccessResponse(requestId, {
      sessionId,
      session: {},
      settings: {
        modelId: 'test-model',
        reasoningEffort: 'medium',
      },
    })
  );

  await initPromise;
}

describe('DroidClient', () => {
  let client: DroidClient;
  let transport: InMemoryTransport;

  beforeEach(async () => {
    const setup = await createTestClient();
    client = setup.client;
    transport = setup.transport;
  });

  afterEach(async () => {
    await client.close();
  });

  describe('initializeSession (VAL-CLIENT-001)', () => {
    it('sends correct JSON-RPC request and returns parsed result', async () => {
      const initPromise = client.initializeSession({
        machineId: 'test-machine',
        cwd: '/tmp/test',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(1);
      });

      const sent = transport.sentMessages[0] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.INITIALIZE_SESSION);
      expect(sent['jsonrpc']).toBe(JSONRPC_VERSION);
      expect(sent['type']).toBe('request');
      expect(sent['params']).toMatchObject({
        machineId: 'test-machine',
        cwd: '/tmp/test',
      });

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          sessionId: 'session-abc',
          session: { id: 'session-abc' },
          settings: {
            modelId: 'test-model',
            reasoningEffort: 'medium',
          },
        })
      );

      const result = await initPromise;
      expect(result.sessionId).toBe('session-abc');
      expect(client.sessionId).toBe('session-abc');
    });

    it('uses extended timeout (SESSION_INIT_TIMEOUT)', async () => {
      const initPromise = client.initializeSession({
        machineId: 'test',
        cwd: '/tmp',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(1);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          sessionId: 's1',
          session: {},
          settings: { modelId: 'm', reasoningEffort: 'medium' },
        })
      );

      await initPromise;
    });

    it('passes all optional params when provided', async () => {
      const initPromise = client.initializeSession({
        machineId: 'm',
        cwd: '/tmp',
        sessionId: 'custom-session',
        workspaceId: 'ws-1',
        modelId: 'claude-3',
        disabledToolIds: ['Execute'],
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(1);
      });

      const sent = transport.sentMessages[0] as Record<string, unknown>;
      const params = sent['params'] as Record<string, unknown>;
      expect(params['sessionId']).toBe('custom-session');
      expect(params['workspaceId']).toBe('ws-1');
      expect(params['modelId']).toBe('claude-3');
      expect(params['disabledToolIds']).toEqual(['Execute']);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          sessionId: 'custom-session',
          session: {},
          settings: {
            modelId: 'claude-3',
            reasoningEffort: 'medium',
            enabledToolIds: ['Read'],
            disabledToolIds: ['Execute'],
          },
        })
      );

      const result = await initPromise;
      expect(result.settings.enabledToolIds).toEqual(['Read']);
      expect(result.settings.disabledToolIds).toEqual(['Execute']);
    });
  });

  describe('loadSession (VAL-CLIENT-002)', () => {
    it('sends request and returns parsed result', async () => {
      const loadPromise = client.loadSession({
        sessionId: 'existing-session',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(1);
      });

      const sent = transport.sentMessages[0] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.LOAD_SESSION);
      expect((sent['params'] as Record<string, unknown>)['sessionId']).toBe(
        'existing-session'
      );

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          session: { id: 'existing-session' },
          settings: {
            modelId: 'm',
            reasoningEffort: 'medium',
            enabledToolIds: ['Read'],
            disabledToolIds: ['Execute'],
          },
        })
      );

      const result = await loadPromise;
      expect(result.session).toBeDefined();
      expect(result.settings.enabledToolIds).toEqual(['Read']);
      expect(result.settings.disabledToolIds).toEqual(['Execute']);
      expect(client.sessionId).toBe('existing-session');
    });

    it('throws SessionNotFoundError for non-existent sessions', async () => {
      const loadPromise = client.loadSession({
        sessionId: 'nonexistent',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(1);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(
        makeErrorResponse(
          requestId,
          JsonRpcErrorCode.ENTITY_NOT_FOUND,
          'Session not found'
        )
      );

      await expect(loadPromise).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('addUserMessage (VAL-CLIENT-003)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends request with text content', async () => {
      const msgPromise = client.addUserMessage({ text: 'Hello world' });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.ADD_USER_MESSAGE);
      expect((sent['params'] as Record<string, unknown>)['text']).toBe(
        'Hello world'
      );

      const requestId = sent['id'] as string;
      transport.injectMessage(makeSuccessResponse(requestId, {}));

      await msgPromise;
    });

    it('sends request with text and optional images/files', async () => {
      const images = [
        {
          type: 'base64' as const,
          mediaType: 'image/png' as const,
          data: 'abc123',
        },
      ];
      const files = [
        { type: 'base64', mediaType: 'application/pdf', data: 'def456' },
      ];

      const msgPromise = client.addUserMessage({
        text: 'Look at this',
        images,
        files,
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      const params = sent['params'] as Record<string, unknown>;
      expect(params['text']).toBe('Look at this');
      expect(params['images']).toEqual(images);
      expect(params['files']).toEqual(files);

      const requestId = sent['id'] as string;
      transport.injectMessage(makeSuccessResponse(requestId, {}));

      await msgPromise;
    });

    it('throws SessionError if no active session', async () => {
      const transport2 = new InMemoryTransport();
      await transport2.connect();
      const client2 = new DroidClient({ transport: transport2 });

      await expect(client2.addUserMessage({ text: 'hello' })).rejects.toThrow(
        SessionError
      );

      await client2.close();
    });
  });

  describe('MCP methods (VAL-CLIENT-004)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('addMcpServer sends correct request', async () => {
      const promise = client.addMcpServer({
        name: 'test-server',
        type: McpServerType.Stdio,
        command: 'node',
        args: ['server.js'],
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.ADD_MCP_SERVER);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('removeMcpServer sends correct request', async () => {
      const promise = client.removeMcpServer({
        serverName: 'test-server',
        settingsLevel: SettingsLevel.User,
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.REMOVE_MCP_SERVER);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('toggleMcpServer sends correct request', async () => {
      const promise = client.toggleMcpServer({
        serverName: 'test-server',
        enabled: true,
        settingsLevel: SettingsLevel.User,
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('listMcpServers sends correct request', async () => {
      const promise = client.listMcpServers();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.LIST_MCP_SERVERS);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          servers: [],
          summary: { total: 0, connected: 0, connecting: 0, failed: 0 },
        })
      );

      const result = await promise;
      expect(result.servers).toEqual([]);
    });

    it('listMcpTools sends correct request', async () => {
      const promise = client.listMcpTools();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(makeSuccessResponse(requestId, { tools: [] }));

      const result = await promise;
      expect(result.tools).toEqual([]);
    });

    it('listTools sends correct request', async () => {
      const promise = client.listTools({
        modelId: 'gpt-5',
        enabledToolIds: ['Read'],
        disabledToolIds: ['Execute'],
        depth: 1,
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.LIST_TOOLS);
      expect(sent['params']).toMatchObject({
        modelId: 'gpt-5',
        enabledToolIds: ['Read'],
        disabledToolIds: ['Execute'],
        depth: 1,
      });

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          tools: [
            {
              id: 'read-cli',
              llmId: 'Read',
              displayName: 'Read',
              description: 'Read files',
              category: 'read',
              defaultAllowed: true,
              currentlyAllowed: true,
            },
          ],
        })
      );

      const result = await promise;
      expect(result.tools[0]?.llmId).toBe('Read');
    });

    it('listMcpRegistry sends correct request', async () => {
      const promise = client.listMcpRegistry();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(makeSuccessResponse(requestId, { servers: [] }));

      const result = await promise;
      expect(result.servers).toEqual([]);
    });

    it('toggleMcpTool sends correct request', async () => {
      const promise = client.toggleMcpTool({
        serverName: 'test-server',
        toolName: 'test-tool',
        enabled: false,
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.TOGGLE_MCP_TOOL);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['serverName']).toBe('test-server');
      expect(params['toolName']).toBe('test-tool');
      expect(params['enabled']).toBe(false);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('authenticateMcpServer uses MCP_AUTH_TIMEOUT', async () => {
      const promise = client.authenticateMcpServer({
        serverName: 'oauth-server',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.AUTHENTICATE_MCP_SERVER);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('cancelMcpAuth sends correct request', async () => {
      const promise = client.cancelMcpAuth({ serverName: 'oauth-server' });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('clearMcpAuth sends correct request', async () => {
      const promise = client.clearMcpAuth({ serverName: 'oauth-server' });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const requestId = getLastSentId(transport);
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });

    it('submitMcpAuthCode sends correct request', async () => {
      const promise = client.submitMcpAuthCode({
        serverName: 'oauth-server',
        code: 'auth-code-123',
        state: 'state-xyz',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.SUBMIT_MCP_AUTH_CODE);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['serverName']).toBe('oauth-server');
      expect(params['code']).toBe('auth-code-123');
      expect(params['state']).toBe('state-xyz');

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, { success: true })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });
  });

  describe('other session methods', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('interruptSession sends correct request', async () => {
      const promise = client.interruptSession();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.INTERRUPT_SESSION);

      const requestId = sent['id'] as string;
      transport.injectMessage(makeSuccessResponse(requestId, {}));

      await promise;
    });

    it('killWorkerSession sends correct request', async () => {
      const promise = client.killWorkerSession({
        workerSessionId: 'worker-1',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.KILL_WORKER_SESSION);
      expect(
        (sent['params'] as Record<string, unknown>)['workerSessionId']
      ).toBe('worker-1');

      const requestId = sent['id'] as string;
      transport.injectMessage(makeSuccessResponse(requestId, {}));

      await promise;
    });

    it('updateSessionSettings sends correct request', async () => {
      const promise = client.updateSessionSettings({
        modelId: 'new-model',
        disabledToolIds: ['Execute'],
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.UPDATE_SESSION_SETTINGS);
      expect(sent['params']).toMatchObject({
        modelId: 'new-model',
        disabledToolIds: ['Execute'],
      });

      const requestId = sent['id'] as string;
      transport.injectMessage(makeSuccessResponse(requestId, {}));

      await promise;
    });

    it('listSkills sends correct request', async () => {
      const promise = client.listSkills();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.LIST_SKILLS);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          skills: [
            { name: 'test-skill', location: 'project', filePath: '/path' },
          ],
        })
      );

      const result = await promise;
      expect(result.skills).toHaveLength(1);
    });

    it('submitBugReport sends correct request', async () => {
      const promise = client.submitBugReport({
        userComment: 'Something is broken',
        clientLogs: 'log data...',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.SUBMIT_BUG_REPORT);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['userComment']).toBe('Something is broken');
      expect(params['clientLogs']).toBe('log data...');

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, { bugReportId: 'bug-123' })
      );

      const result = await promise;
      expect(result.bugReportId).toBe('bug-123');
    });
  });

  describe('permission handler (VAL-CLIENT-005)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('invokes registered handler and sends response back', async () => {
      const handler = vi.fn().mockResolvedValue('proceed_once');
      client.setPermissionHandler(handler);

      transport.injectMessage(
        makeServerRequest('perm-req-1', DroidClientMethod.REQUEST_PERMISSION, {
          ...makePermissionRequestParams({
            toolUseId: 'tu-edit-1',
            toolName: 'edit',
            confirmationType: 'edit',
            details: {
              type: 'edit',
              filePath: '/tmp/file.ts',
              fileName: 'file.ts',
            },
          }),
        })
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'perm-req-1'
        );
        expect(responses.length).toBe(1);
      });

      expect(handler).toHaveBeenCalledOnce();

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'perm-req-1'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({ selectedOption: 'proceed_once' });
    });

    it.each(
      Object.entries(ToolConfirmationOutcome).map(([key, value]) => ({
        name: key,
        outcome: value,
      }))
    )(
      'permission handler returning $name sends correct response',
      async ({ outcome }) => {
        const handler = vi.fn().mockReturnValue(outcome);
        client.setPermissionHandler(handler);

        const reqId = `perm-outcome-${outcome}`;
        transport.injectMessage(
          makeServerRequest(reqId, DroidClientMethod.REQUEST_PERMISSION, {
            ...makePermissionRequestParams({
              toolUseId: `tu-${outcome}`,
              toolName: 'test-tool',
              confirmationType: 'exec',
              details: {
                type: 'exec',
                fullCommand: 'test-tool --run',
                command: 'test-tool --run',
              },
            }),
          })
        );

        await vi.waitFor(() => {
          const responses = transport.sentMessages.filter(
            (msg) =>
              (msg as Record<string, unknown>)['type'] === 'response' &&
              (msg as Record<string, unknown>)['id'] === reqId
          );
          expect(responses.length).toBe(1);
        });

        expect(handler).toHaveBeenCalledOnce();

        const response = transport.sentMessages.find(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === reqId
        ) as Record<string, unknown>;

        expect(response['result']).toEqual({ selectedOption: outcome });
      }
    );

    it('invokes sync handler correctly', async () => {
      const handler = vi.fn().mockReturnValue('proceed_always');
      client.setPermissionHandler(handler);

      transport.injectMessage(
        makeServerRequest('perm-req-2', DroidClientMethod.REQUEST_PERMISSION, {
          ...makePermissionRequestParams({
            toolUseId: 'tu-exec-2',
            toolName: 'execute',
            confirmationType: 'exec',
            details: {
              type: 'exec',
              fullCommand: 'npm test',
              command: 'npm test',
            },
          }),
        })
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'perm-req-2'
        );
        expect(responses.length).toBe(1);
      });

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'perm-req-2'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({
        selectedOption: 'proceed_always',
      });
    });
  });

  describe('ask-user handler (VAL-CLIENT-006)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('invokes registered handler and sends response back', async () => {
      const handler = vi.fn().mockResolvedValue({
        cancelled: false,
        answers: [{ index: 0, question: 'Continue?', answer: 'Yes' }],
      });
      client.setAskUserHandler(handler);

      transport.injectMessage(
        makeServerRequest('ask-req-1', DroidClientMethod.ASK_USER, {
          toolCallId: 'tool-1',
          questions: [
            {
              index: 0,
              topic: 'Confirmation',
              question: 'Continue?',
              options: ['Yes', 'No'],
            },
          ],
        })
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'ask-req-1'
        );
        expect(responses.length).toBe(1);
      });

      expect(handler).toHaveBeenCalledOnce();

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'ask-req-1'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({
        cancelled: false,
        answers: [{ index: 0, question: 'Continue?', answer: 'Yes' }],
      });
    });
  });

  describe('transport error propagation (VAL-CLIENT-007)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('subsequent method calls throw after transport error', async () => {
      transport.injectError(new Error('process exited'));

      await expect(client.addUserMessage({ text: 'hello' })).rejects.toThrow(
        ConnectionError
      );
    });

    it('pending requests are rejected on transport error', async () => {
      const promise = client.addUserMessage({ text: 'hello' });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      transport.injectError(new Error('connection lost'));

      await expect(promise).rejects.toThrow(ConnectionError);
    });
  });

  describe('notification subscription with filtering (VAL-CLIENT-008)', () => {
    it('delivers all notifications when no filter is set', async () => {
      const received: Record<string, unknown>[] = [];
      client.onNotification((n) => received.push(n));

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'Hello',
        })
      );
      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.TOOL_RESULT, {
          toolName: 'edit',
        })
      );

      expect(received).toHaveLength(2);
    });

    it('delivers only matching notifications when type filter is set', async () => {
      const textDeltas: Record<string, unknown>[] = [];
      client.onNotification((n) => textDeltas.push(n), {
        type: SessionNotificationType.ASSISTANT_TEXT_DELTA,
      });

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          messageId: 'msg-1',
          blockIndex: 0,
          textDelta: 'Hello',
        })
      );
      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.TOOL_RESULT, {
          messageId: 'msg-1',
          toolUseId: 'tu-1',
          content: 'done',
          isError: false,
        })
      );
      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          messageId: 'msg-1',
          blockIndex: 0,
          textDelta: ' World',
        })
      );

      expect(textDeltas).toHaveLength(2);
    });

    it('does not deliver non-matching notifications', async () => {
      const received: Record<string, unknown>[] = [];
      client.onNotification((n) => received.push(n), {
        type: SessionNotificationType.TOOL_RESULT,
      });

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'Hello',
        })
      );

      expect(received).toHaveLength(0);
    });
  });

  describe('notification unsubscribe (VAL-CLIENT-009)', () => {
    it('removes listener after unsubscribe', () => {
      const received: Record<string, unknown>[] = [];
      const unsubscribe = client.onNotification((n) => received.push(n));

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'Before',
        })
      );
      expect(received).toHaveLength(1);

      unsubscribe();

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'After',
        })
      );
      expect(received).toHaveLength(1);
    });

    it('double unsubscribe is safe (idempotent)', () => {
      const received: Record<string, unknown>[] = [];
      const unsubscribe = client.onNotification((n) => received.push(n));

      unsubscribe();
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('permission handler exception (VAL-CLIENT-010)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends JSON-RPC error response when handler throws', async () => {
      client.setPermissionHandler(() => {
        throw new Error('handler exploded');
      });

      transport.injectMessage(
        makeServerRequest('perm-err-1', DroidClientMethod.REQUEST_PERMISSION, {
          ...makePermissionRequestParams({
            toolUseId: 'tu-perm-err-1',
            toolName: 'execute',
            confirmationType: 'exec',
            details: {
              type: 'exec',
              fullCommand: 'npm test',
              command: 'npm test',
            },
          }),
        })
      );

      await vi.waitFor(() => {
        const errorResponses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'perm-err-1' &&
            'error' in (msg as Record<string, unknown>)
        );
        expect(errorResponses.length).toBe(1);
      });

      const errorResponse = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'perm-err-1' &&
          'error' in (msg as Record<string, unknown>)
      ) as Record<string, unknown>;

      const error = errorResponse['error'] as Record<string, unknown>;
      expect(error['code']).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
    });

    it('sends error response when async handler rejects', async () => {
      client.setPermissionHandler(async () => {
        throw new Error('async handler failed');
      });

      transport.injectMessage(
        makeServerRequest('perm-err-2', DroidClientMethod.REQUEST_PERMISSION, {
          ...makePermissionRequestParams({
            toolUseId: 'tu-perm-err-2',
            toolName: 'execute',
            confirmationType: 'exec',
            details: {
              type: 'exec',
              fullCommand: 'npm test',
              command: 'npm test',
            },
          }),
        })
      );

      await vi.waitFor(() => {
        const errorResponses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'perm-err-2' &&
            'error' in (msg as Record<string, unknown>)
        );
        expect(errorResponses.length).toBe(1);
      });
    });
  });

  describe('default handler behavior (VAL-CLIENT-011)', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('returns cancel for permission requests when no handler registered', async () => {
      transport.injectMessage(
        makeServerRequest(
          'perm-default-1',
          DroidClientMethod.REQUEST_PERMISSION,
          makePermissionRequestParams({
            toolUseId: 'tu-perm-default-1',
            toolName: 'execute',
            confirmationType: 'exec',
            details: {
              type: 'exec',
              fullCommand: 'npm test',
              command: 'npm test',
            },
          })
        )
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'perm-default-1'
        );
        expect(responses.length).toBe(1);
      });

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'perm-default-1'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({ selectedOption: 'cancel' });
    });

    it('returns cancelled for ask-user requests when no handler registered', async () => {
      transport.injectMessage(
        makeServerRequest('ask-default-1', DroidClientMethod.ASK_USER, {
          toolCallId: 'tool-1',
          questions: [],
        })
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'ask-default-1'
        );
        expect(responses.length).toBe(1);
      });

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'ask-default-1'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({ cancelled: true, answers: [] });
    });

    it('clearPermissionHandler restores default cancel behavior', async () => {
      const handler = vi.fn().mockReturnValue('proceed_once');
      client.setPermissionHandler(handler);
      client.clearPermissionHandler();

      transport.injectMessage(
        makeServerRequest(
          'perm-clear-1',
          DroidClientMethod.REQUEST_PERMISSION,
          makePermissionRequestParams({
            toolUseId: 'tu-perm-clear-1',
            toolName: 'execute',
            confirmationType: 'exec',
            details: {
              type: 'exec',
              fullCommand: 'npm test',
              command: 'npm test',
            },
          })
        )
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'perm-clear-1'
        );
        expect(responses.length).toBe(1);
      });

      expect(handler).not.toHaveBeenCalled();

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'perm-clear-1'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({ selectedOption: 'cancel' });
    });

    it('clearAskUserHandler restores default cancelled behavior', async () => {
      const handler = vi
        .fn()
        .mockReturnValue({ cancelled: false, answers: [] });
      client.setAskUserHandler(handler);
      client.clearAskUserHandler();

      transport.injectMessage(
        makeServerRequest('ask-clear-1', DroidClientMethod.ASK_USER, {
          toolCallId: 'tool-1',
          questions: [],
        })
      );

      await vi.waitFor(() => {
        const responses = transport.sentMessages.filter(
          (msg) =>
            (msg as Record<string, unknown>)['type'] === 'response' &&
            (msg as Record<string, unknown>)['id'] === 'ask-clear-1'
        );
        expect(responses.length).toBe(1);
      });

      expect(handler).not.toHaveBeenCalled();

      const response = transport.sentMessages.find(
        (msg) =>
          (msg as Record<string, unknown>)['type'] === 'response' &&
          (msg as Record<string, unknown>)['id'] === 'ask-clear-1'
      ) as Record<string, unknown>;

      expect(response['result']).toEqual({ cancelled: true, answers: [] });
    });
  });

  describe('post-close behavior (VAL-CLIENT-012)', () => {
    it('initializeSession throws after close', async () => {
      await client.close();

      await expect(
        client.initializeSession({
          machineId: 'test',
          cwd: '/tmp',
        })
      ).rejects.toThrow(ConnectionError);
    });

    it('loadSession throws after close', async () => {
      await client.close();

      await expect(client.loadSession({ sessionId: 'test' })).rejects.toThrow(
        ConnectionError
      );
    });

    it('addUserMessage throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(client.addUserMessage({ text: 'hello' })).rejects.toThrow(
        ConnectionError
      );
    });

    it('interruptSession throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(client.interruptSession()).rejects.toThrow(ConnectionError);
    });

    it('killWorkerSession throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(
        client.killWorkerSession({ workerSessionId: 'w1' })
      ).rejects.toThrow(ConnectionError);
    });

    it('updateSessionSettings throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(
        client.updateSessionSettings({ modelId: 'm' })
      ).rejects.toThrow(ConnectionError);
    });

    it('MCP methods throw after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(
        client.addMcpServer({ name: 's', type: McpServerType.Stdio })
      ).rejects.toThrow(ConnectionError);
      await expect(
        client.removeMcpServer({
          serverName: 's',
          settingsLevel: SettingsLevel.User,
        })
      ).rejects.toThrow(ConnectionError);
      await expect(client.listMcpServers()).rejects.toThrow(ConnectionError);
      await expect(client.listMcpTools()).rejects.toThrow(ConnectionError);
      await expect(client.listMcpRegistry()).rejects.toThrow(ConnectionError);
      await expect(
        client.toggleMcpServer({
          serverName: 's',
          enabled: true,
          settingsLevel: SettingsLevel.User,
        })
      ).rejects.toThrow(ConnectionError);
      await expect(
        client.toggleMcpTool({
          serverName: 's',
          toolName: 't',
          enabled: true,
        })
      ).rejects.toThrow(ConnectionError);
      await expect(
        client.authenticateMcpServer({ serverName: 's' })
      ).rejects.toThrow(ConnectionError);
      await expect(client.cancelMcpAuth({ serverName: 's' })).rejects.toThrow(
        ConnectionError
      );
      await expect(client.clearMcpAuth({ serverName: 's' })).rejects.toThrow(
        ConnectionError
      );
      await expect(
        client.submitMcpAuthCode({
          serverName: 's',
          code: 'c',
          state: 'st',
        })
      ).rejects.toThrow(ConnectionError);
    });

    it('listTools throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(client.listTools()).rejects.toThrow(ConnectionError);
    });

    it('listSkills throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(client.listSkills()).rejects.toThrow(ConnectionError);
    });

    it('submitBugReport throws after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(
        client.submitBugReport({ userComment: 'bug' })
      ).rejects.toThrow(ConnectionError);
    });

    it('rewind/compact/fork methods throw after close', async () => {
      await initializeTestSession(client, transport);
      await client.close();

      await expect(
        client.getRewindInfo({ messageId: 'msg-1' })
      ).rejects.toThrow(ConnectionError);
      await expect(
        client.executeRewind({
          messageId: 'msg-1',
          filesToRestore: [],
          filesToDelete: [],
          forkTitle: 'test',
        })
      ).rejects.toThrow(ConnectionError);
      await expect(client.compactSession({})).rejects.toThrow(ConnectionError);
      await expect(client.forkSession()).rejects.toThrow(ConnectionError);
      await expect(client.renameSession({ title: 'test' })).rejects.toThrow(
        ConnectionError
      );
    });

    it('close() is idempotent', async () => {
      await client.close();
      await expect(client.close()).resolves.toBeUndefined();
    });
  });

  describe('getRewindInfo', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends correct request and returns parsed result', async () => {
      const promise = client.getRewindInfo({ messageId: 'msg-abc' });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.GET_REWIND_INFO);
      expect((sent['params'] as Record<string, unknown>)['messageId']).toBe(
        'msg-abc'
      );

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          availableFiles: [
            { filePath: '/src/main.ts', contentHash: 'abc123', size: 1024 },
          ],
          createdFiles: [{ filePath: '/src/new.ts' }],
          evictedFiles: [{ filePath: '/src/old.ts', reason: 'too large' }],
        })
      );

      const result = await promise;
      expect(result.availableFiles).toHaveLength(1);
      expect(result.availableFiles[0].filePath).toBe('/src/main.ts');
      expect(result.createdFiles).toHaveLength(1);
      expect(result.evictedFiles).toHaveLength(1);
    });
  });

  describe('executeRewind', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends correct request and returns parsed result', async () => {
      const promise = client.executeRewind({
        messageId: 'msg-abc',
        filesToRestore: [
          { filePath: '/src/main.ts', contentHash: 'abc123', size: 1024 },
        ],
        filesToDelete: [{ filePath: '/src/new.ts' }],
        forkTitle: 'Rewind to before refactor',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.EXECUTE_REWIND);
      const params = sent['params'] as Record<string, unknown>;
      expect(params['messageId']).toBe('msg-abc');
      expect(params['forkTitle']).toBe('Rewind to before refactor');

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          newSessionId: 'new-session-123',
          restoredCount: 1,
          deletedCount: 1,
          failedRestoreCount: 0,
          failedDeleteCount: 0,
        })
      );

      const result = await promise;
      expect(result.newSessionId).toBe('new-session-123');
      expect(result.restoredCount).toBe(1);
      expect(result.deletedCount).toBe(1);
      expect(result.failedRestoreCount).toBe(0);
      expect(result.failedDeleteCount).toBe(0);
    });
  });

  describe('compactSession', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends correct request and returns parsed result', async () => {
      const promise = client.compactSession({
        customInstructions: 'Keep code context',
      });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.COMPACT_SESSION);
      expect(
        (sent['params'] as Record<string, unknown>)['customInstructions']
      ).toBe('Keep code context');

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          newSessionId: 'compact-session-456',
          removedCount: 42,
        })
      );

      const result = await promise;
      expect(result.newSessionId).toBe('compact-session-456');
      expect(result.removedCount).toBe(42);
    });

    it('sends request with empty params when no custom instructions', async () => {
      const promise = client.compactSession({});

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.COMPACT_SESSION);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          newSessionId: 'compact-session-789',
          removedCount: 10,
        })
      );

      const result = await promise;
      expect(result.newSessionId).toBe('compact-session-789');
    });
  });

  describe('forkSession', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends correct request and returns parsed result', async () => {
      const promise = client.forkSession();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.FORK_SESSION);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          newSessionId: 'forked-session-001',
        })
      );

      const result = await promise;
      expect(result.newSessionId).toBe('forked-session-001');
    });
  });

  describe('renameSession', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends correct request and returns parsed result', async () => {
      const promise = client.renameSession({ title: 'New Session Title' });

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.RENAME_SESSION);
      expect((sent['params'] as Record<string, unknown>)['title']).toBe(
        'New Session Title'
      );

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          success: true,
        })
      );

      const result = await promise;
      expect(result.success).toBe(true);
    });
  });

  describe('getContextStats', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('sends correct request and returns parsed result', async () => {
      const promise = client.getContextStats();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const sent = transport.sentMessages[1] as Record<string, unknown>;
      expect(sent['method']).toBe(DroidServerMethod.GET_CONTEXT_STATS);

      const requestId = sent['id'] as string;
      transport.injectMessage(
        makeSuccessResponse(requestId, {
          used: 42,
          remaining: 58,
          limit: 100,
          accuracy: ContextStatsAccuracy.Estimated,
          updatedAt: '2026-04-20T00:00:00.000Z',
        })
      );

      const result = await promise;
      expect(result.used).toBe(42);
      expect(result.remaining).toBe(58);
      expect(result.limit).toBe(100);
      expect(result.accuracy).toBe(ContextStatsAccuracy.Estimated);
    });
  });

  describe('Zod parse failure on malformed response', () => {
    beforeEach(async () => {
      await initializeTestSession(client, transport);
    });

    it('rejects with ZodError when response has unexpected shape', async () => {
      const promise = client.listMcpServers();

      await vi.waitFor(() => {
        expect(transport.sentMessages.length).toBe(2);
      });

      const requestId = getLastSentId(transport);

      transport.injectMessage(
        makeSuccessResponse(requestId, { unexpected: 'shape' })
      );

      await expect(promise).rejects.toHaveProperty('name', 'ZodError');
    });
  });

  describe('edge cases', () => {
    it('notification listener exception does not crash client', () => {
      const goodListener = vi.fn();
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('listener crashed');
      });

      client.onNotification(badListener);
      client.onNotification(goodListener);

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'Hello',
        })
      );

      expect(badListener).toHaveBeenCalledOnce();
      expect(goodListener).toHaveBeenCalledOnce();
    });

    it('sessionId is null before initialization', () => {
      expect(client.sessionId).toBeNull();
    });

    it('isConnected reflects client state', async () => {
      expect(client.isConnected).toBe(true);
      await client.close();
      expect(client.isConnected).toBe(false);
    });

    it('multiple notification listeners receive same event', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      client.onNotification(listener1);
      client.onNotification(listener2);

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'Hello',
        })
      );

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();
    });

    it('unsubscribing during notification dispatch does not affect other listeners', () => {
      const listener2 = vi.fn();
      const unsub1: { fn?: () => void } = {};
      const listener1 = vi.fn().mockImplementation(() => {
        unsub1.fn?.();
      });

      unsub1.fn = client.onNotification(listener1);
      client.onNotification(listener2);

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'Hello',
        })
      );

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledOnce();

      transport.injectMessage(
        makeSessionNotification(SessionNotificationType.ASSISTANT_TEXT_DELTA, {
          text: 'World',
        })
      );

      expect(listener1).toHaveBeenCalledOnce();
      expect(listener2).toHaveBeenCalledTimes(2);
    });

    it('methods requiring session throw SessionError before initialization', async () => {
      await expect(client.addUserMessage({ text: 'hello' })).rejects.toThrow(
        SessionError
      );

      await expect(client.interruptSession()).rejects.toThrow(SessionError);

      await expect(
        client.killWorkerSession({ workerSessionId: 'w1' })
      ).rejects.toThrow(SessionError);

      await expect(client.listTools()).rejects.toThrow(SessionError);

      await expect(client.listSkills()).rejects.toThrow(SessionError);

      await expect(
        client.submitBugReport({ userComment: 'bug' })
      ).rejects.toThrow(SessionError);

      await expect(
        client.getRewindInfo({ messageId: 'msg-1' })
      ).rejects.toThrow(SessionError);

      await expect(
        client.executeRewind({
          messageId: 'msg-1',
          filesToRestore: [],
          filesToDelete: [],
          forkTitle: 'test',
        })
      ).rejects.toThrow(SessionError);

      await expect(client.compactSession({})).rejects.toThrow(SessionError);

      await expect(client.forkSession()).rejects.toThrow(SessionError);

      await expect(client.renameSession({ title: 'test' })).rejects.toThrow(
        SessionError
      );
    });
  });
});
