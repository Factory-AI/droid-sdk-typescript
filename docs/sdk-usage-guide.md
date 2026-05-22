# SDK Usage Guide

## Getting Started

```bash
npm install @factory/droid-sdk
```

Requires Node.js 18+ and the `droid` CLI on your PATH.

```ts
import { run } from '@factory/droid-sdk';

const result = await run('What files are in this directory?', {
  cwd: process.cwd(),
});
console.log(result.text);
```

---

## One-shot Run

Send a prompt, get a result, done. The session is created and closed automatically.

```ts
import { run } from '@factory/droid-sdk';

const result = await run('What is 2 + 2?', { cwd: process.cwd() });
console.log(result.text);
```

## Structured Output

Force the response to match a JSON schema. The validated object is available on `result.structuredOutput`.

```ts
import { OutputFormatType, run } from '@factory/droid-sdk';

const result = await run('Pick a number between 1 and 42.', {
  cwd: process.cwd(),
  outputFormat: {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: { number: { type: 'number' } },
      required: ['number'],
    },
  },
});

console.log((result.structuredOutput as { number: number }).number);
```

## Multi-turn Session

Create a session once, then call `stream()` multiple times. Context is preserved across turns.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream('Remember the word "mango".')) {
  // consume first turn
}

for await (const msg of session.stream('What word did I say?')) {
  if (msg.type === 'assistant') console.log(msg.text);
}

await session.close();
```

## Resume Session

Reconnect to a previously created session by its ID.

```ts
import { resumeSession } from '@factory/droid-sdk';

const session = await resumeSession('existing-session-id');

for await (const msg of session.stream('Continue where we left off.')) {
  if (msg.type === 'assistant') console.log(msg.text);
}

await session.close();
```

## Full Message Streaming

`stream()` yields complete messages: assistant text, tool calls, tool results, hooks, errors, and the final result.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream(
  'List files in the current directory.'
)) {
  switch (msg.type) {
    case DroidMessageType.Assistant:
      console.log(msg.text);
      break;
    case DroidMessageType.ToolCall:
      console.log(`[Tool] ${msg.toolUse.name}`);
      break;
    case DroidMessageType.ToolResult:
      console.log(`[Result] ${msg.isError ? 'Error' : 'OK'}`);
      break;
    case DroidMessageType.Result:
      console.log(`Done in ${msg.durationMs}ms`);
      break;
  }
}

await session.close();
```

## Partial Message Streaming

Enable `includePartialMessages` to get token-by-token deltas, thinking blocks, and tool progress as they arrive.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream('Explain recursion.', {
  includePartialMessages: true,
})) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await session.close();
```

## Interrupt or Cancel Running Work

Use `session.interrupt()` to stop the current turn server-side, or pass an `AbortSignal` to cancel from the client.

```ts
import { createSession } from '@factory/droid-sdk';

// Interrupt after receiving some output
const session = await createSession({ cwd: process.cwd() });
for await (const msg of session.stream('Write a long essay.')) {
  if (msg.type === 'assistant') {
    await session.interrupt();
  }
}
await session.close();

// Or cancel with AbortSignal
const session2 = await createSession({ cwd: process.cwd() });
const controller = new AbortController();
setTimeout(() => controller.abort(), 2000);

try {
  for await (const msg of session2.stream('Write a long essay.', {
    abortSignal: controller.signal,
  })) {
  }
} catch {
  console.log('Aborted');
}
await session2.close();
```

## SDK-backed MCP Tools

Define custom tools that Droid can call during a session. Tools are served via a local MCP server that the SDK manages automatically.

```ts
import {
  createSession,
  createSdkMcpServer,
  tool,
  ToolConfirmationOutcome,
} from '@factory/droid-sdk';
import { z } from 'zod';

const server = createSdkMcpServer({
  name: 'my-tools',
  tools: [
    tool(
      'lookup',
      'Look up a user by name',
      { name: z.string() },
      ({ name }) => {
        return `${name} is user #42.`;
      }
    ),
  ],
});

const session = await createSession({
  cwd: process.cwd(),
  mcpServers: [server],
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});

for await (const msg of session.stream('Look up Alice.')) {
  if (msg.type === 'assistant') console.log(msg.text);
}

await session.close();
```

## Autonomy Levels

Control what Droid can do without asking for permission. Set at session creation or change mid-session.

```ts
import { createSession, AutonomyLevel } from '@factory/droid-sdk';

const session = await createSession({
  cwd: process.cwd(),
  autonomyLevel: AutonomyLevel.High, // Off | Low | Medium | High
});

// Change mid-session
await session.updateSettings({ autonomyLevel: AutonomyLevel.Low });
await session.close();
```

## Enabled/Disabled Tools

Restrict which tools Droid can use. Accepts tool IDs like `'Read'`, `'Execute'`, `'Grep'`.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  cwd: process.cwd(),
  enabledToolIds: ['Read', 'Grep'],
  disabledToolIds: ['Execute'],
});

// Change mid-session
await session.updateSettings({ disabledToolIds: ['Read', 'Execute'] });
await session.close();
```

## Permission Handler

Programmatically approve or reject tool calls instead of prompting a human. Receives full tool details including file paths and commands.

```ts
import {
  run,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

await run('Create hello.txt with "Hello, World!"', {
  cwd: process.cwd(),
  permissionHandler(params) {
    const safe = params.toolUses.every(
      (item) => item.details.type === ToolConfirmationType.Create
    );
    return safe
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
  },
});
```

## Spec Mode

Start Droid in read-only planning mode. It will research and produce a plan, then request to exit spec mode for implementation.

```ts
import {
  createSession,
  DroidInteractionMode,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

const session = await createSession({
  cwd: process.cwd(),
  interactionMode: DroidInteractionMode.Spec,
  permissionHandler(params) {
    const exitsSpec = params.toolUses.some(
      (t) => t.details.type === ToolConfirmationType.ExitSpecMode
    );
    return exitsSpec
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
  },
});

for await (const msg of session.stream('Plan a refactor of src/utils.ts')) {
}
await session.close();
```

## Multimodal Input

Send images or documents alongside your prompt. Images must be base64-encoded.

```ts
import { readFileSync } from 'node:fs';
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream('Describe this image.', {
  images: [
    {
      type: 'base64',
      data: readFileSync('screenshot.png').toString('base64'),
      mediaType: 'image/png',
    },
  ],
})) {
  if (msg.type === 'assistant') console.log(msg.text);
}

await session.close();
```

## Fork Session

Create a copy of the current session with all context preserved. Useful for branching a conversation.

```ts
import { createSession, resumeSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });
for await (const msg of session.stream('Remember: the password is "banana".')) {
}

const { newSessionId } = await session.forkSession();
const fork = await resumeSession(newSessionId);

for await (const msg of fork.stream('What is the password?')) {
  if (msg.type === 'assistant') console.log(msg.text);
}

await fork.close();
await session.close();
```

## Compact Session

Summarize and remove old messages to free up context window space.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

// ... after many turns ...
const result = await session.compactSession();
console.log(
  `New session: ${result.newSessionId}, removed: ${result.removedCount} messages`
);

await session.close();
```

## Rewind

Undo to a specific message and optionally restore files to their state at that point.

```ts
import {
  DroidClient,
  ProcessTransport,
  AutonomyLevel,
} from '@factory/droid-sdk';

const transport = new ProcessTransport({ cwd: process.cwd() });
await transport.connect();
const client = new DroidClient({ transport });

await client.initializeSession({
  machineId: 'default',
  cwd: process.cwd(),
  autonomyLevel: AutonomyLevel.High,
});

const messageId = 'target-message-id';
const info = await client.getRewindInfo({ messageId });
console.log(`Files available to restore: ${info.availableFiles.length}`);

const result = await client.executeRewind({
  messageId,
  filesToRestore: info.availableFiles,
  filesToDelete: [],
  forkTitle: 'Rewind checkpoint',
});
console.log(`Rewound into session: ${result.newSessionId}`);

await client.close();
```

## List Sessions

Discover saved sessions on disk. Filters to the current project by default.

```ts
import { listSessions } from '@factory/droid-sdk';

const sessions = await listSessions({ numSessions: 10 });

for (const s of sessions) {
  console.log(`${s.id}: ${s.sessionTitle ?? '(untitled)'}`);
}
```

## Model and Reasoning Effort

Choose which model to use and how much reasoning effort to apply. Configurable at creation or mid-session.

```ts
import { createSession, ReasoningEffort } from '@factory/droid-sdk';

const session = await createSession({
  cwd: process.cwd(),
  modelId: 'claude-sonnet-4-20250514',
  reasoningEffort: ReasoningEffort.High,
});

// Change mid-session
await session.updateSettings({
  reasoningEffort: ReasoningEffort.Low,
});

await session.close();
```

## Hook Execution Monitoring

Observe file hooks (pre/post tool execution hooks) as they run during a session.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream('Create a new file.')) {
  if (msg.type === DroidMessageType.Hook) {
    if (msg.status === 'started') {
      console.log(`[Hook] ${msg.command}`);
    } else {
      console.log(`[Hook ${msg.status}] exit=${msg.exitCode}`);
    }
  }
}

await session.close();
```

## Ask-User Handler

Programmatically answer questions that Droid asks the user during execution.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  cwd: process.cwd(),
  askUserHandler(params) {
    return {
      cancelled: false,
      answers: params.questions.map((q) => ({
        index: q.index,
        question: q.question,
        answer: q.options[0] ?? 'yes',
      })),
    };
  },
});

for await (const msg of session.stream('Help me set up this project.')) {
  if (msg.type === 'assistant') console.log(msg.text);
}

await session.close();
```

## MCP Server Management

Add, remove, toggle, and list MCP servers at runtime within an active session.

```ts
import { createSession, McpServerType } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

await session.addMcpServer({
  name: 'my-server',
  type: McpServerType.Http,
  url: 'https://mcp.example.com/mcp',
});

const { servers, summary } = await session.listMcpServers();
console.log(`MCP status: ${summary.status}, servers: ${servers.length}`);

await session.close();
```

## Context Stats

Query current context window usage to understand how much capacity remains.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });
for await (const msg of session.stream('Hello')) {
}

const stats = await session.getContextStats();
console.log(
  `Used: ${stats.used}, Remaining: ${stats.remaining}, Limit: ${stats.limit}`
);

await session.close();
```

## Token Usage Tracking

Monitor token consumption in real-time via stream events, or read the final totals from the result.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream('Summarize this project.', {
  includePartialMessages: true,
})) {
  if (msg.type === DroidMessageType.TokenUsageUpdate) {
    console.log(`Tokens — in: ${msg.inputTokens}, out: ${msg.outputTokens}`);
  }
  if (msg.type === DroidMessageType.Result && msg.tokenUsage) {
    console.log(
      `Final — in: ${msg.tokenUsage.inputTokens}, out: ${msg.tokenUsage.outputTokens}`
    );
  }
}

await session.close();
```

## List Skills

List all available skills in the current session.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });
const { skills } = await session.listSkills();

for (const skill of skills) {
  console.log(`${skill.name} (${skill.location}): ${skill.description ?? ''}`);
}

await session.close();
```

## Raw Notification Subscription

Subscribe to raw protocol notifications for custom event handling beyond the stream API.

```ts
import { createSession, SessionNotificationType } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });

const unsubscribe = session.onNotification(
  (notification) => {
    console.log('Notification:', notification);
  },
  { type: SessionNotificationType.ERROR }
);

// ... use the session ...

unsubscribe();
await session.close();
```

## Error Handling

The SDK throws typed errors with structured context. Catch specific error classes to handle different failure modes.

```ts
import {
  resumeSession,
  ConnectionError,
  TimeoutError,
  SessionNotFoundError,
  ProtocolError,
} from '@factory/droid-sdk';

try {
  const session = await resumeSession('nonexistent-id');
} catch (error) {
  if (error instanceof SessionNotFoundError) {
    console.log(`Session not found: ${error.sessionId}`);
  } else if (error instanceof TimeoutError) {
    console.log('Request timed out');
  } else if (error instanceof ConnectionError) {
    console.log(`Connection failed: ${error.message}`);
  } else if (error instanceof ProtocolError) {
    console.log(`Protocol error ${error.code}: ${error.message}`);
  }
}
```

## Low-level APIs

Most users should use `run()` and `DroidSession`. For direct RPC access, the SDK also exports `ProcessTransport`, `ProtocolEngine`, and `DroidClient`.

`DroidClient` exposes additional methods not on `DroidSession`: `killWorkerSession()`, `cancelMcpAuth()`, `clearMcpAuth()`, `submitMcpAuthCode()`, `listMcpRegistry()`, `toggleMcpTool()`, and `submitBugReport()`.

The package also exports its full Zod schema surface from `src/schemas/index.ts` for runtime validation of protocol payloads.

---

## Configuration Reference

### `CreateSessionOptions`

| Field                     | Type                     | Description                                                 |
| :------------------------ | :----------------------- | :---------------------------------------------------------- |
| `cwd`                     | `string`                 | Working directory for the session                           |
| `machineId`               | `string`                 | Machine identifier for initialization                       |
| `modelId`                 | `string`                 | LLM model identifier                                        |
| `autonomyLevel`           | `AutonomyLevel`          | `Off` \| `Low` \| `Medium` \| `High`                        |
| `interactionMode`         | `DroidInteractionMode`   | `Auto` \| `Spec` \| `AGI`                                   |
| `reasoningEffort`         | `ReasoningEffort`        | `None` \| `Low` \| `Medium` \| `High` \| `Max` (and others) |
| `specModeModelId`         | `string`                 | Override model for spec mode                                |
| `specModeReasoningEffort` | `ReasoningEffort`        | Override reasoning effort for spec mode                     |
| `mcpServers`              | `DroidMcpServerConfig[]` | Initial MCP server configurations                           |
| `enabledToolIds`          | `string[]`               | Tool allowlist                                              |
| `disabledToolIds`         | `string[]`               | Tool denylist                                               |
| `tags`                    | `SessionTag[]`           | Session tags for categorization                             |
| `permissionHandler`       | `PermissionHandler`      | Tool confirmation callback                                  |
| `askUserHandler`          | `AskUserHandler`         | Structured user-input callback                              |
| `execPath`                | `string`                 | Path to `droid` executable (default: `"droid"`)             |
| `execArgs`                | `string[]`               | Extra CLI arguments for the subprocess                      |
| `env`                     | `Record<string, string>` | Environment variables for the subprocess                    |
| `transport`               | `DroidClientTransport`   | Custom transport (skips subprocess spawn)                   |
| `abortSignal`             | `AbortSignal`            | Cancellation signal                                         |

### `MessageOptions`

Accepted by `session.stream()` and `run()`:

| Field                    | Type                  | Description                                  |
| :----------------------- | :-------------------- | :------------------------------------------- |
| `images`                 | `Base64ImageSource[]` | Base64-encoded image attachments             |
| `files`                  | `DocumentSource[]`    | Document/file attachments                    |
| `outputFormat`           | `OutputFormat`        | Structured output JSON schema request        |
| `includePartialMessages` | `boolean`             | Yield token-level deltas and progress events |
| `abortSignal`            | `AbortSignal`         | Cancellation signal for this turn            |

### Error Types

| Error                  | Description                               |
| :--------------------- | :---------------------------------------- |
| `ConnectionError`      | Failed to connect to the droid subprocess |
| `ProtocolError`        | JSON-RPC or protocol-level failure        |
| `SessionError`         | Base session error                        |
| `SessionNotFoundError` | Requested session does not exist          |
| `TimeoutError`         | RPC timed out                             |
| `ProcessExitError`     | Subprocess exited unexpectedly            |
