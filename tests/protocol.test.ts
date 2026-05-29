/**
 * Unit tests for ProtocolEngine.
 *
 * Uses InMemoryTransport to simulate transport communication.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ConnectionError,
  ProtocolError,
  SessionNotFoundError,
  TimeoutError,
} from '../src/errors.js';
import { ProtocolEngine } from '../src/protocol.js';
import {
  DroidClientMethod,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  JsonRpcErrorCode,
  LEGACY_FACTORY_API_VERSION,
  ServerRequestHandlerType,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import {
  InMemoryTransport,
  makeErrorResponse,
  makeNotification,
  makeServerRequest,
  makeSuccessResponse,
} from './helpers.js';

describe('ProtocolEngine', () => {
  let transport: InMemoryTransport;
  let engine: ProtocolEngine;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    engine = new ProtocolEngine({ transport });
  });

  afterEach(async () => {
    await engine.close();
  });

  describe('request-response correlation (VAL-PROTOCOL-001)', () => {
    it('sends JSON-RPC request with correct envelope fields', async () => {
      const promise = engine.sendRequest('droid.list_skills', { foo: 'bar' });

      expect(transport.sentMessages).toHaveLength(1);
      const sent = transport.sentMessages[0] as Record<string, unknown>;
      expect(sent['jsonrpc']).toBe(JSONRPC_VERSION);
      expect(sent['factoryApiVersion']).toBe(LEGACY_FACTORY_API_VERSION);
      expect(sent['factoryProtocolVersion']).toBe(FACTORY_PROTOCOL_VERSION);
      expect(sent['type']).toBe('request');
      expect(sent['method']).toBe('droid.list_skills');
      expect(sent['params']).toEqual({ foo: 'bar' });
      expect(typeof sent['id']).toBe('string');
      expect((sent['id'] as string).length).toBeGreaterThan(0);

      const requestId = sent['id'] as string;
      transport.injectMessage(makeSuccessResponse(requestId, { skills: [] }));

      const result = await promise;
      expect(result).toEqual({ skills: [] });
    });

    it('correlates response to correct pending request by UUID ID', async () => {
      const promise1 = engine.sendRequest('droid.method_a', {});
      const promise2 = engine.sendRequest('droid.method_b', {});

      expect(transport.sentMessages).toHaveLength(2);
      const id1 = (transport.sentMessages[0] as Record<string, unknown>)[
        'id'
      ] as string;
      const id2 = (transport.sentMessages[1] as Record<string, unknown>)[
        'id'
      ] as string;

      transport.injectMessage(makeSuccessResponse(id2, { data: 'b' }));
      transport.injectMessage(makeSuccessResponse(id1, { data: 'a' }));

      const result1 = await promise1;
      const result2 = await promise2;

      expect(result1).toEqual({ data: 'a' });
      expect(result2).toEqual({ data: 'b' });
    });

    it('generates unique UUID IDs for each request', async () => {
      const p1 = engine.sendRequest('droid.method_a', {});
      const p2 = engine.sendRequest('droid.method_b', {});
      const p3 = engine.sendRequest('droid.method_c', {});

      const ids = transport.sentMessages.map(
        (m) => (m as Record<string, unknown>)['id'] as string
      );

      expect(new Set(ids).size).toBe(3);

      for (const id of ids) {
        transport.injectMessage(makeSuccessResponse(id));
      }
      await Promise.all([p1, p2, p3]);
    });
  });

  describe('notification dispatch (VAL-PROTOCOL-002)', () => {
    it('dispatches notifications to all registered listeners', () => {
      const received1: Record<string, unknown>[] = [];
      const received2: Record<string, unknown>[] = [];

      engine.onNotification((n) => received1.push(n));
      engine.onNotification((n) => received2.push(n));

      const notification = makeNotification(
        DroidClientMethod.SESSION_NOTIFICATION,
        {
          notification: {
            type: 'assistant_text_delta',
            messageId: 'msg-1',
            blockIndex: 0,
            textDelta: 'Hello',
          },
        }
      );

      transport.injectMessage(notification);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
      expect(received1[0]).toEqual(notification);
    });

    it('filters notifications by type when filter is provided', () => {
      const received: Record<string, unknown>[] = [];

      engine.onNotification((n) => received.push(n), {
        type: 'assistant_text_delta',
      });

      transport.injectMessage(
        makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
          notification: {
            type: 'assistant_text_delta',
            messageId: 'm1',
            blockIndex: 0,
            textDelta: 'hi',
          },
        })
      );

      transport.injectMessage(
        makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
          notification: {
            type: 'tool_result',
            messageId: 'm2',
            toolUseId: 't1',
          },
        })
      );

      expect(received).toHaveLength(1);
      const inner = (received[0]['params'] as Record<string, unknown>)[
        'notification'
      ] as Record<string, unknown>;
      expect(inner['type']).toBe('assistant_text_delta');
    });

    it('unsubscribe function removes listener', () => {
      const received: Record<string, unknown>[] = [];
      const unsub = engine.onNotification((n) => received.push(n));

      transport.injectMessage(
        makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
          notification: { type: 'assistant_text_delta' },
        })
      );

      expect(received).toHaveLength(1);

      unsub();

      transport.injectMessage(
        makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
          notification: { type: 'assistant_text_delta' },
        })
      );

      expect(received).toHaveLength(1);
    });

    it('double-unsubscribe is safe (no-op)', () => {
      const unsub = engine.onNotification(() => {});
      unsub();
      expect(() => unsub()).not.toThrow();
    });

    it('listener exception does not crash engine or affect other listeners', () => {
      const received: Record<string, unknown>[] = [];

      engine.onNotification(() => {
        throw new Error('boom');
      });
      engine.onNotification((n) => received.push(n));

      transport.injectMessage(
        makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
          notification: { type: 'assistant_text_delta' },
        })
      );

      expect(received).toHaveLength(1);
    });
  });

  describe('request timeout (VAL-PROTOCOL-003)', () => {
    it('rejects with TimeoutError after configured duration', async () => {
      vi.useFakeTimers();

      try {
        const promise = engine.sendRequest('droid.slow_method', {}, 100);

        vi.advanceTimersByTime(101);

        await expect(promise).rejects.toThrow(TimeoutError);
        await expect(promise).rejects.toThrow(/timed out after 100ms/);
      } finally {
        vi.useRealTimers();
      }
    });

    it('uses default timeout when none specified', async () => {
      vi.useFakeTimers();

      try {
        const shortEngine = new ProtocolEngine({
          transport,
          defaultTimeout: 50,
        });

        const promise = shortEngine.sendRequest('droid.method', {});

        vi.advanceTimersByTime(51);

        await expect(promise).rejects.toThrow(TimeoutError);

        await shortEngine.close();
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not reject if response arrives before timeout', async () => {
      vi.useFakeTimers();

      try {
        const promise = engine.sendRequest('droid.method', {}, 500);

        const id = (transport.sentMessages[0] as Record<string, unknown>)[
          'id'
        ] as string;

        vi.advanceTimersByTime(10);
        transport.injectMessage(makeSuccessResponse(id, { ok: true }));

        const result = await promise;
        expect(result).toEqual({ ok: true });

        vi.advanceTimersByTime(500);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('server→client request handling (VAL-PROTOCOL-004)', () => {
    describe('permission requests', () => {
      it('invokes registered permission handler and sends response', async () => {
        engine.setPermissionHandler(
          (_params) => ToolConfirmationOutcome.ProceedOnce
        );

        transport.injectMessage(
          makeServerRequest('perm-1', DroidClientMethod.REQUEST_PERMISSION, {
            toolUses: [],
            options: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['type']).toBe('response');
        expect(response['id']).toBe('perm-1');
        expect(response['result']).toEqual({
          selectedOption: ToolConfirmationOutcome.ProceedOnce,
        });
      });

      it('sends cancel when no permission handler registered', async () => {
        transport.injectMessage(
          makeServerRequest('perm-2', DroidClientMethod.REQUEST_PERMISSION, {
            toolUses: [],
            options: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['result']).toEqual({
          selectedOption: ToolConfirmationOutcome.Cancel,
        });
      });

      it('sends error response when permission handler throws', async () => {
        engine.setPermissionHandler(() => {
          throw new Error('handler failure');
        });

        transport.injectMessage(
          makeServerRequest('perm-3', DroidClientMethod.REQUEST_PERMISSION, {
            toolUses: [],
            options: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['id']).toBe('perm-3');
        expect(response['error']).toBeDefined();
        const error = response['error'] as Record<string, unknown>;
        expect(error['code']).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect(error['message']).toBe('Failed to handle permission request');
      });

      it('supports async permission handler', async () => {
        engine.setPermissionHandler(async () => {
          return ToolConfirmationOutcome.ProceedAlways;
        });

        transport.injectMessage(
          makeServerRequest('perm-4', DroidClientMethod.REQUEST_PERMISSION, {
            toolUses: [],
            options: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['result']).toEqual({
          selectedOption: ToolConfirmationOutcome.ProceedAlways,
        });
      });

      it('supports permission handler results with comments', async () => {
        engine.setPermissionHandler(() => ({
          selectedOption: ToolConfirmationOutcome.ProceedOnce,
          comment: 'Looks good, implement it.',
        }));

        transport.injectMessage(
          makeServerRequest('perm-5', DroidClientMethod.REQUEST_PERMISSION, {
            toolUses: [],
            options: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['result']).toEqual({
          selectedOption: ToolConfirmationOutcome.ProceedOnce,
          comment: 'Looks good, implement it.',
        });
      });

      it('supports new-session outcomes in permission handler', async () => {
        engine.setPermissionHandler(
          () => ToolConfirmationOutcome.ProceedNewSessionHigh
        );

        transport.injectMessage(
          makeServerRequest('perm-6', DroidClientMethod.REQUEST_PERMISSION, {
            toolUses: [],
            options: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['result']).toEqual({
          selectedOption: ToolConfirmationOutcome.ProceedNewSessionHigh,
        });
      });
    });

    describe('ask-user requests', () => {
      it('invokes registered ask-user handler and sends response', async () => {
        engine.setAskUserHandler((_params) => ({
          cancelled: false,
          answers: [{ index: 0, question: 'q?', answer: 'a' }],
        }));

        transport.injectMessage(
          makeServerRequest('ask-1', DroidClientMethod.ASK_USER, {
            toolCallId: 'tc-1',
            questions: [
              { index: 0, topic: 't', question: 'q?', options: ['a', 'b'] },
            ],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['type']).toBe('response');
        expect(response['id']).toBe('ask-1');
        expect(response['result']).toEqual({
          cancelled: false,
          answers: [{ index: 0, question: 'q?', answer: 'a' }],
        });
      });

      it('sends cancelled when no ask-user handler registered', async () => {
        transport.injectMessage(
          makeServerRequest('ask-2', DroidClientMethod.ASK_USER, {
            toolCallId: 'tc-1',
            questions: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['result']).toEqual({
          cancelled: true,
          answers: [],
        });
      });

      it('sends error response when ask-user handler throws', async () => {
        engine.setAskUserHandler(() => {
          throw new Error('ask failure');
        });

        transport.injectMessage(
          makeServerRequest('ask-3', DroidClientMethod.ASK_USER, {
            toolCallId: 'tc-1',
            questions: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['error']).toBeDefined();
        const error = response['error'] as Record<string, unknown>;
        expect(error['code']).toBe(JsonRpcErrorCode.INTERNAL_ERROR);
        expect(error['message']).toBe('Failed to handle ask-user request');
      });

      it('supports async ask-user handler', async () => {
        engine.setAskUserHandler(async () => ({
          cancelled: false,
          answers: [],
        }));

        transport.injectMessage(
          makeServerRequest('ask-4', DroidClientMethod.ASK_USER, {
            toolCallId: 'tc-1',
            questions: [],
          })
        );

        await vi.waitFor(() => {
          expect(transport.sentMessages).toHaveLength(1);
        });

        const response = transport.sentMessages[0] as Record<string, unknown>;
        expect(response['result']).toEqual({
          cancelled: false,
          answers: [],
        });
      });
    });
  });

  describe('sticky transport error (VAL-PROTOCOL-005)', () => {
    it('rejects all pending requests when transport error occurs', async () => {
      const p1 = engine.sendRequest('droid.method_a', {});
      const p2 = engine.sendRequest('droid.method_b', {});

      transport.injectError(new Error('process crashed'));

      await expect(p1).rejects.toThrow(ConnectionError);
      await expect(p1).rejects.toThrow(/Transport error/);
      await expect(p2).rejects.toThrow(ConnectionError);
    });

    it('subsequent sendRequest() throws immediately after transport error', async () => {
      transport.injectError(new Error('disconnected'));

      await expect(engine.sendRequest('droid.method', {})).rejects.toThrow(
        ConnectionError
      );
      await expect(engine.sendRequest('droid.method', {})).rejects.toThrow(
        /Transport error/
      );
    });

    it("transport error is sticky — doesn't clear after first rejection", async () => {
      transport.injectError(new Error('gone'));

      await expect(engine.sendRequest('droid.a', {})).rejects.toThrow(
        ConnectionError
      );
      await expect(engine.sendRequest('droid.b', {})).rejects.toThrow(
        ConnectionError
      );
      await expect(engine.sendRequest('droid.c', {})).rejects.toThrow(
        ConnectionError
      );
    });
  });

  describe('error code mapping (VAL-PROTOCOL-006)', () => {
    it('maps ENTITY_NOT_FOUND to SessionNotFoundError', async () => {
      const promise = engine.sendRequest('droid.load_session', {
        sessionId: 'sess-123',
      });

      const id = (transport.sentMessages[0] as Record<string, unknown>)[
        'id'
      ] as string;

      transport.injectMessage(
        makeErrorResponse(
          id,
          JsonRpcErrorCode.ENTITY_NOT_FOUND,
          'Session not found'
        )
      );

      await expect(promise).rejects.toThrow(SessionNotFoundError);
    });

    it('maps other error codes to ProtocolError', async () => {
      const promise = engine.sendRequest('droid.method', {});

      const id = (transport.sentMessages[0] as Record<string, unknown>)[
        'id'
      ] as string;

      transport.injectMessage(
        makeErrorResponse(
          id,
          JsonRpcErrorCode.INVALID_PARAMS,
          'Invalid params',
          { detail: 'missing field' }
        )
      );

      const error = await promise.catch((e: Error) => e);
      expect(error).toBeInstanceOf(ProtocolError);
      expect((error as ProtocolError).code).toBe(
        JsonRpcErrorCode.INVALID_PARAMS
      );
      expect((error as ProtocolError).data).toEqual({
        detail: 'missing field',
      });
    });
  });

  describe('unknown/duplicate response IDs (VAL-PROTOCOL-007)', () => {
    it('ignores response with unknown ID without throwing', () => {
      expect(() => {
        transport.injectMessage(
          makeSuccessResponse('unknown-id', { data: 'stale' })
        );
      }).not.toThrow();
    });

    it('ignores duplicate response for already-resolved request', async () => {
      const promise = engine.sendRequest('droid.method', {});

      const id = (transport.sentMessages[0] as Record<string, unknown>)[
        'id'
      ] as string;

      transport.injectMessage(makeSuccessResponse(id, { first: true }));

      const result = await promise;
      expect(result).toEqual({ first: true });

      expect(() => {
        transport.injectMessage(makeSuccessResponse(id, { second: true }));
      }).not.toThrow();
    });

    it('ignores response with null ID', () => {
      expect(() => {
        transport.injectMessage(
          makeErrorResponse(
            null,
            JsonRpcErrorCode.INTERNAL_ERROR,
            'server error'
          )
        );
      }).not.toThrow();
    });
  });

  describe('closed engine (VAL-PROTOCOL-008)', () => {
    it('rejects new sendRequest() after close()', async () => {
      await engine.close();

      await expect(engine.sendRequest('droid.method', {})).rejects.toThrow(
        ConnectionError
      );
      await expect(engine.sendRequest('droid.method', {})).rejects.toThrow(
        /closed/
      );
    });

    it('rejects all pending requests on close()', async () => {
      const p1 = engine.sendRequest('droid.method_a', {});
      const p2 = engine.sendRequest('droid.method_b', {});

      await engine.close();

      await expect(p1).rejects.toThrow(ConnectionError);
      await expect(p1).rejects.toThrow(/closed/);
      await expect(p2).rejects.toThrow(ConnectionError);
    });

    it('close() is idempotent', async () => {
      await engine.close();
      await expect(engine.close()).resolves.toBeUndefined();
    });

    it('close() clears notification listeners', async () => {
      const received: Record<string, unknown>[] = [];
      engine.onNotification((n) => received.push(n));

      await engine.close();

      transport.injectMessage(
        makeNotification(DroidClientMethod.SESSION_NOTIFICATION, {
          notification: { type: 'assistant_text_delta' },
        })
      );

      expect(received).toHaveLength(0);
    });
  });

  describe('unknown server→client request method', () => {
    it('unknown method is silently ignored without sending a response', () => {
      const sentBefore = transport.sentMessages.length;

      transport.injectMessage(
        makeServerRequest('unknown-req-1', 'droid.unknown_method', {
          foo: 'bar',
        })
      );

      expect(transport.sentMessages.length).toBe(sentBefore);
    });

    it('does not throw or affect subsequent requests', async () => {
      transport.injectMessage(
        makeServerRequest('unknown-req-2', 'droid.nonexistent', {})
      );

      const promise = engine.sendRequest('droid.method', {});
      const id = (transport.sentMessages[0] as Record<string, unknown>)[
        'id'
      ] as string;
      transport.injectMessage(makeSuccessResponse(id, { ok: true }));

      const result = await promise;
      expect(result).toEqual({ ok: true });
    });
  });

  describe('_sendResponse failure is silently caught', () => {
    it('does not throw when transport.send() fails during permission response', async () => {
      const transport2 = new InMemoryTransport();
      await transport2.connect();
      const engine2 = new ProtocolEngine({ transport: transport2 });

      engine2.setPermissionHandler(() => ToolConfirmationOutcome.ProceedOnce);

      transport2.send = () => {
        throw new Error('EPIPE: broken pipe');
      };

      transport2.injectMessage(
        makeServerRequest('perm-fail-1', DroidClientMethod.REQUEST_PERMISSION, {
          toolUses: [],
        })
      );

      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });

      // The broken transport.send must not surface as an unhandled rejection.
      await expect(engine2.close()).resolves.toBeUndefined();
    });
  });

  describe('isHealthy getter', () => {
    it('returns true when engine is healthy', () => {
      expect(engine.isHealthy).toBe(true);
    });

    it('returns false after transport error', () => {
      transport.injectError(new Error('disconnected'));
      expect(engine.isHealthy).toBe(false);
    });

    it('returns false after close()', async () => {
      await engine.close();
      expect(engine.isHealthy).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles send failure by rejecting the pending request', async () => {
      await transport.close();

      await expect(engine.sendRequest('droid.method', {})).rejects.toThrow(
        ConnectionError
      );
      await expect(engine.sendRequest('droid.method', {})).rejects.toThrow(
        /Failed to send/
      );
    });

    it('clearPermissionHandler restores default cancel behavior', async () => {
      engine.setPermissionHandler(() => ToolConfirmationOutcome.ProceedOnce);
      engine.clearPermissionHandler();

      transport.injectMessage(
        makeServerRequest('perm-clear', DroidClientMethod.REQUEST_PERMISSION, {
          toolUses: [],
          options: [],
        })
      );

      await vi.waitFor(() => {
        expect(transport.sentMessages).toHaveLength(1);
      });

      const response = transport.sentMessages[0] as Record<string, unknown>;
      expect(response['result']).toEqual({
        selectedOption: ToolConfirmationOutcome.Cancel,
      });
    });

    it('clearAskUserHandler restores default cancelled behavior', async () => {
      engine.setAskUserHandler(() => ({
        cancelled: false,
        answers: [],
      }));
      engine.clearAskUserHandler();

      transport.injectMessage(
        makeServerRequest('ask-clear', DroidClientMethod.ASK_USER, {
          toolCallId: 'tc-1',
          questions: [],
        })
      );

      await vi.waitFor(() => {
        expect(transport.sentMessages).toHaveLength(1);
      });

      const response = transport.sentMessages[0] as Record<string, unknown>;
      expect(response['result']).toEqual({
        cancelled: true,
        answers: [],
      });
    });

    it('notification without params.notification.type still dispatches to unfiltered listeners', () => {
      const received: Record<string, unknown>[] = [];
      engine.onNotification((n) => received.push(n));

      transport.injectMessage({
        jsonrpc: JSONRPC_VERSION,
        factoryApiVersion: LEGACY_FACTORY_API_VERSION,
        type: 'notification',
        method: 'some.method',
        params: { raw: 'data' },
      });

      expect(received).toHaveLength(1);
    });

    it('filtered listener does not receive notifications without matching type', () => {
      const received: Record<string, unknown>[] = [];
      engine.onNotification((n) => received.push(n), { type: 'specific_type' });

      transport.injectMessage({
        jsonrpc: JSONRPC_VERSION,
        factoryApiVersion: LEGACY_FACTORY_API_VERSION,
        type: 'notification',
        method: 'some.method',
        params: {},
      });

      expect(received).toHaveLength(0);
    });

    it('handles well-formed notification with all required fields', () => {
      const received: Record<string, unknown>[] = [];
      engine.onNotification((n) => received.push(n));

      transport.injectMessage({
        jsonrpc: JSONRPC_VERSION,
        factoryApiVersion: LEGACY_FACTORY_API_VERSION,
        type: 'notification',
        method: 'some.notification',
        params: { notification: { type: 'test' } },
      });

      expect(received).toHaveLength(1);
    });

    it('response envelope includes factory protocol fields', async () => {
      engine.setPermissionHandler(() => ToolConfirmationOutcome.ProceedOnce);

      transport.injectMessage(
        makeServerRequest('perm-env', DroidClientMethod.REQUEST_PERMISSION, {
          toolUses: [],
          options: [],
        })
      );

      await vi.waitFor(() => {
        expect(transport.sentMessages).toHaveLength(1);
      });

      const response = transport.sentMessages[0] as Record<string, unknown>;
      expect(response['jsonrpc']).toBe(JSONRPC_VERSION);
      expect(response['factoryApiVersion']).toBe(LEGACY_FACTORY_API_VERSION);
      expect(response['factoryProtocolVersion']).toBe(FACTORY_PROTOCOL_VERSION);
    });
  });

  describe('serverRequestMethodMap', () => {
    it('dispatches permission requests using custom method map', async () => {
      const customTransport = new InMemoryTransport();
      await customTransport.connect();
      const customEngine = new ProtocolEngine({
        transport: customTransport,
        serverRequestMethodMap: {
          'daemon.request_permission': ServerRequestHandlerType.Permission,
          'daemon.ask_user': ServerRequestHandlerType.AskUser,
        },
      });

      const handler = vi.fn().mockReturnValue({
        selectedOption: ToolConfirmationOutcome.ProceedOnce,
      });
      customEngine.setPermissionHandler(handler);

      customTransport.injectMessage({
        jsonrpc: JSONRPC_VERSION,
        factoryApiVersion: LEGACY_FACTORY_API_VERSION,
        factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
        type: 'request',
        id: 'perm-1',
        method: 'daemon.request_permission',
        params: {
          toolUses: [
            {
              toolUse: {
                type: 'tool_use',
                id: 'tu1',
                name: 'Execute',
                input: { command: 'ls' },
              },
              confirmationType: 'exec',
              details: {
                type: 'exec',
                fullCommand: 'ls',
                command: 'ls',
              },
            },
          ],
          options: [
            { label: 'Allow', value: 'proceed_once' },
            { label: 'Deny', value: 'cancel' },
          ],
        },
      });

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledOnce();
      });

      await customEngine.close();
    });

    it('dispatches ask-user requests using custom method map', async () => {
      const customTransport = new InMemoryTransport();
      await customTransport.connect();
      const customEngine = new ProtocolEngine({
        transport: customTransport,
        serverRequestMethodMap: {
          'daemon.request_permission': ServerRequestHandlerType.Permission,
          'daemon.ask_user': ServerRequestHandlerType.AskUser,
        },
      });

      const handler = vi.fn().mockReturnValue({
        cancelled: false,
        answers: [{ index: 0, question: 'Pick one', answer: 'A' }],
      });
      customEngine.setAskUserHandler(handler);

      customTransport.injectMessage({
        jsonrpc: JSONRPC_VERSION,
        factoryApiVersion: LEGACY_FACTORY_API_VERSION,
        factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
        type: 'request',
        id: 'ask-1',
        method: 'daemon.ask_user',
        params: {
          toolCallId: 'tc1',
          questions: [
            {
              index: 0,
              topic: 'Test',
              question: 'Pick one',
              options: ['A', 'B'],
            },
          ],
        },
      });

      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalledOnce();
      });

      await customEngine.close();
    });

    it('sends method as-is on the wire (no remapping)', async () => {
      const customTransport = new InMemoryTransport();
      await customTransport.connect();
      const customEngine = new ProtocolEngine({
        transport: customTransport,
        serverRequestMethodMap: {
          'daemon.request_permission': ServerRequestHandlerType.Permission,
          'daemon.ask_user': ServerRequestHandlerType.AskUser,
        },
      });

      const promise = customEngine.sendRequest('daemon.initialize_session', {
        cwd: '.',
      });

      const sent = customTransport.sentMessages[0] as Record<string, unknown>;
      expect(sent['method']).toBe('daemon.initialize_session');

      const id = sent['id'] as string;
      customTransport.injectMessage(
        makeSuccessResponse(id, { sessionId: 'x' })
      );
      await promise;

      await customEngine.close();
    });

    it('ignores server requests with unmapped methods', async () => {
      const customTransport = new InMemoryTransport();
      await customTransport.connect();
      const customEngine = new ProtocolEngine({
        transport: customTransport,
        serverRequestMethodMap: {},
      });

      const permHandler = vi.fn();
      const askHandler = vi.fn();
      customEngine.setPermissionHandler(permHandler);
      customEngine.setAskUserHandler(askHandler);

      customTransport.injectMessage({
        jsonrpc: JSONRPC_VERSION,
        factoryApiVersion: LEGACY_FACTORY_API_VERSION,
        factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
        type: 'request',
        id: 'perm-1',
        method: 'droid.request_permission',
        params: {},
      });

      // Give time for any async dispatch
      await new Promise((r) => {
        setTimeout(r, 50);
      });
      expect(permHandler).not.toHaveBeenCalled();
      expect(askHandler).not.toHaveBeenCalled();

      await customEngine.close();
    });
  });
});
