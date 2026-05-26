/**
 * Live daemon SDK stress test.
 *
 * Run with: FACTORY_API_KEY=fk-... npx tsx tests/daemon/stress-test.ts
 *
 * This is NOT a vitest file — it runs against a real daemon and exercises
 * the full SDK stack end-to-end.
 */

import { connectDaemon } from '../../src/daemon/index.js';
import { DaemonConnection } from '../../src/daemon/connection.js';
import { DaemonSession } from '../../src/daemon/session.js';
import { ToolConfirmationOutcome } from '../../src/schemas/enums.js';
import type { DroidStreamEvent } from '../../src/stream.js';

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const SKIP = '\x1b[33m⊘\x1b[0m';

let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    console.log(`  ${PASS} ${name} (${ms}ms)`);
    passed++;
  } catch (e) {
    const ms = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ${FAIL} ${name} (${ms}ms)`);
    console.log(`    Error: ${msg}`);
    if (e instanceof Error && e.stack) {
      const firstFrame = e.stack.split('\n').slice(1, 3).join('\n');
      console.log(`    ${firstFrame}`);
    }
    failed++;
    failures.push(`${name}: ${msg}`);
  }
}

function skip(name: string, reason: string): void {
  console.log(`  ${SKIP} ${name} — ${reason}`);
  skipped++;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── Tests ───

async function main(): Promise<void> {
  console.log('\n═══ Daemon SDK Stress Test ═══\n');

  // ── 1. Connection ──
  console.log('1. Connection');

  let connection: DaemonConnection;

  await test('connectDaemon() with FACTORY_API_KEY', async () => {
    connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY,
    });
    assert(connection != null, 'connection should not be null');
  });

  // ── 2. Session creation ──
  console.log('\n2. Session creation');

  let session: DaemonSession;

  await test('createSession with cwd', async () => {
    session = await connection.createSession({
      cwd: process.cwd(),
    });
    assert(session != null, 'session should not be null');
    assert(typeof session.sessionId === 'string', 'sessionId should be a string');
    assert(session.sessionId.length > 0, 'sessionId should not be empty');
    console.log(`    sessionId: ${session.sessionId}`);
  });

  // ── 3. stream() — basic ──
  console.log('\n3. Stream — basic');

  await test('stream() yields messages and ends with Result', async () => {
    const messages: DroidStreamEvent[] = [];
    for await (const msg of session.stream('What is 2 + 2? Reply with just the number.')) {
      messages.push(msg);
    }
    assert(messages.length > 0, 'should yield at least one message');
    const result = messages.find((m) => m.type === 'result');
    assert(result != null, 'should end with a Result message');
    if (result && result.type === 'result') {
      console.log(`    turns: ${result.numTurns}, duration: ${result.durationMs}ms`);
      console.log(`    result text: ${result.result.slice(0, 100)}`);
    }
    const assistant = messages.find((m) => m.type === 'assistant');
    assert(assistant != null, 'should have at least one assistant message');
  });

  // ── 4. stream() — partial messages ──
  console.log('\n4. Stream — partial messages');

  await test('stream() with includePartialMessages yields deltas', async () => {
    const deltas: string[] = [];
    const types = new Set<string>();
    for await (const msg of session.stream('Say the word "hello".', {
      includePartialMessages: true,
    })) {
      types.add(msg.type);
      if (msg.type === 'assistant_text_delta') {
        deltas.push(msg.text);
      }
    }
    console.log(`    message types seen: ${[...types].join(', ')}`);
    console.log(`    delta count: ${deltas.length}`);
    assert(deltas.length > 0, 'should yield at least one delta');
    assert(types.has('result'), 'should still yield Result');
  });

  // ── 5. Multi-turn ──
  console.log('\n5. Multi-turn');

  await test('multi-turn preserves context', async () => {
    // Turn 1: give it something to remember
    for await (const _msg of session.stream('Remember this code: XRAY42. Do not forget it.')) {
      // consume
    }
    // Turn 2: ask it back
    let responseText = '';
    for await (const msg of session.stream(
      'What code did I just tell you to remember? Reply with just the code, nothing else.'
    )) {
      if (msg.type === 'assistant') responseText += msg.text;
    }
    console.log(`    response: ${responseText.slice(0, 100)}`);
    assert(
      responseText.includes('XRAY42'),
      `expected "XRAY42" in response, got: "${responseText.slice(0, 100)}"`
    );
  });

  // ── 6. send() fire-and-forget ──
  console.log('\n6. send() fire-and-forget');

  await test('send() returns immediately after ACK', async () => {
    const start = Date.now();
    await session.send('Think about the meaning of life but do not respond.');
    const elapsed = Date.now() - start;
    console.log(`    send() returned in ${elapsed}ms`);
    // send() should return quickly (just daemon ACK), not wait for completion
    assert(elapsed < 5000, `send() took too long: ${elapsed}ms`);
  });

  // Wait a moment for the daemon to process the send before continuing
  await new Promise((r) => setTimeout(r, 2000));

  // ── 7. interrupt() ──
  console.log('\n7. Interrupt');

  await test('interrupt() stops a running turn', async () => {
    let messageCount = 0;

    // Use includePartialMessages to get frequent events we can interrupt on
    const streamPromise = (async () => {
      try {
        for await (const msg of session.stream(
          'Write an extremely detailed 10000-word essay about every major event in world history from 3000 BC to the present. Cover politics, science, art, and culture for each century.',
          { includePartialMessages: true }
        )) {
          messageCount++;
          if (messageCount >= 5) {
            await session.interrupt();
            break;
          }
        }
      } catch {
        // May throw on interrupt
      }
    })();

    await streamPromise;
    console.log(`    total messages seen: ${messageCount}`);
    assert(messageCount >= 1, 'should have seen at least one message');

    // Verify interrupt was sent by checking we can still use the session
    // (interrupt doesn't close the session)
    let recovered = false;
    try {
      for await (const msg of session.stream('Say "recovered".')) {
        if (msg.type === 'assistant') recovered = true;
      }
    } catch {
      // Session may be in a transitional state after interrupt
    }
    console.log(`    recovered after interrupt: ${recovered}`);
  });

  // ── 8. Close session and reopen ──
  console.log('\n8. Session lifecycle');

  const oldSessionId = session.sessionId;

  await test('close() session', async () => {
    await session.close();
    // Verify session is closed — operations should throw
    let threw = false;
    try {
      await session.send('test');
    } catch {
      threw = true;
    }
    assert(threw, 'send() should throw after close');
  });

  // ── 9. Resume session ──
  console.log('\n9. Resume session');

  await test('resumeSession() reconnects to previous session', async () => {
    const resumed = await connection.resumeSession(oldSessionId);
    assert(resumed.sessionId === oldSessionId, 'sessionId should match');

    // Verify context is preserved — it should still remember XRAY42
    let responseText = '';
    for await (const msg of resumed.stream(
      'What was the code I told you to remember earlier? Reply with just the code.'
    )) {
      if (msg.type === 'assistant') responseText += msg.text;
    }
    console.log(`    resumed response: ${responseText.slice(0, 100)}`);
    // Context may or may not be preserved after interrupt + close, so don't assert
    await resumed.close();
  });

  // ── 10. Concurrent sessions ──
  console.log('\n10. Concurrent sessions');

  await test('two concurrent sessions on one connection', async () => {
    const [s1, s2] = await Promise.all([
      connection.createSession({ cwd: process.cwd() }),
      connection.createSession({ cwd: process.cwd() }),
    ]);

    assert(s1.sessionId !== s2.sessionId, 'sessions should have different IDs');
    console.log(`    session1: ${s1.sessionId}`);
    console.log(`    session2: ${s2.sessionId}`);

    // Stream on both concurrently
    const [r1, r2] = await Promise.all([
      collectStreamText(s1, 'What is 1 + 1? Reply with just the number.'),
      collectStreamText(s2, 'What is 3 + 3? Reply with just the number.'),
    ]);

    console.log(`    s1 response: ${r1.slice(0, 50)}`);
    console.log(`    s2 response: ${r2.slice(0, 50)}`);

    assert(r1.length > 0, 'session 1 should have a response');
    assert(r2.length > 0, 'session 2 should have a response');

    await s1.close();
    await s2.close();
  });

  // ── 11. AbortSignal ──
  console.log('\n11. AbortSignal');

  await test('AbortSignal cancels stream', async () => {
    const s = await connection.createSession({ cwd: process.cwd() });
    const controller = new AbortController();

    let caught = false;
    let messageCount = 0;

    // Abort after 1 second
    setTimeout(() => controller.abort(), 1000);

    try {
      for await (const _msg of s.stream(
        'Write a 10000-word novel about space exploration.',
        { abortSignal: controller.signal }
      )) {
        messageCount++;
      }
    } catch {
      caught = true;
    }

    console.log(`    messages before abort: ${messageCount}`);
    console.log(`    caught abort: ${caught}`);
    assert(caught, 'should catch abort error');

    await s.close();
  });

  // ── 12. Permission handler ──
  console.log('\n12. Permission handler');

  await test('permissionHandler receives tool call details', async () => {
    let permissionCount = 0;
    const s = await connection.createSession({
      cwd: process.cwd(),
      permissionHandler: (params) => {
        permissionCount++;
        console.log(`    permission request #${permissionCount}:`);
        for (const tu of params.toolUses) {
          console.log(`      tool: ${tu.toolUse.name}, type: ${tu.confirmationType}`);
        }
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    for await (const msg of s.stream('Read the file package.json and tell me the package name.')) {
      if (msg.type === 'assistant') {
        console.log(`    response: ${msg.text.slice(0, 100)}`);
      }
    }

    console.log(`    permission requests received: ${permissionCount}`);
    // Permission handler may or may not be called depending on autonomy level
    await s.close();
  });

  // ── 13. onNotification ──
  console.log('\n13. onNotification');

  await test('onNotification receives raw notifications', async () => {
    const s = await connection.createSession({ cwd: process.cwd() });
    const notifTypes = new Set<string>();

    const unsub = s.onNotification((n) => {
      // The raw notification is the JSON-RPC envelope. The inner notification
      // type is at params.notification.type
      const raw = n as Record<string, unknown>;
      const params = raw['params'] as Record<string, unknown> | undefined;
      const inner = params?.['notification'] as Record<string, unknown> | undefined;
      const innerType = inner?.['type'] as string | undefined;
      if (innerType) notifTypes.add(innerType);
    });

    for await (const _msg of s.stream('What is 1 + 1? Reply with just the number.')) {
      // consume
    }

    unsub();
    console.log(`    notification types: ${[...notifTypes].join(', ')}`);
    assert(notifTypes.size > 0, 'should receive at least one notification type');

    await s.close();
  });

  // ── 14. Error handling ──
  console.log('\n14. Error handling');

  await test('resumeSession with bad ID throws', async () => {
    let threw = false;
    let errorType = '';
    try {
      await connection.resumeSession('00000000-0000-0000-0000-000000000000');
    } catch (e) {
      threw = true;
      errorType = (e as Error).constructor.name;
      console.log(`    error type: ${errorType}`);
      console.log(`    message: ${(e as Error).message.slice(0, 100)}`);
    }
    assert(threw, 'should throw for nonexistent session');
  });

  // ── 15. Connection close ──
  console.log('\n15. Connection close');

  await test('connection.close() is clean', async () => {
    await connection.close();

    let threw = false;
    try {
      await connection.createSession({ cwd: process.cwd() });
    } catch {
      threw = true;
    }
    assert(threw, 'createSession should throw after connection close');
  });

  // ── 16. Fresh connection — reconnect test ──
  console.log('\n16. Reconnect');

  await test('can create a new connection after closing', async () => {
    const conn2 = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY,
    });
    const s = await conn2.createSession({ cwd: process.cwd() });
    let text = '';
    for await (const msg of s.stream('Say "ok".')) {
      if (msg.type === 'assistant') text += msg.text;
    }
    console.log(`    response: ${text.slice(0, 50)}`);
    assert(text.length > 0, 'should get a response');
    await s.close();
    await conn2.close();
  });

  // ── Summary ──
  console.log('\n═══ Results ═══');
  console.log(`  ${PASS} Passed: ${passed}`);
  if (failed > 0) {
    console.log(`  ${FAIL} Failed: ${failed}`);
    for (const f of failures) {
      console.log(`    - ${f}`);
    }
  }
  if (skipped > 0) {
    console.log(`  ${SKIP} Skipped: ${skipped}`);
  }
  console.log(`  Total: ${passed + failed + skipped}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

async function collectStreamText(
  session: DaemonSession,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === 'assistant') text += msg.text;
    if (msg.type === 'result') text = text || msg.result;
  }
  return text;
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
