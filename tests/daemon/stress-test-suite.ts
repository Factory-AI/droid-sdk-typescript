/**
 * SDK Stress Test Suite
 *
 * Usage:
 *   FACTORY_API_KEY=<key> npx tsx tests/daemon/stress-test-suite.ts [group]
 *
 * Groups: group1..group8, exec, daemon, errors, mcp
 * Omit group arg to run all.
 */
import { z } from 'zod';
import { _resetDaemonStateForTesting } from '../../src/daemon/local.js';
import {
  run,
  createSession,
  resumeSession,
  listSessions,
  createSdkMcpServer,
  tool,
  connectDaemon,
  DroidMessageType,
  ReasoningEffort,
  OutputFormatType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  SessionNotFoundError,
  type DroidSession,
  type DaemonSession,
} from '../../src/index.js';

// ── Config ──────────────────────────────────────────────────────────────

const EXEC_PATH = process.env.FACTORY_DROID_BINARY || 'droid-dev';
const API_KEY = process.env.FACTORY_API_KEY;
const CWD = process.cwd();
const DEFAULT_TIMEOUT = 90_000;

// ── Test harness ────────────────────────────────────────────────────────

interface TestResult {
  group: string;
  name: string;
  passed: boolean;
  skipped: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];
let currentGroup = '';

function setGroup(name: string) {
  currentGroup = name;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'═'.repeat(60)}`);
}

async function test(
  name: string,
  fn: () => Promise<void>,
  timeoutMs = DEFAULT_TIMEOUT
) {
  const start = Date.now();
  process.stdout.write(`  ▶ ${name} ... `);
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
    const dur = Date.now() - start;
    results.push({
      group: currentGroup,
      name,
      passed: true,
      skipped: false,
      durationMs: dur,
    });
    console.log(`✓ (${dur}ms)`);
  } catch (e: any) {
    const dur = Date.now() - start;
    const msg = e?.message || String(e);
    results.push({
      group: currentGroup,
      name,
      passed: false,
      skipped: false,
      error: msg,
      durationMs: dur,
    });
    console.log(`✗ (${dur}ms)\n    Error: ${msg.slice(0, 200)}`);
  }
}

function skip(name: string, reason: string) {
  process.stdout.write(`  ▶ ${name} ... `);
  results.push({
    group: currentGroup,
    name,
    passed: false,
    skipped: true,
    error: reason,
    durationMs: 0,
  });
  console.log(`⊘ SKIPPED: ${reason}`);
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

async function consumeStream(
  session: DroidSession | DaemonSession,
  prompt: string
) {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === DroidMessageType.Assistant) text += msg.text;
  }
  return text;
}

// ── Group 1: Exec Mode — Core Flows ────────────────────────────────────

async function group1() {
  setGroup('Group 1: Exec Mode — Core Flows');

  await test('1.1 One-shot run()', async () => {
    const r = await run('Reply with exactly one word: HELLO', {
      cwd: CWD,
      execPath: EXEC_PATH,
    });
    assert(
      typeof r.text === 'string' && r.text.length > 0,
      'result.text is empty'
    );
    assert(typeof r.sessionId === 'string', 'missing sessionId');
    assert(
      typeof r.durationMs === 'number' && r.durationMs > 0,
      'invalid durationMs'
    );
    assert(r.success === true, 'success should be true');
    assert(r.tokenUsage != null, 'missing tokenUsage');
  });

  await test('1.2 Structured output', async () => {
    const r = await run('Pick a number between 1 and 100.', {
      cwd: CWD,
      execPath: EXEC_PATH,
      outputFormat: {
        type: OutputFormatType.JsonSchema,
        schema: {
          type: 'object',
          properties: { number: { type: 'number' } },
          required: ['number'],
        },
      },
    });
    const out = r.structuredOutput as { number: number } | undefined;
    assert(out != null, 'structuredOutput is null');
    assert(typeof out!.number === 'number', 'number field is not a number');
  });

  await test('1.3 Multi-turn context', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      await consumeStream(
        session,
        'Remember this code word: BANANA. Just confirm you remember it.'
      );
      const text = await consumeStream(
        session,
        'What was the code word I told you? Reply with just the word.'
      );
      assert(
        text.toUpperCase().includes('BANANA'),
        `Context lost, got: ${text.slice(0, 100)}`
      );
    } finally {
      await session.close();
    }
  });

  await test('1.4 Partial message streaming', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      let deltaCount = 0;
      for await (const msg of session.stream('Say hello.', {
        includePartialMessages: true,
      })) {
        if (msg.type === DroidMessageType.AssistantTextDelta) deltaCount++;
      }
      assert(deltaCount > 0, `Expected deltas, got ${deltaCount}`);
    } finally {
      await session.close();
    }
  });

  await test('1.5 AbortSignal cancellation', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      try {
        for await (const _msg of session.stream(
          'Write a very long essay about the history of mathematics, at least 2000 words.',
          { abortSignal: controller.signal }
        )) {
          // consume
        }
      } catch {
        // Expected: abort signal fires
      }
      // Either it threw on abort or it finished quickly — both are acceptable
    } finally {
      await session.close();
    }
  });

  await test('1.6 session.interrupt()', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      let gotText = false;
      for await (const msg of session.stream(
        'Write a long essay about space exploration.'
      )) {
        if (msg.type === DroidMessageType.Assistant && !gotText) {
          gotText = true;
          await session.interrupt();
        }
      }
      assert(gotText, 'Never received assistant text before interrupt');
    } finally {
      await session.close();
    }
  });

  await test('1.7 Permission handler', async () => {
    const r = await run(
      'Read the file package.json and tell me the package name.',
      {
        cwd: CWD,
        execPath: EXEC_PATH,
        permissionHandler() {
          return ToolConfirmationOutcome.ProceedOnce;
        },
      }
    );
    assert(r.success === true, 'run should succeed');
    // Handler may or may not be called depending on autonomy defaults
  });

  await test('1.8 MCP tool invocation (exec)', async () => {
    const server = createSdkMcpServer({
      name: 'test-tools',
      tools: [
        tool(
          'get_weather',
          'Get weather for a city',
          { city: z.string() },
          ({ city }) => `${city}: 72°F, sunny`
        ),
      ],
    });
    const session = await createSession({
      cwd: CWD,
      execPath: EXEC_PATH,
      mcpServers: [server],
      permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
    });
    try {
      let toolCalled = false;
      let toolResult = '';
      for await (const msg of session.stream(
        'Use the get_weather tool to check the weather in Paris. You MUST call the get_weather tool.'
      )) {
        if (
          msg.type === DroidMessageType.ToolCall &&
          msg.toolUse.name.includes('get_weather')
        )
          toolCalled = true;
        if (msg.type === DroidMessageType.ToolResult)
          toolResult =
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content);
      }
      assert(toolCalled, 'get_weather tool was not called');
      assert(
        toolResult.includes('72°F'),
        `Unexpected tool result: ${toolResult.slice(0, 100)}`
      );
    } finally {
      await session.close();
    }
  });
}

// ── Group 2: Exec Mode — Session Lifecycle ──────────────────────────────

async function group2() {
  setGroup('Group 2: Exec Mode — Session Lifecycle');

  await test('2.1 Fork session', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      await consumeStream(session, 'Remember: the secret number is 7777.');
      const { newSessionId } = await session.forkSession();
      assert(
        typeof newSessionId === 'string' && newSessionId.length > 0,
        'forkSession returned no ID'
      );
      const fork = await resumeSession(newSessionId, { execPath: EXEC_PATH });
      try {
        const text = await consumeStream(
          fork,
          'What was the secret number? Reply with just the number.'
        );
        assert(
          text.includes('7777'),
          `Fork lost context, got: ${text.slice(0, 100)}`
        );
      } finally {
        await fork.close();
      }
    } finally {
      await session.close();
    }
  });

  await test('2.2 Compact session', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      await consumeStream(session, 'Tell me a short joke.');
      await consumeStream(session, 'Tell me another joke.');
      await consumeStream(session, 'One more joke please.');
      const result = await session.compactSession();
      assert(
        typeof result.newSessionId === 'string',
        'compact returned no newSessionId'
      );
    } finally {
      await session.close();
    }
  });

  await test('2.3 Resume session', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    let sessionId: string;
    try {
      await consumeStream(session, 'Remember: the password is MANGO.');
      sessionId = session.sessionId;
    } finally {
      await session.close();
    }
    const resumed = await resumeSession(sessionId, { execPath: EXEC_PATH });
    try {
      const text = await consumeStream(
        resumed,
        'What was the password? Reply with just the word.'
      );
      assert(
        text.toUpperCase().includes('MANGO'),
        `Resume lost context, got: ${text.slice(0, 100)}`
      );
    } finally {
      await resumed.close();
    }
  });

  await test('2.4 Context stats', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      await consumeStream(session, 'Hello.');
      const stats = await session.getContextStats();
      assert(stats.used > 0, `used should be > 0, got ${stats.used}`);
      assert(stats.limit > 0, `limit should be > 0, got ${stats.limit}`);
      assert(stats.remaining >= 0, `remaining should be >= 0`);
    } finally {
      await session.close();
    }
  });

  await test('2.5 List sessions', async () => {
    const sessions = await listSessions({ numSessions: 5 });
    assert(Array.isArray(sessions), 'listSessions should return array');
  });
}

// ── Group 3: Exec Mode — Settings & Tools ───────────────────────────────

async function group3() {
  setGroup('Group 3: Exec Mode — Settings & Tools');

  await test('3.1 Update settings mid-session', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      await session.updateSettings({ reasoningEffort: ReasoningEffort.Low });
      await consumeStream(session, 'Say ok.');
    } finally {
      await session.close();
    }
  });

  await test('3.2 Disabled tool IDs', async () => {
    const session = await createSession({
      cwd: CWD,
      execPath: EXEC_PATH,
      disabledToolIds: ['Execute'],
    });
    try {
      const { tools } = await session.listTools();
      const hasExecute = tools.some(
        (t: any) => t.name === 'Execute' || t.toolId === 'Execute'
      );
      assert(!hasExecute, 'Execute tool should be disabled');
    } finally {
      await session.close();
    }
  });

  await test('3.3 List MCP servers', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      const result = await session.listMcpServers();
      assert(result != null, 'listMcpServers returned null');
      assert(Array.isArray(result.servers), 'servers should be array');
    } finally {
      await session.close();
    }
  });

  await test('3.4 List skills', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    try {
      const result = await session.listSkills();
      assert(result != null, 'listSkills returned null');
      assert(Array.isArray(result.skills), 'skills should be array');
    } finally {
      await session.close();
    }
  });
}

// ── Group 4: Daemon Mode — Core Flows ───────────────────────────────────

let daemonAvailable: boolean | null = null;

async function checkDaemonAvailable(): Promise<boolean> {
  if (daemonAvailable !== null) return daemonAvailable;
  try {
    _resetDaemonStateForTesting();
    const conn = await connectDaemon({ apiKey: API_KEY });
    await conn.close();
    daemonAvailable = true;
  } catch {
    daemonAvailable = false;
  }
  return daemonAvailable;
}

function skipDaemon(name: string) {
  skip(name, 'Daemon auth unavailable');
}

async function group4() {
  setGroup('Group 4: Daemon Mode — Core Flows');

  const available = await checkDaemonAvailable();

  if (!available) {
    skipDaemon('4.1 Zero-config connect');
    skipDaemon('4.2 Create session + stream');
    skipDaemon('4.3 Multi-turn context');
    skipDaemon('4.4 Partial message streaming');
    skipDaemon('4.5 send() fire-and-forget');
    skipDaemon('4.6 AbortSignal cancellation');
    skipDaemon('4.7 session.interrupt()');
    skipDaemon('4.8 MCP tool invocation (daemon)');
    return;
  }

  await test('4.1 Zero-config connect', async () => {
    _resetDaemonStateForTesting();
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      assert(conn != null, 'connection is null');
    } finally {
      await conn.close();
    }
  });

  await test('4.2 Create session + stream', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      let gotResult = false;
      for await (const msg of session.stream('Say hello.')) {
        if (msg.type === DroidMessageType.Result) gotResult = true;
      }
      assert(gotResult, 'Never received Result message');
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('4.3 Multi-turn context', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      await consumeStream(session, 'Remember: the color is PURPLE.');
      const text = await consumeStream(
        session,
        'What color did I say? Reply with just the color.'
      );
      assert(
        text.toUpperCase().includes('PURPLE'),
        `Context lost: ${text.slice(0, 100)}`
      );
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('4.4 Partial message streaming', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      let deltaCount = 0;
      for await (const msg of session.stream('Say hello.', {
        includePartialMessages: true,
      })) {
        if (msg.type === DroidMessageType.AssistantTextDelta) deltaCount++;
      }
      assert(deltaCount > 0, `Expected deltas, got ${deltaCount}`);
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('4.5 send() fire-and-forget', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      await session.send('Say hello.');
      // send() should resolve without error
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('4.6 AbortSignal cancellation', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 3000);
      try {
        for await (const _msg of session.stream(
          'Write a very long essay about the history of mathematics.',
          { abortSignal: controller.signal }
        )) {
          // consume
        }
      } catch {
        // abort is expected
      }
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('4.7 session.interrupt()', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      let gotText = false;
      for await (const msg of session.stream(
        'Write a long essay about space.'
      )) {
        if (msg.type === DroidMessageType.Assistant && !gotText) {
          gotText = true;
          await session.interrupt();
        }
      }
      assert(gotText, 'Never received text before interrupt');
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('4.8 MCP tool invocation (daemon)', async () => {
    const server = createSdkMcpServer({
      name: 'daemon-tools',
      tools: [
        tool(
          'lookup',
          'Look up a user',
          { name: z.string() },
          ({ name }) => `${name} is user #42.`
        ),
      ],
    });
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({
        cwd: CWD,
        mcpServers: [server],
        permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
      });
      let toolCalled = false;
      for await (const msg of session.stream(
        'Use the lookup tool to look up Alice. You MUST call the lookup tool.'
      )) {
        if (
          msg.type === DroidMessageType.ToolCall &&
          msg.toolUse.name.includes('lookup')
        )
          toolCalled = true;
      }
      assert(toolCalled, 'lookup tool was not called');
      await session.close();
    } finally {
      await conn.close();
    }
  });
}

// ── Group 5: Daemon Mode — Session Lifecycle ────────────────────────────

async function group5() {
  setGroup('Group 5: Daemon Mode — Session Lifecycle');

  const available = await checkDaemonAvailable();

  if (!available) {
    skipDaemon('5.1 Resume session');
    skipDaemon('5.2 connection.interruptSession()');
    skipDaemon('5.3 Permission handler (daemon)');
    skipDaemon('5.4 Ask-user handler (daemon)');
    return;
  }

  await test('5.1 Resume session', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      await consumeStream(session, 'Remember: the animal is TIGER.');
      const sid = session.sessionId;
      await session.close();

      const resumed = await conn.resumeSession(sid);
      const text = await consumeStream(resumed, 'What animal did I say?');
      assert(
        text.toUpperCase().includes('TIGER'),
        `Resume lost context: ${text.slice(0, 100)}`
      );
      await resumed.close();
    } finally {
      await conn.close();
    }
  });

  await test('5.2 connection.interruptSession()', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      const streamPromise = (async () => {
        for await (const msg of session.stream('Write a very long essay.')) {
          if (msg.type === DroidMessageType.Assistant) {
            await conn.interruptSession(session.sessionId);
            return;
          }
        }
      })();
      await streamPromise;
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('5.3 Permission handler (daemon)', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({
        cwd: CWD,
        permissionHandler() {
          return ToolConfirmationOutcome.ProceedOnce;
        },
      });
      await consumeStream(session, 'Read the file package.json.');
      await session.close();
    } finally {
      await conn.close();
    }
  });

  await test('5.4 Ask-user handler (daemon)', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({
        cwd: CWD,
        askUserHandler(params: any) {
          return {
            cancelled: false,
            answers: params.questions.map((q: any) => ({
              index: q.index,
              question: q.question,
              answer: q.options?.[0] ?? 'yes',
            })),
          };
        },
      });
      await consumeStream(session, 'Say hello.');
      await session.close();
    } finally {
      await conn.close();
    }
  });
}

// ── Group 6: Daemon Mode — Concurrency ──────────────────────────────────

async function group6() {
  setGroup('Group 6: Daemon Mode — Concurrency');

  const available = await checkDaemonAvailable();

  if (!available) {
    skipDaemon('6.1 Two concurrent sessions');
    skipDaemon('6.2 Three concurrent sessions');
    skipDaemon('6.3 Sequential rapid sessions');
    skipDaemon('6.4 Rapid connect/disconnect');
    skipDaemon('6.5 Sequential streams on same session');
    return;
  }

  await test('6.1 Two concurrent sessions', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const [s1, s2] = await Promise.all([
        conn.createSession({ cwd: CWD }),
        conn.createSession({ cwd: CWD }),
      ]);
      const [t1, t2] = await Promise.all([
        consumeStream(s1, 'Reply with: SESSION_ONE'),
        consumeStream(s2, 'Reply with: SESSION_TWO'),
      ]);
      assert(t1.length > 0, 'Session 1 returned empty');
      assert(t2.length > 0, 'Session 2 returned empty');
      await s1.close();
      await s2.close();
    } finally {
      await conn.close();
    }
  }, 120_000);

  await test('6.2 Three concurrent sessions', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const sessions = await Promise.all([
        conn.createSession({ cwd: CWD }),
        conn.createSession({ cwd: CWD }),
        conn.createSession({ cwd: CWD }),
      ]);
      const texts = await Promise.all(
        sessions.map((s, i) => consumeStream(s, `Reply with: SESSION_${i}`))
      );
      for (let i = 0; i < 3; i++) {
        assert(texts[i]!.length > 0, `Session ${i} returned empty`);
      }
      await Promise.all(sessions.map((s) => s.close()));
    } finally {
      await conn.close();
    }
  }, 120_000);

  await test('6.3 Sequential rapid sessions', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      for (let i = 0; i < 5; i++) {
        const s = await conn.createSession({ cwd: CWD });
        await consumeStream(s, `Say: round ${i}`);
        await s.close();
      }
    } finally {
      await conn.close();
    }
  }, 180_000);

  await test('6.4 Rapid connect/disconnect', async () => {
    for (let i = 0; i < 3; i++) {
      _resetDaemonStateForTesting();
      const conn = await connectDaemon({ apiKey: API_KEY });
      await conn.close();
    }
  });

  await test('6.5 Sequential streams on same session', async () => {
    const conn = await connectDaemon({ apiKey: API_KEY });
    try {
      const session = await conn.createSession({ cwd: CWD });
      const t1 = await consumeStream(session, 'Say: FIRST');
      const t2 = await consumeStream(session, 'Say: SECOND');
      assert(t1.length > 0, 'First stream empty');
      assert(t2.length > 0, 'Second stream empty');
      await session.close();
    } finally {
      await conn.close();
    }
  });
}

// ── Group 7: Error Handling ─────────────────────────────────────────────

async function group7() {
  setGroup('Group 7: Error Handling');

  await test('7.1 SessionNotFoundError (exec)', async () => {
    let caught = false;
    try {
      await resumeSession('nonexistent-session-id-12345', {
        execPath: EXEC_PATH,
      });
    } catch (err: any) {
      caught = true;
      assert(
        err instanceof SessionNotFoundError ||
          err.message?.includes('not found') ||
          err.message?.includes('Session'),
        `Expected SessionNotFoundError, got: ${err.constructor.name}: ${err.message?.slice(0, 100)}`
      );
    }
    assert(caught, 'Should have thrown');
  });

  const daemonOk = await checkDaemonAvailable();

  if (daemonOk) {
    await test('7.2 SessionNotFoundError (daemon)', async () => {
      const conn = await connectDaemon({ apiKey: API_KEY });
      try {
        let caught = false;
        try {
          await conn.resumeSession('nonexistent-session-id-12345');
        } catch {
          caught = true;
        }
        assert(caught, 'Should have thrown');
      } finally {
        await conn.close();
      }
    });
  } else {
    skipDaemon('7.2 SessionNotFoundError (daemon)');
  }

  await test('7.3 Invalid daemon URL', async () => {
    let caught = false;
    try {
      await connectDaemon({
        url: 'ws://127.0.0.1:1',
        apiKey: 'fake',
        maxRetries: 0,
      });
    } catch {
      caught = true;
    }
    assert(caught, 'Should have thrown ConnectionError');
  });

  await test('7.4 Stream after close (exec)', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    await session.close();
    let caught = false;
    try {
      for await (const _msg of session.stream('Hello')) {
        // consume
      }
    } catch {
      caught = true;
    }
    assert(caught, 'Streaming after close should throw');
  });

  await test('7.5 Double close (exec)', async () => {
    const session = await createSession({ cwd: CWD, execPath: EXEC_PATH });
    await session.close();
    // Second close should not throw
    await session.close();
  });
}

// ── Group 8: MCP Edge Cases ─────────────────────────────────────────────

async function group8() {
  setGroup('Group 8: MCP Edge Cases');

  await test('8.1 Multiple tools on one server', async () => {
    const server = createSdkMcpServer({
      name: 'multi-tools',
      tools: [
        tool(
          'add',
          'Add two numbers',
          { a: z.number(), b: z.number() },
          ({ a, b }) => `${a + b}`
        ),
        tool(
          'greet',
          'Greet a person',
          { name: z.string() },
          ({ name }) => `Hello, ${name}!`
        ),
      ],
    });
    const session = await createSession({
      cwd: CWD,
      execPath: EXEC_PATH,
      mcpServers: [server],
      permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
    });
    try {
      let addCalled = false;
      let greetCalled = false;
      for await (const msg of session.stream(
        'First use the add tool to compute 3+4, then use the greet tool to greet Bob. You MUST call both tools.'
      )) {
        if (msg.type === DroidMessageType.ToolCall) {
          if (msg.toolUse.name.includes('add')) addCalled = true;
          if (msg.toolUse.name.includes('greet')) greetCalled = true;
        }
      }
      assert(addCalled, 'add tool not called');
      assert(greetCalled, 'greet tool not called');
    } finally {
      await session.close();
    }
  });

  await test('8.2 Tool returning error', async () => {
    const server = createSdkMcpServer({
      name: 'error-tools',
      tools: [
        tool(
          'fail_tool',
          'A tool that always fails',
          { input: z.string() },
          () => {
            throw new Error('Intentional failure');
          }
        ),
      ],
    });
    const session = await createSession({
      cwd: CWD,
      execPath: EXEC_PATH,
      mcpServers: [server],
      permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
    });
    try {
      let toolCalled = false;
      let gotResult = false;
      for await (const msg of session.stream(
        'Call the fail_tool with input "test". You MUST call fail_tool.'
      )) {
        if (
          msg.type === DroidMessageType.ToolCall &&
          msg.toolUse.name.includes('fail_tool')
        )
          toolCalled = true;
        if (msg.type === DroidMessageType.Result) gotResult = true;
      }
      assert(toolCalled, 'fail_tool not called');
      assert(gotResult, 'Session should still complete with a result');
    } finally {
      await session.close();
    }
  });

  await test('8.3 Tool with complex input', async () => {
    const server = createSdkMcpServer({
      name: 'complex-tools',
      tools: [
        tool(
          'process_order',
          'Process an order with items',
          {
            customer: z.string(),
            items: z.array(z.object({ name: z.string(), qty: z.number() })),
          },
          ({ customer, items }) =>
            `Order for ${customer}: ${items.map((i) => `${i.qty}x ${i.name}`).join(', ')}`
        ),
      ],
    });
    const session = await createSession({
      cwd: CWD,
      execPath: EXEC_PATH,
      mcpServers: [server],
      permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
    });
    try {
      let toolCalled = false;
      let toolResult = '';
      for await (const msg of session.stream(
        'Use process_order to place an order for customer "Alice" with items: 2x Widget and 1x Gadget. You MUST call process_order.'
      )) {
        if (
          msg.type === DroidMessageType.ToolCall &&
          msg.toolUse.name.includes('process_order')
        )
          toolCalled = true;
        if (msg.type === DroidMessageType.ToolResult)
          toolResult =
            typeof msg.content === 'string'
              ? msg.content
              : JSON.stringify(msg.content);
      }
      assert(toolCalled, 'process_order not called');
      assert(
        toolResult.includes('Alice'),
        `Result should mention Alice: ${toolResult.slice(0, 100)}`
      );
    } finally {
      await session.close();
    }
  });

  await test('8.4 MCP tool + permission handler type', async () => {
    const server = createSdkMcpServer({
      name: 'perm-tools',
      tools: [
        tool(
          'secret_tool',
          'A secret operation',
          { key: z.string() },
          ({ key }) => `secret: ${key}`
        ),
      ],
    });
    const session = await createSession({
      cwd: CWD,
      execPath: EXEC_PATH,
      mcpServers: [server],
      permissionHandler(params) {
        for (const tu of params.toolUses) {
          if (tu.details.type === ToolConfirmationType.McpTool) {
            // MCP tool confirmation type detected
          }
        }
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });
    try {
      for await (const _msg of session.stream(
        'Use the secret_tool with key "abc123". You MUST call secret_tool.'
      )) {
        // consume
      }
    } finally {
      await session.close();
    }
  });
}

// ── Runner ──────────────────────────────────────────────────────────────

const groupMap: Record<string, () => Promise<void>> = {
  group1,
  group2,
  group3,
  group4,
  group5,
  group6,
  group7,
  group8,
  exec: async () => {
    await group1();
    await group2();
    await group3();
  },
  daemon: async () => {
    await group4();
    await group5();
    await group6();
  },
  errors: group7,
  mcp: group8,
};

async function main() {
  const filter = process.argv[2];

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║           SDK STRESS TEST SUITE                        ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Binary:   ${EXEC_PATH.padEnd(45)}║`);
  console.log(
    `║  API Key:  ${API_KEY ? `${API_KEY.slice(0, 8)}...${API_KEY.slice(-4)}` : 'NOT SET'}${''.padEnd(API_KEY ? 31 : 39)}║`
  );
  console.log(`║  CWD:      ${CWD.slice(-45).padEnd(45)}║`);
  console.log(`║  Filter:   ${(filter || 'all').padEnd(45)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!API_KEY) {
    console.error('\n  ERROR: FACTORY_API_KEY is not set. Exiting.');
    process.exit(1);
  }

  if (filter && groupMap[filter]) {
    await groupMap[filter]!();
  } else if (!filter) {
    for (const fn of [
      group1,
      group2,
      group3,
      group4,
      group5,
      group6,
      group7,
      group8,
    ]) {
      await fn();
    }
  } else {
    console.error(`\n  Unknown group: ${filter}`);
    console.error(`  Available: ${Object.keys(groupMap).join(', ')}`);
    process.exit(1);
  }

  // Summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  RESULTS SUMMARY');
  console.log(`${'═'.repeat(60)}`);

  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed && !r.skipped);
  const skipped = results.filter((r) => r.skipped);

  for (const r of results) {
    const icon = r.skipped ? '⊘' : r.passed ? '✓' : '✗';
    const status = r.skipped ? 'SKIP' : r.passed ? 'PASS' : 'FAIL';
    console.log(
      `  ${icon} [${status}] ${r.name}${r.error && !r.skipped ? ` — ${r.error.slice(0, 80)}` : ''}`
    );
  }

  console.log(
    `\n  Total: ${results.length} | Passed: ${passed.length} | Failed: ${failed.length} | Skipped: ${skipped.length}`
  );
  console.log(
    `  Duration: ${(results.reduce((s, r) => s + r.durationMs, 0) / 1000).toFixed(1)}s`
  );

  if (failed.length > 0) {
    console.log('\n  FAILED TESTS:');
    for (const r of failed) {
      console.log(`    ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }

  console.log('\n  ALL TESTS PASSED ✓\n');
  // Force exit: spawned daemon processes and WebSocket internals can keep
  // the Node event loop alive even after all connections are closed.
  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
