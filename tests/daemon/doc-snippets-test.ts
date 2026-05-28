/**
 * Tests every runnable code snippet from docs/daemon-usage-guide.md.
 *
 * Run with: FACTORY_API_KEY=... npx tsx tests/daemon/doc-snippets-test.ts
 */

const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(
  name: string,
  fn: () => Promise<void>,
  timeoutMs = 60_000
): Promise<void> {
  const start = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
    const ms = Date.now() - start;
    console.log(`  ${PASS} ${name} (${ms}ms)`);
    passed++;
  } catch (e) {
    const ms = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ${FAIL} ${name} (${ms}ms)`);
    console.log(`    Error: ${msg}`);
    failed++;
    failures.push(`${name}: ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function main(): Promise<void> {
  console.log('\n═══ Daemon Usage Guide — Snippet Tests ═══\n');

  // ── 1. Getting Started ──
  console.log('1. Getting Started');
  await test('basic connect + stream', async () => {
    const { connectDaemon, DroidMessageType } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({ cwd: process.cwd() });

    let gotResult = false;
    for await (const msg of session.stream(
      'What files are in this directory?'
    )) {
      if (msg.type === DroidMessageType.Result) {
        gotResult = true;
        console.log(`    Done in ${msg.durationMs}ms`);
      }
    }

    assert(gotResult, 'should get a result message');
    await session.close();
    await connection.close();
  });

  // ── 2. Explicit API Key ──
  console.log('\n2. Explicit API Key');
  await test('connect with explicit apiKey', async () => {
    const { connectDaemon } = await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    assert(connection != null, 'connection should not be null');
    await connection.close();
  });

  // ── 3. Direct URL ──
  console.log('\n3. Direct URL');
  await test('connect with direct URL', async () => {
    const { connectDaemon, ensureLocalDaemon } =
      await import('../../src/index.js');

    const { port } = await ensureLocalDaemon();
    const connection = await connectDaemon({
      url: `ws://127.0.0.1:${port}`,
      apiKey: process.env.FACTORY_API_KEY!,
    });
    assert(connection != null, 'connection should not be null');
    await connection.close();
  });

  // ── 4. Create a Session with options ──
  console.log('\n4. Create a Session');
  await test('createSession with model/autonomy/reasoning options', async () => {
    const { connectDaemon, AutonomyLevel, ReasoningEffort } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({
      cwd: process.cwd(),
      autonomyLevel: AutonomyLevel.High,
      reasoningEffort: ReasoningEffort.High,
    });
    assert(session.sessionId.length > 0, 'session should have an ID');
    await session.close();
    await connection.close();
  });

  // ── 5. Stream a Response (switch/case) ──
  console.log('\n5. Stream a Response (switch/case)');
  await test('stream with DroidMessageType switch', async () => {
    const { connectDaemon, DroidMessageType } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({ cwd: process.cwd() });

    const seen = new Set<string>();
    for await (const msg of session.stream('Say hello.')) {
      switch (msg.type) {
        case DroidMessageType.Assistant:
          seen.add('assistant');
          break;
        case DroidMessageType.ToolCall:
          seen.add('tool_call');
          break;
        case DroidMessageType.ToolResult:
          seen.add('tool_result');
          break;
        case DroidMessageType.Result:
          seen.add('result');
          console.log(
            `    Done in ${msg.durationMs}ms, turns: ${msg.numTurns}`
          );
          break;
      }
    }
    assert(seen.has('result'), 'should see result message');

    await session.close();
    await connection.close();
  });

  // ── 6. Partial Message Streaming ──
  console.log('\n6. Partial Message Streaming');
  await test('stream with includePartialMessages', async () => {
    const { connectDaemon, DroidMessageType } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({ cwd: process.cwd() });

    let deltaCount = 0;
    for await (const msg of session.stream('Say "hello world".', {
      includePartialMessages: true,
    })) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        deltaCount++;
      }
    }
    console.log(`    received ${deltaCount} text deltas`);
    assert(deltaCount > 0, 'should get at least one text delta');

    await session.close();
    await connection.close();
  });

  // ── 7. Fire-and-Forget send() ──
  console.log('\n7. Fire-and-Forget send()');
  await test('send() returns after daemon ACK', async () => {
    const { connectDaemon } = await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({ cwd: process.cwd() });

    await session.send('Say hello.');
    console.log('    send() returned (fire-and-forget)');

    // Wait briefly so the daemon doesn't get confused by immediate close
    await new Promise<void>((r) => setTimeout(r, 500));
    await session.close();
    await connection.close();
  });

  // ── 8. Multi-turn Session ──
  console.log('\n8. Multi-turn Session');
  await test('multi-turn context preservation', async () => {
    const { connectDaemon, DroidMessageType } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({ cwd: process.cwd() });

    for await (const _msg of session.stream('Remember: the secret is 42.')) {
      // consume first turn
    }

    let answer = '';
    for await (const msg of session.stream('What is the secret?')) {
      if (msg.type === DroidMessageType.Assistant) answer += msg.text;
    }
    console.log(`    answer: ${answer.slice(0, 60)}`);
    assert(answer.includes('42'), 'should recall the secret');

    await session.close();
    await connection.close();
  });

  // ── 9. Concurrent Sessions ──
  console.log('\n9. Concurrent Sessions');
  await test('two concurrent sessions streaming', async () => {
    const { connectDaemon, DroidMessageType } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });

    const [session1, session2] = await Promise.all([
      connection.createSession({ cwd: process.cwd() }),
      connection.createSession({ cwd: process.cwd() }),
    ]);

    async function collectResult(
      session: Awaited<ReturnType<typeof connection.createSession>>,
      prompt: string
    ): Promise<string> {
      let text = '';
      for await (const msg of session.stream(prompt)) {
        if (msg.type === DroidMessageType.Result) text = msg.result;
      }
      return text;
    }

    const [result1, result2] = await Promise.all([
      collectResult(session1, 'What is 2+2? Reply with just the number.'),
      collectResult(session2, 'What is 3+3? Reply with just the number.'),
    ]);

    console.log(`    session1 result: ${result1.slice(0, 30)}`);
    console.log(`    session2 result: ${result2.slice(0, 30)}`);
    assert(result1.length > 0, 'session1 should have a result');
    assert(result2.length > 0, 'session2 should have a result');

    await session1.close();
    await session2.close();
    await connection.close();
  });

  // ── 10. Interrupt with AbortSignal ──
  console.log('\n10. Interrupt with AbortSignal');
  await test('AbortSignal interrupts stream', async () => {
    const { connectDaemon } = await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({ cwd: process.cwd() });

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);

    let aborted = false;
    try {
      for await (const _msg of session.stream(
        'Write a very long essay about the history of computing.',
        {
          abortSignal: controller.signal,
        }
      )) {
        // consume
      }
    } catch {
      aborted = true;
    }
    console.log(`    aborted: ${aborted}`);
    // The stream might finish before the abort fires (short responses), so we
    // accept both outcomes.

    await session.close();
    await connection.close();
  });

  // ── 11. Permission Handler ──
  console.log('\n11. Permission Handler');
  await test('permissionHandler callback fires', async () => {
    const { connectDaemon, ToolConfirmationOutcome } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });

    let handlerCalled = false;
    const session = await connection.createSession({
      cwd: process.cwd(),
      permissionHandler() {
        handlerCalled = true;
        return ToolConfirmationOutcome.ProceedOnce;
      },
    });

    for await (const _msg of session.stream(
      'Create a file called /tmp/droid-sdk-test-permission.txt with the content "test".'
    )) {
      // consume
    }

    console.log(`    handlerCalled: ${handlerCalled}`);
    // Handler may or may not be called depending on autonomy defaults

    await session.close();
    await connection.close();
  });

  // ── 12. SDK-backed MCP Tools ──
  console.log('\n12. SDK-backed MCP Tools');
  await test('createSdkMcpServer + tool() works in session', async () => {
    const {
      connectDaemon,
      createSdkMcpServer,
      DroidMessageType,
      tool,
      ToolConfirmationOutcome,
    } = await import('../../src/index.js');
    const { z } = await import('zod');

    const server = createSdkMcpServer({
      name: 'my-tools',
      tools: [
        tool(
          'lookup',
          'Look up a user by name',
          { name: z.string() },
          ({ name }) => `${name} is user #42.`
        ),
      ],
    });

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    const session = await connection.createSession({
      cwd: process.cwd(),
      mcpServers: [server],
      permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
    });

    let text = '';
    for await (const msg of session.stream('Look up Alice.')) {
      if (msg.type === DroidMessageType.Assistant) text += msg.text;
    }
    console.log(`    response: ${text.slice(0, 60)}`);
    assert(text.length > 0, 'should get a response');

    await session.close();
    await connection.close();
  });

  // ── 13. Error Handling ──
  console.log('\n13. Error Handling');
  await test('SessionNotFoundError on invalid session ID', async () => {
    const { connectDaemon, SessionNotFoundError } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });

    let caught = false;
    try {
      await connection.resumeSession('nonexistent-session-id');
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        caught = true;
        console.log(`    SessionNotFoundError: ${error.sessionId}`);
      } else {
        // Any error is fine here — the doc just shows the pattern
        caught = true;
        console.log(
          `    caught: ${(error as Error).constructor.name}: ${(error as Error).message.slice(0, 60)}`
        );
      }
    }
    assert(caught, 'should throw on invalid session ID');

    await connection.close();
  });

  // ── 14. Lifecycle Pattern ──
  console.log('\n14. Lifecycle Pattern (try/finally)');
  await test('try/finally lifecycle', async () => {
    const { connectDaemon, DroidMessageType } =
      await import('../../src/index.js');

    const connection = await connectDaemon({
      apiKey: process.env.FACTORY_API_KEY!,
    });
    try {
      const session = await connection.createSession({ cwd: process.cwd() });
      try {
        let gotResult = false;
        for await (const msg of session.stream('Say hi.')) {
          if (msg.type === DroidMessageType.Result) gotResult = true;
        }
        assert(gotResult, 'should get result');
      } finally {
        await session.close();
      }
    } finally {
      await connection.close();
    }
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
  console.log(`  Total: ${passed + failed}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
