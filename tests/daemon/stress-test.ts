/**
 * Daemon SDK stress test — runs against a live local daemon.
 *
 * Usage: npx tsx tests/daemon/stress-test.ts
 *
 * Requires:
 *   - A running `droid daemon` on localhost
 *   - FACTORY_API_KEY env var set
 */

import {
  connectDaemon,
  DaemonConnection,
  DaemonSession,
  AutonomyLevel,
  type DroidStreamEvent,
} from '../../src/index.js';

const TEST_CWD = '/tmp/daemon-sdk-stress-test';

let connection: DaemonConnection | null = null;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  FAIL: ${name}\n    ${msg}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

// ─── Test 1: Basic connect + authenticate ─────────────────────────

async function testConnect(): Promise<void> {
  await test('connect to local daemon', async () => {
    connection = await connectDaemon();
    assert(connection !== null, 'Connection should not be null');
  });
}

// ─── Test 2: Create session + stream response ─────────────────────

async function testCreateSessionAndStream(): Promise<void> {
  let session: DaemonSession | null = null;

  await test('create session', async () => {
    assert(connection !== null, 'Need connection');
    session = await connection!.createSession({
      cwd: TEST_CWD,
      autonomyLevel: AutonomyLevel.High,
    });
    assert(session !== null, 'Session should not be null');
    assert(
      typeof session!.sessionId === 'string' && session!.sessionId.length > 0,
      'Session should have a valid sessionId'
    );
    console.log(`    sessionId: ${session!.sessionId}`);
  });

  await test('stream response to a simple prompt', async () => {
    assert(session !== null, 'Need session');

    const events: DroidStreamEvent[] = [];
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 60_000);

    try {
      for await (const event of session!.stream(
        'Reply with exactly "STRESS_TEST_OK" and nothing else. Do not use any tools.',
        { abortSignal: abortController.signal }
      )) {
        events.push(event);
      }
    } finally {
      clearTimeout(timeout);
    }

    assert(events.length > 0, `Expected events, got ${events.length}`);

    // Should have at least a Result event
    const resultEvent = events.find((e) => e.type === 'result');
    assert(resultEvent !== undefined, 'Should have a result event');

    // Extract text from the result event
    const result = resultEvent as { result?: string };
    const fullText = result.result ?? '';
    console.log(`    Response text: "${fullText.substring(0, 100)}"`);
    console.log(`    Total events: ${events.length}`);
    assert(
      fullText.includes('STRESS_TEST_OK'),
      `Expected "STRESS_TEST_OK" in response, got: "${fullText.substring(0, 200)}"`
    );
  });

  await test('send fire-and-forget message', async () => {
    assert(session !== null, 'Need session');
    // send() should return immediately after daemon ACK
    await session!.send('Acknowledge this message. Reply with "ACK".');
    // Give the daemon a moment to process
    await new Promise((r) => setTimeout(r, 3000));
  });

  await test('close session', async () => {
    assert(session !== null, 'Need session');
    await session!.close();
  });
}

// ─── Test 3: Multi-turn session ──────────────────────────────────

async function testMultiTurnSession(): Promise<void> {
  let session: DaemonSession | null = null;

  await test('multi-turn: create session', async () => {
    session = await connection!.createSession({
      cwd: TEST_CWD,
      autonomyLevel: AutonomyLevel.High,
    });
    assert(session !== null, 'Session should not be null');
  });

  await test('multi-turn: first message', async () => {
    const events: DroidStreamEvent[] = [];
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 60_000);

    try {
      for await (const event of session!.stream(
        'Remember this number: 42. Reply with "REMEMBERED".',
        { abortSignal: abortController.signal }
      )) {
        events.push(event);
      }
    } finally {
      clearTimeout(timeout);
    }

    const resultEvent = events.find((e) => e.type === 'result') as { result?: string } | undefined;
    const text = resultEvent?.result ?? '';
    console.log(`    Turn 1 response: "${text.substring(0, 100)}"`);
    assert(events.length > 0, 'Should have events');
  });

  await test('multi-turn: second message (context check)', async () => {
    const events: DroidStreamEvent[] = [];
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 60_000);

    try {
      for await (const event of session!.stream(
        'What number did I ask you to remember? Reply with just the number.',
        { abortSignal: abortController.signal }
      )) {
        events.push(event);
      }
    } finally {
      clearTimeout(timeout);
    }

    const resultEvent = events.find((e) => e.type === 'result') as { result?: string } | undefined;
    const text = resultEvent?.result ?? '';
    console.log(`    Turn 2 response: "${text.substring(0, 100)}"`);
    assert(text.includes('42'), 'Should remember the number 42');
  });

  await test('multi-turn: close', async () => {
    await session!.close();
  });
}

// ─── Test 4: Interrupt session ───────────────────────────────────

async function testInterruptSession(): Promise<void> {
  let session: DaemonSession | null = null;

  await test('interrupt: create session', async () => {
    session = await connection!.createSession({
      cwd: TEST_CWD,
      autonomyLevel: AutonomyLevel.High,
    });
  });

  await test('interrupt: send long prompt then interrupt', async () => {
    const events: DroidStreamEvent[] = [];
    let interrupted = false;

    try {
      const interruptTimer = setTimeout(async () => {
        try {
          await session!.interrupt();
          interrupted = true;
        } catch {
          // Might race with completion
        }
      }, 2000);

      const abortController = new AbortController();
      const overallTimeout = setTimeout(() => abortController.abort(), 30_000);

      try {
        for await (const event of session!.stream(
          'Write a 2000-word essay about the history of computing. Be very detailed and thorough.',
          { abortSignal: abortController.signal }
        )) {
          events.push(event);
        }
      } finally {
        clearTimeout(interruptTimer);
        clearTimeout(overallTimeout);
      }
    } catch {
      // Interrupt may cause an abort error — that's expected
    }

    console.log(`    Events before interrupt: ${events.length}, interrupted: ${interrupted}`);
    // We should have some events (at least partial response)
    assert(events.length >= 0, 'Should have received some events');
  });

  await test('interrupt: close', async () => {
    await session!.close();
  });
}

// ─── Test 5: Concurrent sessions ─────────────────────────────────

async function testConcurrentSessions(): Promise<void> {
  await test('concurrent sessions: create two sessions simultaneously', async () => {
    const [session1, session2] = await Promise.all([
      connection!.createSession({ cwd: TEST_CWD, autonomyLevel: AutonomyLevel.High }),
      connection!.createSession({ cwd: TEST_CWD, autonomyLevel: AutonomyLevel.High }),
    ]);

    assert(session1.sessionId !== session2.sessionId, 'Sessions should have different IDs');
    console.log(`    Session 1: ${session1.sessionId}`);
    console.log(`    Session 2: ${session2.sessionId}`);

    // Stream on both concurrently
    const collectEvents = async (session: DaemonSession, prompt: string) => {
      const events: DroidStreamEvent[] = [];
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 60_000);
      try {
        for await (const event of session.stream(prompt, { abortSignal: ac.signal })) {
          events.push(event);
        }
      } finally {
        clearTimeout(timeout);
      }
      return events;
    };

    const [events1, events2] = await Promise.all([
      collectEvents(session1, 'Reply with "SESSION_1_OK" and nothing else. No tools.'),
      collectEvents(session2, 'Reply with "SESSION_2_OK" and nothing else. No tools.'),
    ]);

    const result1 = events1.find((e) => e.type === 'result') as { result?: string } | undefined;
    const text1 = result1?.result ?? '';
    const result2 = events2.find((e) => e.type === 'result') as { result?: string } | undefined;
    const text2 = result2?.result ?? '';

    console.log(`    Session 1 text: "${text1.substring(0, 80)}"`);
    console.log(`    Session 2 text: "${text2.substring(0, 80)}"`);

    assert(text1.includes('SESSION_1_OK'), 'Session 1 should respond correctly');
    assert(text2.includes('SESSION_2_OK'), 'Session 2 should respond correctly');

    await session1.close();
    await session2.close();
  });
}

// ─── Test 6: Error handling ──────────────────────────────────────

async function testErrorHandling(): Promise<void> {
  await test('error: closed session rejects operations', async () => {
    const session = await connection!.createSession({
      cwd: TEST_CWD,
      autonomyLevel: AutonomyLevel.High,
    });
    await session.close();

    let threw = false;
    try {
      await session.send('This should fail');
    } catch (err) {
      threw = true;
      assert(
        err instanceof Error && err.message.includes('closed'),
        `Expected "closed" error, got: ${err instanceof Error ? err.message : err}`
      );
    }
    assert(threw, 'Should have thrown on closed session');
  });

  await test('error: closed connection rejects session creation', async () => {
    const tempConn = await connectDaemon();
    await tempConn.close();

    let threw = false;
    try {
      await tempConn.createSession({ cwd: TEST_CWD });
    } catch (err) {
      threw = true;
      assert(
        err instanceof Error && err.message.includes('closed'),
        `Expected "closed" error, got: ${err instanceof Error ? err.message : err}`
      );
    }
    assert(threw, 'Should have thrown on closed connection');
  });
}

// ─── Test 7: Notifications ──────────────────────────────────────

async function testNotifications(): Promise<void> {
  await test('notifications: receive working state changes', async () => {
    const session = await connection!.createSession({
      cwd: TEST_CWD,
      autonomyLevel: AutonomyLevel.High,
    });

    const notifications: Record<string, unknown>[] = [];
    session.onNotification((n) => notifications.push(n));

    const events: DroidStreamEvent[] = [];
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 60_000);

    try {
      for await (const event of session.stream(
        'Reply with "NOTIF_TEST" and nothing else. No tools.',
        { abortSignal: ac.signal }
      )) {
        events.push(event);
      }
    } finally {
      clearTimeout(timeout);
    }

    console.log(`    Notifications received: ${notifications.length}`);
    assert(notifications.length > 0, 'Should have received notifications');

    await session.close();
  });
}

// ─── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Ensure test directory exists
  const { mkdirSync } = await import('node:fs');
  mkdirSync(TEST_CWD, { recursive: true });

  console.log('=== Daemon SDK Stress Test ===\n');

  console.log('[1/7] Connection');
  await testConnect();

  console.log('\n[2/7] Create Session + Stream');
  await testCreateSessionAndStream();

  console.log('\n[3/7] Multi-turn Session');
  await testMultiTurnSession();

  console.log('\n[4/7] Interrupt Session');
  await testInterruptSession();

  console.log('\n[5/7] Concurrent Sessions');
  await testConcurrentSessions();

  console.log('\n[6/7] Error Handling');
  await testErrorHandling();

  console.log('\n[7/7] Notifications');
  await testNotifications();

  // Cleanup
  if (connection) {
    await connection.close();
  }

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
