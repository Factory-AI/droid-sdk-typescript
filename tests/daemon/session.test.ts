import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DroidClient } from '../../src/client.js';
import { DaemonSession } from '../../src/daemon/session.js';
import { ConnectionError } from '../../src/errors.js';
import {
  InMemoryTransport,
  makeSuccessResponse,
  sendDefaultStreamSequence,
  wireTransportSend,
} from '../helpers.js';

async function initializeClient(
  transport: InMemoryTransport,
  client: DroidClient,
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

describe('DaemonSession', () => {
  let transport: InMemoryTransport;
  let client: DroidClient;
  let session: DaemonSession;
  const SESSION_ID = 'test-session-id';

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect();
    client = new DroidClient({ transport });
    await initializeClient(transport, client, SESSION_ID);

    // Auto-respond to protocol requests to prevent timeout
    wireTransportSend(transport, ({ method, id }) => {
      if (method === 'droid.close_session') {
        queueMicrotask(() => {
          transport.injectMessage(makeSuccessResponse(id, {}));
        });
      } else if (method === 'droid.add_user_message') {
        queueMicrotask(() => {
          transport.injectMessage(
            makeSuccessResponse(id, { messageId: `msg-${id}` })
          );
        });
      } else if (method === 'droid.interrupt_session') {
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
      // Already closed in test
    }
  });

  describe('sessionId', () => {
    it('exposes the session ID', () => {
      expect(session.sessionId).toBe('test-session-id');
    });
  });

  describe('send()', () => {
    it('calls addUserMessage and returns after ACK', async () => {
      await session.send('Fix the tests.');

      // Verify the addUserMessage request was sent
      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'droid.add_user_message'
      )!;
      expect(sent).toBeDefined();
      expect((sent['params'] as Record<string, unknown>)['text']).toBe(
        'Fix the tests.'
      );
    });

    it('passes images and files options', async () => {
      await session.send('Analyze this.', {
        images: [
          { type: 'base64', mediaType: 'image/png', data: 'base64data' },
        ],
      });

      const sent = transport.sentMessages.find(
        (m) => m['method'] === 'droid.add_user_message'
      )!;
      const params = sent['params'] as Record<string, unknown>;
      expect(params['images']).toEqual([
        { type: 'base64', mediaType: 'image/png', data: 'base64data' },
      ]);
    });

    it('does not subscribe to notifications after send', async () => {
      await session.send('Quick task.');

      // Injecting a notification after send should not cause any issues
      // (send() does not subscribe to notifications)
      sendDefaultStreamSequence(transport);
    });

    it('throws when session is closed', async () => {
      await session.close();
      await expect(session.send('hello')).rejects.toThrow(ConnectionError);
    });
  });

  describe('stream()', () => {
    it('yields events until Result', async () => {
      const messages: unknown[] = [];
      const streamPromise = (async () => {
        for await (const msg of session.stream('Explain recursion.')) {
          messages.push(msg);
        }
      })();

      // Wait a tick for the auto-responder to handle addUserMessage
      await new Promise((r) => setTimeout(r, 10));

      // Use the standard test helper to inject a full stream sequence
      sendDefaultStreamSequence(transport);

      await streamPromise;

      expect(messages.length).toBeGreaterThan(0);
      const lastMsg = messages[messages.length - 1] as Record<string, unknown>;
      expect(lastMsg['type']).toBe('result');
    });

    it('throws when session is closed', async () => {
      await session.close();

      const iter = session.stream('hello');
      await expect(iter.next()).rejects.toThrow(ConnectionError);
    });
  });

  describe('interrupt()', () => {
    it('delegates to client.interruptSession', async () => {
      await session.interrupt();

      const interruptSent = transport.sentMessages.find(
        (m) => m['method'] === 'droid.interrupt_session'
      )!;
      expect(interruptSent).toBeDefined();
    });
  });

  describe('close()', () => {
    it('is idempotent', async () => {
      await session.close();
      await session.close(); // Should not throw
    });

    it('signals done to active bridges', async () => {
      const messages: unknown[] = [];
      const streamPromise = (async () => {
        for await (const msg of session.stream('test')) {
          messages.push(msg);
        }
      })();

      // Wait for auto-responder to handle addUserMessage
      await new Promise((r) => setTimeout(r, 10));

      // Close the session — should terminate the stream
      await session.close();
      await streamPromise;
    });
  });
});
