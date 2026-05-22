import { describe, expect, it, vi } from 'vitest';

import { WebSocketTransport } from '../../src/daemon/transport.js';
import { ConnectionError } from '../../src/errors.js';

describe('WebSocketTransport', () => {
  describe('constructor', () => {
    it('uses default config when no options provided', () => {
      const transport = new WebSocketTransport();
      expect(transport.isConnected).toBe(false);
    });

    it('accepts custom options', () => {
      const transport = new WebSocketTransport({
        maxConnectRetries: 10,
        connectionTimeoutMs: 60_000,
      });
      expect(transport.isConnected).toBe(false);
    });
  });

  describe('connect()', () => {
    it('throws when url is not provided', async () => {
      const transport = new WebSocketTransport();
      await expect(transport.connect()).rejects.toThrow(ConnectionError);
      await expect(transport.connect()).rejects.toThrow(
        /WebSocket URL is required/
      );
    });

    it('throws when already connected', async () => {
      // We can't easily test a successful connect with mocked ws,
      // but we can verify the guard logic
      const transport = new WebSocketTransport();
      // Manually set internal state for this test
      Object.defineProperty(transport, '_isConnected', { value: true });

      await expect(transport.connect('wss://test')).rejects.toThrow(
        ConnectionError
      );
      await expect(transport.connect('wss://test')).rejects.toThrow(
        /already connected/
      );
    });
  });

  describe('send()', () => {
    it('throws when not connected', () => {
      const transport = new WebSocketTransport();
      expect(() => transport.send({ foo: 'bar' })).toThrow(ConnectionError);
      expect(() => transport.send({ foo: 'bar' })).toThrow(/not connected/);
    });
  });

  describe('close()', () => {
    it('is safe to call when not connected', async () => {
      const transport = new WebSocketTransport();
      await transport.close(); // Should not throw
    });

    it('is idempotent', async () => {
      const transport = new WebSocketTransport();
      await transport.close();
      await transport.close(); // Should not throw
    });
  });

  describe('handler registration', () => {
    it('accepts message handler', () => {
      const transport = new WebSocketTransport();
      const handler = vi.fn();
      transport.onMessage(handler);
      // No error means it works
    });

    it('accepts error handler', () => {
      const transport = new WebSocketTransport();
      const handler = vi.fn();
      transport.onError(handler);
      // No error means it works
    });
  });
});
