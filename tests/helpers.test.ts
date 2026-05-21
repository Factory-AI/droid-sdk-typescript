/**
 * Unit tests for src/helpers.ts.
 *
 * Covers wireAbortSignal, extractInnerNotification, MessageBridge,
 * createTransport, setupClientHandlers, buildInitParams, and closeQuietly.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DroidClient } from '../src/client.js';
import { SDK_TAG } from '../src/constants.js';
import {
  buildInitParams,
  closeQuietly,
  createTransport,
  extractInnerNotification,
  MessageBridge,
  setupClientHandlers,
  wireAbortSignal,
} from '../src/helpers.js';
import {
  DroidClientMethod,
  DroidWorkingState,
  FACTORY_PROTOCOL_VERSION,
  JSONRPC_VERSION,
  LEGACY_FACTORY_API_VERSION,
  SessionNotificationType,
  ToolConfirmationOutcome,
} from '../src/schemas/index.js';
import { InMemoryTransport } from './helpers.js';

/** Build a valid session notification envelope for MessageBridge tests. */
function makeSessionNotification(
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

describe('wireAbortSignal', () => {
  it('does not throw when signal is undefined', () => {
    const callback = vi.fn();
    expect(() => wireAbortSignal(undefined, callback)).not.toThrow();
    expect(callback).not.toHaveBeenCalled();
  });

  it('fires callback immediately when signal is already aborted', () => {
    const controller = new AbortController();
    controller.abort();
    const callback = vi.fn();

    wireAbortSignal(controller.signal, callback);

    expect(callback).toHaveBeenCalledOnce();
  });

  it('fires callback when signal is aborted later', () => {
    const controller = new AbortController();
    const callback = vi.fn();

    wireAbortSignal(controller.signal, callback);
    expect(callback).not.toHaveBeenCalled();

    controller.abort();
    expect(callback).toHaveBeenCalledOnce();
  });

  it('fires callback only once (event listener uses { once: true })', () => {
    const controller = new AbortController();
    const callback = vi.fn();

    wireAbortSignal(controller.signal, callback);
    controller.abort();

    // AbortController can only be aborted once anyway, but verify callback ran once
    expect(callback).toHaveBeenCalledOnce();
  });
});

describe('extractInnerNotification', () => {
  it('returns the inner notification payload from a valid notification', () => {
    const notification = makeSessionNotification(
      SessionNotificationType.DROID_WORKING_STATE_CHANGED,
      { newState: DroidWorkingState.StreamingAssistantMessage }
    );

    const result = extractInnerNotification(notification);

    expect(result).not.toBeNull();
    expect(result!.type).toBe(
      SessionNotificationType.DROID_WORKING_STATE_CHANGED
    );
  });

  it('returns null for an empty object', () => {
    expect(extractInnerNotification({})).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractInnerNotification(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractInnerNotification(undefined)).toBeNull();
  });

  it('returns null when params exists but notification is missing', () => {
    const notification = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      type: 'notification',
      method: DroidClientMethod.SESSION_NOTIFICATION,
      params: {},
    };
    expect(extractInnerNotification(notification)).toBeNull();
  });

  it('returns null when method does not match', () => {
    const notification = {
      jsonrpc: JSONRPC_VERSION,
      factoryApiVersion: LEGACY_FACTORY_API_VERSION,
      type: 'notification',
      method: 'some.other.method',
      params: {
        notification: { type: 'working_state_changed', state: 'idle' },
      },
    };
    expect(extractInnerNotification(notification)).toBeNull();
  });
});

describe('MessageBridge', () => {
  let bridge: MessageBridge;

  beforeEach(() => {
    bridge = new MessageBridge();
  });

  it('processes notifications and yields messages via messages() generator', async () => {
    bridge = new MessageBridge(undefined, { includePartialMessages: true });
    bridge.notificationHandler(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.StreamingAssistantMessage }
      ) as Record<string, unknown>
    );

    bridge.signalDone();

    const messages = [];
    for await (const msg of bridge.messages()) {
      messages.push(msg);
    }

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.some((m) => m.type === 'working_state_changed')).toBe(true);
  });

  it('passes configured sessionId to converted messages', async () => {
    bridge = new MessageBridge(undefined, {
      includePartialMessages: true,
      sessionId: 'sess-bridge',
    });
    bridge.notificationHandler(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.StreamingAssistantMessage }
      ) as Record<string, unknown>
    );

    bridge.signalDone();

    const messages = [];
    for await (const msg of bridge.messages()) {
      messages.push(msg);
    }

    expect(messages[0]).toMatchObject({
      type: 'working_state_changed',
      sessionId: 'sess-bridge',
    });
  });

  it('terminates generator on result message', async () => {
    // Transition to streaming state then back to idle to trigger result
    bridge.notificationHandler(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.StreamingAssistantMessage }
      ) as Record<string, unknown>
    );

    bridge.notificationHandler(
      makeSessionNotification(
        SessionNotificationType.DROID_WORKING_STATE_CHANGED,
        { newState: DroidWorkingState.Idle }
      ) as Record<string, unknown>
    );

    const messages = [];
    for await (const msg of bridge.messages()) {
      messages.push(msg);
      if (msg.type === 'result') {
        break;
      }
    }

    expect(messages.some((m) => m.type === 'result')).toBe(true);
  });

  it('signalDone() terminates the generator when queue is empty', async () => {
    // Signal done immediately with no messages queued
    bridge.signalDone();

    const messages = [];
    for await (const msg of bridge.messages()) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(0);
  });

  it('notificationHandler is a bound function that can be called directly', () => {
    const handler = bridge.notificationHandler;

    // Calling the handler directly (detached) should not throw
    expect(() => {
      handler(
        makeSessionNotification('working_state_changed', {
          state: 'streaming_assistant_message',
        }) as Record<string, unknown>
      );
    }).not.toThrow();
  });

  it('ignores notifications that fail to parse', async () => {
    // Pass an invalid notification (no proper envelope)
    bridge.notificationHandler({ garbage: true } as Record<string, unknown>);

    bridge.signalDone();

    const messages = [];
    for await (const msg of bridge.messages()) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(0);
  });
});

describe('createTransport', () => {
  it('returns custom transport when provided (no subprocess spawned)', async () => {
    const customTransport = new InMemoryTransport();
    await customTransport.connect();

    const result = await createTransport({ transport: customTransport });

    expect(result).toBe(customTransport);
    expect(result.isConnected).toBe(true);
  });

  it('returns the exact same transport instance that was provided', async () => {
    const customTransport = new InMemoryTransport();

    const result = await createTransport({ transport: customTransport });

    expect(result).toStrictEqual(customTransport);
  });
});

describe('setupClientHandlers', () => {
  let client: DroidClient;
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    client = new DroidClient({ transport });
  });

  afterEach(async () => {
    await client.close();
  });

  it('sets permission handler on client when provided', () => {
    const permissionHandler = vi
      .fn()
      .mockReturnValue(ToolConfirmationOutcome.ProceedOnce);
    const spy = vi.spyOn(client, 'setPermissionHandler');

    setupClientHandlers(client, { permissionHandler });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(permissionHandler);
  });

  it('sets ask-user handler on client when provided', () => {
    const askUserHandler = vi
      .fn()
      .mockReturnValue({ cancelled: true, answers: [] });
    const spy = vi.spyOn(client, 'setAskUserHandler');

    setupClientHandlers(client, { askUserHandler });

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith(askUserHandler);
  });

  it('sets both handlers when both are provided', () => {
    const permissionHandler = vi.fn();
    const askUserHandler = vi.fn();
    const permSpy = vi.spyOn(client, 'setPermissionHandler');
    const askSpy = vi.spyOn(client, 'setAskUserHandler');

    setupClientHandlers(client, { permissionHandler, askUserHandler });

    expect(permSpy).toHaveBeenCalledOnce();
    expect(askSpy).toHaveBeenCalledOnce();
  });

  it('does not set handlers when not provided (no-op)', () => {
    const permSpy = vi.spyOn(client, 'setPermissionHandler');
    const askSpy = vi.spyOn(client, 'setAskUserHandler');

    setupClientHandlers(client, {});

    expect(permSpy).not.toHaveBeenCalled();
    expect(askSpy).not.toHaveBeenCalled();
  });
});

describe('buildInitParams', () => {
  it('uses default values for machineId and cwd', () => {
    const params = buildInitParams({});

    expect(params.machineId).toBe('default');
    expect(params.cwd).toBe('.');
  });

  it('passes through all optional fields when provided', () => {
    const params = buildInitParams({
      cwd: '/my/project',
      machineId: 'custom-machine',
      modelId: 'claude-sonnet-4-20250514',
      autonomyLevel: 'medium' as never,
      interactionMode: 'auto' as never,
      reasoningEffort: 'high' as never,
      specModeModelId: 'claude-opus-4-20250514',
      specModeReasoningEffort: 'max' as never,
      enabledToolIds: ['Read', 'Grep'],
      disabledToolIds: ['Execute'],
      mcpServers: [
        {
          name: 'test-server',
          type: 'http' as never,
          url: 'http://example.com',
          headers: [],
        },
      ],
    });

    expect(params.machineId).toBe('custom-machine');
    expect(params.cwd).toBe('/my/project');
    expect(params.modelId).toBe('claude-sonnet-4-20250514');
    expect(params.autonomyLevel).toBe('medium');
    expect(params.interactionMode).toBe('auto');
    expect(params.reasoningEffort).toBe('high');
    expect(params.specModeModelId).toBe('claude-opus-4-20250514');
    expect(params.specModeReasoningEffort).toBe('max');
    expect(params.enabledToolIds).toEqual(['Read', 'Grep']);
    expect(params.disabledToolIds).toEqual(['Execute']);
    expect(params.mcpServers).toHaveLength(1);
  });

  it('always appends SDK_TAG to tags array', () => {
    const params = buildInitParams({});

    expect(params.tags).toEqual([SDK_TAG]);
  });

  it('merges user-provided tags with SDK_TAG', () => {
    const userTag = { name: 'environment', metadata: { value: 'production' } };
    const params = buildInitParams({
      tags: [userTag],
    });

    expect(params.tags).toHaveLength(2);
    expect(params.tags![0]).toEqual(userTag);
    expect(params.tags![1]).toEqual(SDK_TAG);
  });

  it('does not include optional fields when they are undefined', () => {
    const params = buildInitParams({});

    expect(params).not.toHaveProperty('modelId');
    expect(params).not.toHaveProperty('autonomyLevel');
    expect(params).not.toHaveProperty('interactionMode');
    expect(params).not.toHaveProperty('reasoningEffort');
    expect(params).not.toHaveProperty('specModeModelId');
    expect(params).not.toHaveProperty('specModeReasoningEffort');
    expect(params).not.toHaveProperty('mcpServers');
    expect(params).not.toHaveProperty('enabledToolIds');
    expect(params).not.toHaveProperty('disabledToolIds');
  });
});

describe('closeQuietly', () => {
  it('calls close() on the resource', async () => {
    const resource = { close: vi.fn().mockResolvedValue(undefined) };

    await closeQuietly(resource);

    expect(resource.close).toHaveBeenCalledOnce();
  });

  it('swallows errors thrown by close()', async () => {
    const resource = {
      close: vi.fn().mockRejectedValue(new Error('close failed')),
    };

    await expect(closeQuietly(resource)).resolves.toBeUndefined();
  });

  it('handles null input without error', async () => {
    await expect(closeQuietly(null)).resolves.toBeUndefined();
  });

  it('handles undefined input without error', async () => {
    await expect(closeQuietly(undefined)).resolves.toBeUndefined();
  });

  it('does not throw when close() throws synchronously', async () => {
    const resource = {
      close: vi.fn().mockImplementation(() => {
        throw new Error('sync close failure');
      }),
    };

    // closeQuietly awaits close(), so sync throws become rejected promises
    await expect(closeQuietly(resource)).resolves.toBeUndefined();
  });
});
