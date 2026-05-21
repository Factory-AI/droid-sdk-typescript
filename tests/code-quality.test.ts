import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { dispatchNotification } from '../src/protocol.js';
import type { NotificationListener } from '../src/protocol.js';
import { SessionNotificationType } from '../src/schemas/enums.js';
import {
  createResponseSchema,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  FACTORY_PROTOCOL_VERSION,
  InitializeSessionResponseSchema,
  CloseSessionResponseSchema,
  ListSkillsResponseSchema,
} from '../src/schemas/index.js';
import { makeSessionNotification } from './helpers.js';

const envelope = {
  jsonrpc: JSONRPC_VERSION,
  factoryApiVersion: LEGACY_FACTORY_API_VERSION,
  factoryProtocolVersion: FACTORY_PROTOCOL_VERSION,
  type: 'response' as const,
};

describe('createResponseSchema', () => {
  const TestResultSchema = z.object({ value: z.string() }).strict();
  const TestResponseSchema = createResponseSchema(TestResultSchema);

  it('accepts a valid success response', () => {
    const input = {
      ...envelope,
      id: 'req-1',
      result: { value: 'hello' },
    };
    const parsed = TestResponseSchema.parse(input);
    expect(parsed).toHaveProperty('result');
    expect((parsed as { result: { value: string } }).result.value).toBe(
      'hello'
    );
  });

  it('accepts a valid failure response', () => {
    const input = {
      ...envelope,
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    };
    const parsed = TestResponseSchema.parse(input);
    expect(parsed).toHaveProperty('error');
  });

  it('rejects a response with wrong result shape', () => {
    const input = {
      ...envelope,
      id: 'req-2',
      result: { wrong: 123 },
    };
    const result = TestResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('rejects a response missing both result and error', () => {
    const input = {
      ...envelope,
      id: 'req-3',
    };
    const result = TestResponseSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('produces identical parse results to hand-written schemas', () => {
    const successInput = {
      ...envelope,
      id: 'req-4',
      result: {
        sessionId: 'sess-1',
        session: {},
        settings: { modelId: 'test', reasoningEffort: 'medium' },
      },
    };

    const factoryResult =
      InitializeSessionResponseSchema.safeParse(successInput);
    expect(factoryResult.success).toBe(true);

    const failureInput = {
      ...envelope,
      id: null,
      error: { code: -32603, message: 'Internal error' },
    };
    const factoryFailResult =
      InitializeSessionResponseSchema.safeParse(failureInput);
    expect(factoryFailResult.success).toBe(true);
  });

  it('factory-generated schemas reject malformed responses', () => {
    const malformed = {
      ...envelope,
      id: 'req-5',
      result: 'not-an-object',
    };

    expect(CloseSessionResponseSchema.safeParse(malformed).success).toBe(false);
    expect(ListSkillsResponseSchema.safeParse(malformed).success).toBe(false);
  });
});

describe('dispatchNotification', () => {
  it('dispatches to all listeners when no filter is set', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    const listeners: NotificationListener[] = [
      { callback: callback1 },
      { callback: callback2 },
    ];

    const notification = makeSessionNotification(
      SessionNotificationType.ERROR,
      { message: 'test', errorType: 'Error', timestamp: '2024-01-01' }
    );

    dispatchNotification(notification, listeners);

    expect(callback1).toHaveBeenCalledOnce();
    expect(callback2).toHaveBeenCalledOnce();
    expect(callback1).toHaveBeenCalledWith(notification);
  });

  it('filters listeners by notification type', () => {
    const errorCallback = vi.fn();
    const stateCallback = vi.fn();
    const listeners: NotificationListener[] = [
      {
        callback: errorCallback,
        filter: { type: SessionNotificationType.ERROR },
      },
      {
        callback: stateCallback,
        filter: { type: SessionNotificationType.DROID_WORKING_STATE_CHANGED },
      },
    ];

    const notification = makeSessionNotification(
      SessionNotificationType.ERROR,
      { message: 'test', errorType: 'Error', timestamp: '2024-01-01' }
    );

    dispatchNotification(notification, listeners);

    expect(errorCallback).toHaveBeenCalledOnce();
    expect(stateCallback).not.toHaveBeenCalled();
  });

  it('does not crash when a listener throws', () => {
    const throwingCallback = vi.fn(() => {
      throw new Error('listener error');
    });
    const normalCallback = vi.fn();
    const listeners: NotificationListener[] = [
      { callback: throwingCallback },
      { callback: normalCallback },
    ];

    const notification = makeSessionNotification(
      SessionNotificationType.ERROR,
      { message: 'test', errorType: 'Error', timestamp: '2024-01-01' }
    );

    expect(() => dispatchNotification(notification, listeners)).not.toThrow();
    expect(throwingCallback).toHaveBeenCalledOnce();
    expect(normalCallback).toHaveBeenCalledOnce();
  });

  it('handles notifications without parseable params', () => {
    const callback = vi.fn();
    const listeners: NotificationListener[] = [{ callback }];
    const notification = { method: 'some.method', params: { bad: 'data' } };

    dispatchNotification(notification, listeners);

    expect(callback).toHaveBeenCalledOnce();
  });

  it('skips filtered listeners for unparseable notifications', () => {
    const filteredCallback = vi.fn();
    const unfilteredCallback = vi.fn();
    const listeners: NotificationListener[] = [
      { callback: filteredCallback, filter: { type: 'some_type' } },
      { callback: unfilteredCallback },
    ];

    const notification = { method: 'some.method', params: {} };

    dispatchNotification(notification, listeners);

    expect(filteredCallback).not.toHaveBeenCalled();
    expect(unfilteredCallback).toHaveBeenCalledOnce();
  });
});
