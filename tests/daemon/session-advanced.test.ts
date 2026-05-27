import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DaemonClient } from '../../src/daemon/client.js';
import { DaemonSession } from '../../src/daemon/session.js';
import type { DroidStreamEvent } from '../../src/stream.js';
import {
  InMemoryTransport,
  makeSuccessResponse,
  sendDefaultStreamSequence,
  wireTransportSend,
} from '../helpers.js';

async function initializeClient(
  transport: InMemoryTransport,
  client: DaemonClient,
  sessionId: string
): Promise<void> {
  const initPromise = client.initializeSession({
    machineId: 'default',
    cwd: '.',
  });
  const sent = transport.sentMessages[transport.sentMessages.length - 1]!;
  transport.injectMessage(
    makeSuccessResponse(sent['id'] as string, {
      sessionId,
      session: {},
      settings: { modelId: 'test-model', reasoningEffort: 'medium' },
      availableModels: [],
    })
  );
  await initPromise;
}

describe('DaemonSession — advanced scenarios', () => {
  let transport: InMemoryTransport;
  let client: DaemonClient;
  let session: DaemonSession;
  const SESSION_ID = 'adv-session';

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    client = new DaemonClient({ transport, token: 'test-token' });
    await initializeClient(transport, client, SESSION_ID);

    wireTransportSend(transport, ({ method, id }) => {
      if (method === 'daemon.close_session') {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
        });
      } else if (method === 'daemon.add_user_message') {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, { messageId: `msg-${id}` })
          );
        });
      } else if (method === 'daemon.interrupt_session') {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, { accepted: true }));
        });
      }
    });

    session = new DaemonSession(client, SESSION_ID);
  });

  afterEach(async () => {
    try {
      await session.close();
    } catch {
      // Already closed
    }
  });

  describe('stream() with AbortSignal', () => {
    it('aborts stream when AbortSignal fires', async () => {
      const controller = new AbortController();
      const messages: DroidStreamEvent[] = [];
      let caught: Error | null = null;

      const streamPromise = (async () => {
        try {
          for await (const msg of session.stream('Long task', {
            abortSignal: controller.signal,
          })) {
            messages.push(msg);
          }
        } catch (e) {
          caught = e as Error;
        }
      })();

      await new Promise((r) => setTimeout(r, 10));

      // Abort after the stream has started
      controller.abort(new Error('User cancelled'));

      await streamPromise;

      expect(caught).not.toBeNull();
      expect(caught!.message).toBe('User cancelled');
    });

    it('throws immediately with already-aborted signal', async () => {
      const controller = new AbortController();
      controller.abort(new Error('Pre-aborted'));

      const iter = session.stream('test', {
        abortSignal: controller.signal,
      });
      await expect(iter.next()).rejects.toThrow('Pre-aborted');
    });

    it('handles abort with string reason', async () => {
      const controller = new AbortController();
      let caught: Error | null = null;

      const streamPromise = (async () => {
        try {
          for await (const _msg of session.stream('task', {
            abortSignal: controller.signal,
          })) {
            // consume
          }
        } catch (e) {
          caught = e as Error;
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      controller.abort('timeout');

      await streamPromise;
      expect(caught).not.toBeNull();
      expect(caught!.message).toBe('timeout');
    });

    it('handles abort with no reason', async () => {
      const controller = new AbortController();
      let caught: Error | null = null;

      const streamPromise = (async () => {
        try {
          for await (const _msg of session.stream('task', {
            abortSignal: controller.signal,
          })) {
            // consume
          }
        } catch (e) {
          caught = e as Error;
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      await streamPromise;
      expect(caught).not.toBeNull();
    });

    it('calls interrupt on abort', async () => {
      const controller = new AbortController();

      const streamPromise = (async () => {
        try {
          for await (const _msg of session.stream('task', {
            abortSignal: controller.signal,
          })) {
            // consume
          }
        } catch {
          // Expected
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      controller.abort(new Error('stop'));

      await streamPromise;

      // Verify interrupt was sent
      const interruptSent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.interrupt_session'
      );
      expect(interruptSent).toBeDefined();
    });
  });

  describe('stream() with includePartialMessages', () => {
    it('yields partial events when enabled', async () => {
      const messages: DroidStreamEvent[] = [];
      const streamPromise = (async () => {
        for await (const msg of session.stream('Explain.', {
          includePartialMessages: true,
        })) {
          messages.push(msg);
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport, { deltas: ['Chunk1', ' Chunk2'] });

      await streamPromise;

      const deltaMessages = messages.filter(
        (m) => m.type === 'assistant_text_delta'
      );
      expect(deltaMessages.length).toBeGreaterThan(0);
    });
  });

  describe('stream() with options', () => {
    it('passes images to addUserMessage', async () => {
      const streamPromise = (async () => {
        for await (const _msg of session.stream('Describe this.', {
          images: [{ type: 'base64', mediaType: 'image/png', data: 'imgdata' }],
        })) {
          // consume
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport);
      await streamPromise;

      const addMsg = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_user_message'
      )!;
      const params = addMsg['params'] as Record<string, unknown>;
      expect(params['images']).toEqual([
        { type: 'base64', mediaType: 'image/png', data: 'imgdata' },
      ]);
    });

    it('passes outputFormat to addUserMessage', async () => {
      const outputFormat = {
        type: 'json_schema' as const,
        schema: { type: 'object', properties: { n: { type: 'number' } } },
      };

      const streamPromise = (async () => {
        for await (const _msg of session.stream('Pick a number.', {
          outputFormat,
        })) {
          // consume
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport);
      await streamPromise;

      const addMsg = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_user_message'
      )!;
      const params = addMsg['params'] as Record<string, unknown>;
      expect(params['outputFormat']).toEqual(outputFormat);
    });
  });

  describe('stream() cleanup', () => {
    it('removes bridge from activeBridges after stream completes', async () => {
      const streamPromise = (async () => {
        for await (const _msg of session.stream('test')) {
          // consume
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport);
      await streamPromise;

      // After stream completes, session should still be usable
      const streamPromise2 = (async () => {
        for await (const _msg of session.stream('test2')) {
          // consume
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport);
      await streamPromise2;
    });

    it('unsubscribes notification handler after stream completes', async () => {
      const streamPromise = (async () => {
        for await (const _msg of session.stream('test')) {
          // consume
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport);
      await streamPromise;

      // Late notifications should not cause issues
      sendDefaultStreamSequence(transport);
      await new Promise((r) => setTimeout(r, 10));
    });
  });

  describe('close() during active stream', () => {
    it('terminates active stream gracefully', async () => {
      const messages: DroidStreamEvent[] = [];
      let streamDone = false;

      const streamPromise = (async () => {
        for await (const msg of session.stream('Long task')) {
          messages.push(msg);
        }
        streamDone = true;
      })();

      await new Promise((r) => setTimeout(r, 10));

      // Close while streaming
      await session.close();
      await streamPromise;

      expect(streamDone).toBe(true);
    });
  });

  describe('multi-turn', () => {
    it('supports sequential stream calls on same session', async () => {
      // First turn
      const messages1: DroidStreamEvent[] = [];
      const stream1 = (async () => {
        for await (const msg of session.stream('Turn 1')) {
          messages1.push(msg);
        }
      })();
      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport, { deltas: ['Response 1'] });
      await stream1;

      // Second turn
      const messages2: DroidStreamEvent[] = [];
      const stream2 = (async () => {
        for await (const msg of session.stream('Turn 2')) {
          messages2.push(msg);
        }
      })();
      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport, { deltas: ['Response 2'] });
      await stream2;

      expect(messages1.length).toBeGreaterThan(0);
      expect(messages2.length).toBeGreaterThan(0);

      const result1 = messages1.find((m) => m.type === 'result');
      const result2 = messages2.find((m) => m.type === 'result');
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('send() options', () => {
    it('passes outputFormat', async () => {
      const format = {
        type: 'json_schema' as const,
        schema: { type: 'object' },
      };
      await session.send('Structured output', { outputFormat: format });

      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_user_message'
      )!;
      const params = sent['params'] as Record<string, unknown>;
      expect(params['outputFormat']).toEqual(format);
    });

    it('passes files', async () => {
      await session.send('Analyze files', {
        files: [
          {
            type: 'base64',
            data: 'filedata',
            fileName: 'doc.pdf',
            mediaType: 'application/pdf',
          },
        ],
      });

      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.add_user_message'
      )!;
      const params = sent['params'] as Record<string, unknown>;
      expect(params['files']).toBeDefined();
    });
  });

  describe('onNotification', () => {
    it('delegates to client and returns unsubscribe', () => {
      const unsub = session.onNotification(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });

    it('receives notifications for the session', async () => {
      const notifications: unknown[] = [];
      session.onNotification((n) => notifications.push(n));

      transport.injectMessage({
        jsonrpc: '2.0',
        factoryApiVersion: '1.0.0',
        factoryProtocolVersion: '1.51.0',
        type: 'notification',
        method: 'daemon.session_notification',
        params: {
          notification: {
            type: 'session_title_updated',
            title: 'New Title',
          },
        },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(notifications.length).toBeGreaterThan(0);
    });
  });

  describe('interrupt() while streaming', () => {
    it('interrupt during stream stops the turn', async () => {
      const messages: DroidStreamEvent[] = [];

      const streamPromise = (async () => {
        for await (const msg of session.stream('Write something long')) {
          messages.push(msg);
          if (msg.type === 'assistant') {
            await session.interrupt();
          }
        }
      })();

      await new Promise((r) => setTimeout(r, 10));
      sendDefaultStreamSequence(transport);
      await streamPromise;

      const interruptSent = transport.sentMessages.find(
        (m) => m['method'] === 'daemon.interrupt_session'
      );
      expect(interruptSent).toBeDefined();
    });
  });
});
