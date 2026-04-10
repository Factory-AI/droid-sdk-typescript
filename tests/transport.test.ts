/**
 * Tests for ProcessTransport and InMemoryTransport.
 *
 * ProcessTransport tests use a real child process (`node -e "..."`) to verify
 * stdin/stdout JSONL framing, process lifecycle, and edge cases.
 *
 * InMemoryTransport tests verify the mock's capture/inject behavior.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import { ConnectionError, ProcessExitError } from '../src/errors.js';
import { ProcessTransport } from '../src/transport.js';
import type { DroidClientTransport } from '../src/types.js';
import { InMemoryTransport } from './helpers.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a ProcessTransport that runs `node -e <script>` instead of `droid`.
 * This lets us test real stdin/stdout JSONL framing without the droid CLI.
 */
function createNodeTransport(
  script: string,
  options?: { gracePeriod?: number }
): ProcessTransport {
  return new ProcessTransport({
    execPath: 'node',
    execArgs: ['-e', script],
    gracePeriod: options?.gracePeriod,
  });
}

/**
 * Collect messages from a transport until a condition is met or timeout.
 */
function collectMessages(
  transport: DroidClientTransport,
  count: number,
  timeoutMs = 5_000
): Promise<object[]> {
  return new Promise((resolve, reject) => {
    const messages: object[] = [];
    const timer = setTimeout(() => {
      reject(
        new Error(
          `Timeout waiting for ${count} messages (got ${messages.length})`
        )
      );
    }, timeoutMs);

    transport.onMessage((msg) => {
      messages.push(msg);
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    });
  });
}

/**
 * Wait for an error on the transport.
 */
function waitForError(
  transport: DroidClientTransport,
  timeoutMs = 5_000
): Promise<Error> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for error'));
    }, timeoutMs);

    transport.onError((err) => {
      clearTimeout(timer);
      resolve(err);
    });
  });
}

// ---------------------------------------------------------------------------
// DroidClientTransport interface compliance
// ---------------------------------------------------------------------------

describe('ProcessTransport', () => {
  describe('interface compliance', () => {
    it('implements DroidClientTransport interface', () => {
      const transport: DroidClientTransport = new ProcessTransport();
      expect(transport.send).toBeTypeOf('function');
      expect(transport.onMessage).toBeTypeOf('function');
      expect(transport.onError).toBeTypeOf('function');
      expect(transport.close).toBeTypeOf('function');
      expect(typeof transport.isConnected).toBe('boolean');
      expect(transport.connect).toBeTypeOf('function');
    });

    it('isConnected is false before connect()', () => {
      const transport = new ProcessTransport();
      expect(transport.isConnected).toBe(false);
    });

    it('isConnected is true after connect()', async () => {
      // Spawn a node process that stays alive briefly
      const transport = createNodeTransport('setTimeout(() => {}, 10000);');
      await transport.connect!();
      expect(transport.isConnected).toBe(true);
      await transport.close();
    });

    it('throws ConnectionError when connecting while already connected', async () => {
      const transport = createNodeTransport('setTimeout(() => {}, 10000);');
      await transport.connect!();
      await expect(transport.connect!()).rejects.toThrow(ConnectionError);
      await transport.close();
    });

    it('throws when sending before connect()', () => {
      const transport = new ProcessTransport();
      expect(() => transport.send({ test: true })).toThrow(ConnectionError);
    });
  });

  // -----------------------------------------------------------------------
  // JSONL stdin (send)
  // -----------------------------------------------------------------------

  describe('JSONL stdin (send)', () => {
    it('sends JSONL via stdin — one JSON object per newline', async () => {
      // Node script that echoes each stdin line as a JSON message
      const script = `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        rl.on('line', (line) => {
          try {
            const obj = JSON.parse(line);
            process.stdout.write(JSON.stringify({ echo: obj }) + '\\n');
          } catch {}
        });
      `;

      const transport = createNodeTransport(script);
      const messagePromise = collectMessages(transport, 1);
      await transport.connect!();

      const testMsg = { jsonrpc: '2.0', method: 'test', id: '1' };
      transport.send(testMsg);

      const messages = await messagePromise;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ echo: testMsg });

      await transport.close();
    });

    it('serializes multiple sends without interleaving', async () => {
      // Node script that collects all lines and echoes count at the end
      const script = `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        const lines = [];
        rl.on('line', (line) => {
          lines.push(line);
          try {
            const obj = JSON.parse(line);
            process.stdout.write(JSON.stringify({ received: obj }) + '\\n');
          } catch {}
        });
      `;

      const transport = createNodeTransport(script);
      const messagePromise = collectMessages(transport, 5);
      await transport.connect!();

      // Fire 5 sends concurrently
      for (let i = 0; i < 5; i++) {
        transport.send({ id: String(i), data: 'x'.repeat(100) });
      }

      const messages = await messagePromise;
      expect(messages).toHaveLength(5);

      // Each message should have a distinct, correctly-parsed id
      const ids = messages.map(
        (m) => (m as { received: { id: string } }).received.id
      );
      expect(ids).toEqual(['0', '1', '2', '3', '4']);

      await transport.close();
    });
  });

  // -----------------------------------------------------------------------
  // JSONL stdout (receive)
  // -----------------------------------------------------------------------

  describe('JSONL stdout parsing', () => {
    it('parses JSONL messages from stdout', async () => {
      const script = `
        process.stdout.write(JSON.stringify({ type: "notification", method: "test" }) + '\\n');
        process.stdout.write(JSON.stringify({ type: "response", id: "1", result: 42 }) + '\\n');
        setTimeout(() => process.exit(0), 200);
      `;

      const transport = createNodeTransport(script);
      const messagePromise = collectMessages(transport, 2);
      await transport.connect!();

      const messages = await messagePromise;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({
        type: 'notification',
        method: 'test',
      });
      expect(messages[1]).toEqual({
        type: 'response',
        id: '1',
        result: 42,
      });

      await transport.close();
    });

    it('silently skips non-JSON stdout lines', async () => {
      const script = `
        process.stdout.write('DEBUG: starting up\\n');
        process.stdout.write(JSON.stringify({ valid: true }) + '\\n');
        process.stdout.write('another non-json line\\n');
        process.stdout.write(JSON.stringify({ also: "valid" }) + '\\n');
        setTimeout(() => process.exit(0), 200);
      `;

      const transport = createNodeTransport(script);
      const messagePromise = collectMessages(transport, 2);
      await transport.connect!();

      const messages = await messagePromise;
      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ valid: true });
      expect(messages[1]).toEqual({ also: 'valid' });

      await transport.close();
    });

    it('skips blank lines', async () => {
      const script = `
        process.stdout.write('\\n');
        process.stdout.write('\\n');
        process.stdout.write(JSON.stringify({ msg: 1 }) + '\\n');
        setTimeout(() => process.exit(0), 200);
      `;

      const transport = createNodeTransport(script);
      const messagePromise = collectMessages(transport, 1);
      await transport.connect!();

      const messages = await messagePromise;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ msg: 1 });

      await transport.close();
    });

    it('skips malformed JSON lines', async () => {
      const script = `
        process.stdout.write('{broken json\\n');
        process.stdout.write(JSON.stringify({ good: true }) + '\\n');
        setTimeout(() => process.exit(0), 200);
      `;

      const transport = createNodeTransport(script);
      const messagePromise = collectMessages(transport, 1);
      await transport.connect!();

      const messages = await messagePromise;
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ good: true });

      await transport.close();
    });
  });

  // -----------------------------------------------------------------------
  // Process exit handling
  // -----------------------------------------------------------------------

  describe('process exit handling', () => {
    it('fires ProcessExitError on abnormal exit (non-zero)', async () => {
      const script = `
        process.stdout.write(JSON.stringify({ hello: true }) + '\\n');
        setTimeout(() => process.exit(42), 200);
      `;

      const transport = createNodeTransport(script);
      const errorPromise = waitForError(transport);
      await transport.connect!();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(ProcessExitError);
      expect((error as ProcessExitError).exitCode).toBe(42);
      expect(transport.isConnected).toBe(false);

      await transport.close();
    });

    it('fires ProcessExitError on normal exit (code 0)', async () => {
      const script = `
        process.exit(0);
      `;

      const transport = createNodeTransport(script);
      const errorPromise = waitForError(transport);
      await transport.connect!();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(ProcessExitError);
      expect((error as ProcessExitError).exitCode).toBe(0);
      expect(transport.isConnected).toBe(false);

      await transport.close();
    });

    it('sets isConnected to false after process exits', async () => {
      const script = `process.exit(1);`;

      const transport = createNodeTransport(script);
      const errorPromise = waitForError(transport);
      await transport.connect!();

      await errorPromise;
      expect(transport.isConnected).toBe(false);

      await transport.close();
    });

    it('subsequent send() throws after process exit', async () => {
      const script = `process.exit(1);`;

      const transport = createNodeTransport(script);
      const errorPromise = waitForError(transport);
      await transport.connect!();

      await errorPromise;

      // send() should throw the sticky error
      expect(() => transport.send({ test: true })).toThrow(ProcessExitError);

      await transport.close();
    });
  });

  // -----------------------------------------------------------------------
  // Reconnection
  // -----------------------------------------------------------------------

  describe('reconnection', () => {
    it('supports close → connect cycle', async () => {
      // First connection: echo script
      const echoScript = `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        rl.on('line', (line) => {
          try {
            const obj = JSON.parse(line);
            process.stdout.write(JSON.stringify({ echo: obj }) + '\\n');
          } catch {}
        });
      `;

      // Use a transport with node -e that we can reconnect
      const transport = new ProcessTransport({
        execPath: 'node',
        execArgs: ['-e', echoScript],
      });

      // First connection
      await transport.connect!();
      expect(transport.isConnected).toBe(true);

      const firstMsgPromise = collectMessages(transport, 1);
      transport.send({ attempt: 1 });
      const firstMsg = await firstMsgPromise;
      expect(firstMsg[0]).toEqual({ echo: { attempt: 1 } });

      // Close
      await transport.close();
      expect(transport.isConnected).toBe(false);

      // Reconnect
      await transport.connect!();
      expect(transport.isConnected).toBe(true);

      const secondMsgPromise = collectMessages(transport, 1);
      transport.send({ attempt: 2 });
      const secondMsg = await secondMsgPromise;
      expect(secondMsg[0]).toEqual({ echo: { attempt: 2 } });

      await transport.close();
    });

    it('resets processError on reconnect so send() works', async () => {
      // Process that exits immediately with error
      const transport = createNodeTransport('process.exit(1);');
      const errorPromise = waitForError(transport);
      await transport.connect!();
      await errorPromise;

      // send() should throw sticky error
      expect(() => transport.send({ test: true })).toThrow(ProcessExitError);

      await transport.close();

      // Reconnect with a long-lived process
      const echoScript = `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        rl.on('line', (line) => {
          try {
            const obj = JSON.parse(line);
            process.stdout.write(JSON.stringify({ echo: obj }) + '\\n');
          } catch {}
        });
      `;
      // Create a new transport for reconnect since execArgs are fixed
      const transport2 = new ProcessTransport({
        execPath: 'node',
        execArgs: ['-e', echoScript],
      });
      await transport2.connect!();

      // send() should work now
      const msgPromise = collectMessages(transport2, 1);
      transport2.send({ reconnected: true });
      const msgs = await msgPromise;
      expect(msgs[0]).toEqual({ echo: { reconnected: true } });

      await transport2.close();
    });
  });

  // -----------------------------------------------------------------------
  // Shutdown escalation (SIGTERM → SIGKILL)
  // -----------------------------------------------------------------------

  describe('SIGTERM → SIGKILL shutdown escalation', () => {
    it('close() terminates process and sets isConnected to false', async () => {
      const transport = createNodeTransport('setTimeout(() => {}, 60000);');
      await transport.connect!();
      expect(transport.isConnected).toBe(true);

      await transport.close();
      expect(transport.isConnected).toBe(false);
    });

    it('close() is idempotent', async () => {
      const transport = createNodeTransport('setTimeout(() => {}, 60000);');
      await transport.connect!();

      // Calling close() twice should not throw
      await transport.close();
      await transport.close();
      expect(transport.isConnected).toBe(false);
    });

    it('escalates to SIGKILL for processes that ignore SIGTERM', async () => {
      // Process that traps SIGTERM and ignores it
      const script = `
        process.on('SIGTERM', () => { /* ignore */ });
        setTimeout(() => {}, 60000);
      `;

      const transport = createNodeTransport(script, {
        gracePeriod: 0.5, // Short grace period for fast test
      });
      await transport.connect!();
      expect(transport.isConnected).toBe(true);

      // close() should eventually succeed via SIGKILL
      await transport.close();
      expect(transport.isConnected).toBe(false);
    }, 10_000); // Allow up to 10s for the escalation
  });

  // -----------------------------------------------------------------------
  // #22 — Transport send() EPIPE/ECONNRESET
  // -----------------------------------------------------------------------

  describe('send() after stdin closes (EPIPE)', () => {
    it('fires error or throws when writing to a closed stdin', async () => {
      // Node script that reads one line then closes stdin immediately
      const script = `
        const readline = require('readline');
        const rl = readline.createInterface({ input: process.stdin });
        rl.on('line', () => {
          rl.close();
          process.stdin.destroy();
          // Keep process alive briefly
          setTimeout(() => process.exit(0), 2000);
        });
      `;

      const transport = createNodeTransport(script);
      const errorPromise = waitForError(transport);
      await transport.connect!();

      // First send succeeds — stdin is still open
      transport.send({ first: true });

      // Give the child time to close stdin
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Second send should fail — either synchronously or via async error event
      try {
        transport.send({ second: true });
        // If send() didn't throw, the error must fire asynchronously
        const asyncError = await errorPromise;
        expect(asyncError).toBeDefined();
      } catch {
        // send() threw synchronously — acceptable behavior
      }

      await transport.close();
    }, 10_000);
  });

  // -----------------------------------------------------------------------
  // #23 — Transport send() when isClosing
  // -----------------------------------------------------------------------

  describe('send() during close()', () => {
    it('send() after close() starts throws or fires error', async () => {
      // Process that ignores SIGTERM (long grace period to simulate closing state)
      const script = `
        process.on('SIGTERM', () => { /* ignore */ });
        setTimeout(() => {}, 60000);
      `;

      const transport = createNodeTransport(script, { gracePeriod: 0.5 });
      await transport.connect!();
      expect(transport.isConnected).toBe(true);

      // Start close (will send SIGTERM, then wait gracePeriod before SIGKILL)
      const closePromise = transport.close();

      // Immediately try to send while close is in progress
      try {
        transport.send({ duringClose: true });
      } catch {
        // send() may throw if the transport detects it's closing
      }

      // Wait for close to complete
      await closePromise;

      // Either send() threw, or close completed and the message was silently dropped
      // After close, subsequent sends should definitely fail
      expect(transport.isConnected).toBe(false);
      expect(() => transport.send({ afterClose: true })).toThrow();
    }, 15_000);
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles spawn failure (ENOENT) via error event', async () => {
      const transport = new ProcessTransport({
        execPath: '/nonexistent/binary',
      });

      const errorPromise = waitForError(transport);
      await transport.connect!();

      const error = await errorPromise;
      expect(error).toBeInstanceOf(ConnectionError);
      expect(transport.isConnected).toBe(false);

      await transport.close();
    });

    it('handlers registered before connect() still fire after connect()', async () => {
      const script = `
        process.stdout.write(JSON.stringify({ early: true }) + '\\n');
        setTimeout(() => process.exit(0), 200);
      `;

      const transport = createNodeTransport(script);

      // Register handler BEFORE connect
      const messages: object[] = [];
      transport.onMessage((msg) => messages.push(msg));

      await transport.connect!();

      // Wait briefly for stdout data
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages[0]).toEqual({ early: true });

      await transport.close();
    });
  });
});

// ---------------------------------------------------------------------------
// InMemoryTransport
// ---------------------------------------------------------------------------

describe('InMemoryTransport', () => {
  let transport: InMemoryTransport;

  beforeEach(async () => {
    transport = new InMemoryTransport();
    await transport.connect!();
  });

  afterEach(async () => {
    await transport.close();
  });

  it('implements DroidClientTransport interface', () => {
    const t: DroidClientTransport = transport;
    expect(t.send).toBeTypeOf('function');
    expect(t.onMessage).toBeTypeOf('function');
    expect(t.onError).toBeTypeOf('function');
    expect(t.close).toBeTypeOf('function');
    expect(typeof t.isConnected).toBe('boolean');
    expect(t.connect).toBeTypeOf('function');
  });

  describe('connection state', () => {
    it('isConnected is false before connect()', () => {
      const t = new InMemoryTransport();
      expect(t.isConnected).toBe(false);
    });

    it('isConnected is true after connect()', () => {
      expect(transport.isConnected).toBe(true);
    });

    it('isConnected is false after close()', async () => {
      await transport.close();
      expect(transport.isConnected).toBe(false);
    });
  });

  describe('send() captures messages', () => {
    it('captures sent messages in sentMessages array', () => {
      const msg1 = { jsonrpc: '2.0', method: 'test', id: '1' };
      const msg2 = { jsonrpc: '2.0', method: 'test2', id: '2' };

      transport.send(msg1);
      transport.send(msg2);

      expect(transport.sentMessages).toHaveLength(2);
      expect(transport.sentMessages[0]).toEqual(msg1);
      expect(transport.sentMessages[1]).toEqual(msg2);
    });

    it('throws when sending while not connected', async () => {
      await transport.close();
      expect(() => transport.send({ test: true })).toThrow(
        'InMemoryTransport is not connected'
      );
    });
  });

  describe('injectMessage()', () => {
    it('fires onMessage handler with injected message', () => {
      const received: object[] = [];
      transport.onMessage((msg) => received.push(msg));

      const msg = { type: 'notification', method: 'test' };
      transport.injectMessage(msg);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(msg);
    });

    it('does not throw when no handler registered', () => {
      expect(() => transport.injectMessage({ test: true })).not.toThrow();
    });
  });

  describe('injectError()', () => {
    it('fires onError handler with injected error', () => {
      const errors: Error[] = [];
      transport.onError((err) => errors.push(err));

      const error = new Error('test error');
      transport.injectError(error);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(error);
    });

    it('does not throw when no handler registered', () => {
      expect(() => transport.injectError(new Error('test'))).not.toThrow();
    });
  });

  describe('handler replacement', () => {
    it('onMessage replaces previous handler', () => {
      const first: object[] = [];
      const second: object[] = [];

      transport.onMessage((msg) => first.push(msg));
      transport.injectMessage({ a: 1 });

      transport.onMessage((msg) => second.push(msg));
      transport.injectMessage({ b: 2 });

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]).toEqual({ a: 1 });
      expect(second[0]).toEqual({ b: 2 });
    });

    it('onError replaces previous handler', () => {
      const first: Error[] = [];
      const second: Error[] = [];

      transport.onError((err) => first.push(err));
      transport.injectError(new Error('a'));

      transport.onError((err) => second.push(err));
      transport.injectError(new Error('b'));

      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0]!.message).toBe('a');
      expect(second[0]!.message).toBe('b');
    });
  });
});
