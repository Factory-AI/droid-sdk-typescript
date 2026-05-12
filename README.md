# @factory/droid-sdk

TypeScript SDK for the [Factory](https://factory.ai) Droid CLI. Provides a high-level API for interacting with Droid as a subprocess, with one-shot prompts, streaming messages, multi-turn sessions, structured output, SDK-backed MCP tools, spec mode, tool controls, initialization metadata, session forking, session discovery, and tool permission handling.

## Requirements

- **Node.js 18+**
- The `droid` CLI installed and available on your PATH

## Installation

```bash
npm install @factory/droid-sdk
```

## Quick Start

Send a one-shot prompt and get the aggregated result:

```ts
import { run } from '@factory/droid-sdk';

const result = await run('What files are in the current directory?', {
  cwd: '/my/project',
});

console.log(result.text);
```

Create a session when you want to stream one or more turns:

```ts
import { DroidMessageType, createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

try {
  for await (const msg of session.stream(
    'What files are in the current directory?'
  )) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      process.stdout.write(msg.text);
    }
    if (msg.type === DroidMessageType.TurnComplete) {
      console.log('\nDone!');
    }
  }
} finally {
  await session.close();
}
```

## Structured Output

Request a JSON object that matches a JSON Schema:

```ts
import { OutputFormatType, run } from '@factory/droid-sdk';

const result = await run('Pick a favorite number between 1 and 42.', {
  cwd: '/my/project',
  outputFormat: {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: {
        favoriteNumber: {
          type: 'number',
          minimum: 1,
          maximum: 42,
        },
      },
      required: ['favoriteNumber'],
    },
  },
});

console.log(result.structuredOutput?.favoriteNumber);
```

Structured output is available on `run()` and `session.stream(prompt, options)` through the `outputFormat` message option. `run()` parses the final object into `result.structuredOutput`; streaming callers can read and parse the final assistant message themselves.

## Multi-Turn Sessions

Use `createSession()` for persistent conversations with multiple turns:

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });
console.log(session.sessionId);

// Streaming turn
for await (const msg of session.stream('List all TypeScript files')) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

// Later turns use the same streaming API
for await (const msg of session.stream('Summarize the project')) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await session.close();
```

Use `session.sessionId` to persist the session ID, then resume it later:

```ts
import { resumeSession } from '@factory/droid-sdk';

const session = await resumeSession(savedSessionId, {
  cwd: '/my/project',
});
for await (const msg of session.stream('Continue where we left off')) {
  // Handle streamed DroidMessage events.
}
await session.close();
```

The returned `DroidSession` also exposes `session.initResult`, which contains the raw `initialize_session` or `load_session` result returned by the JSON-RPC server.

## SDK-backed MCP Tools

Expose in-process TypeScript tools to Droid through MCP:

```ts
import { z } from 'zod';

import {
  DroidMessageType,
  ToolConfirmationOutcome,
  createSession,
  createSdkMcpServer,
  tool,
} from '@factory/droid-sdk';

const sdkTools = createSdkMcpServer({
  name: 'sdk-tools',
  tools: [
    tool(
      'favorite_number',
      'Returns a favorite number for a person',
      { name: z.string() },
      ({ name }) => `${name}'s favorite number is 42.`
    ),
  ],
});

const session = await createSession({
  cwd: '/my/project',
  mcpServers: [sdkTools],
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});

for await (const msg of session.stream(
  'Use the favorite_number tool for Ada and tell me the answer.'
)) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await session.close();
```

`createSdkMcpServer()` is managed by the SDK session lifecycle. Use `tool()` with a Zod object shape for typed tool input validation.

## Initialization Metadata

Inspect the raw initialization metadata from `createSession()` and `resumeSession()`:

```ts
import { createSession, resumeSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });
console.log(session.sessionId);
console.log(session.initResult.settings.modelId);

const resumed = await resumeSession(session.sessionId, { cwd: '/my/project' });
console.log(resumed.initResult.cwd);

await resumed.close();
await session.close();
```

## Spec Mode

Start a session directly in spec mode, or enter spec mode later on an existing session:

```ts
import {
  DroidMessageType,
  createSession,
  DroidInteractionMode,
  ReasoningEffort,
} from '@factory/droid-sdk';

const session = await createSession({
  cwd: '/my/project',
  interactionMode: DroidInteractionMode.Spec,
  specModeReasoningEffort: ReasoningEffort.High,
  specModeModelId: 'claude-sonnet-4-20250514',
});

for await (const msg of session.stream(
  'Draft a plan for adding integration tests'
)) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await session.enterSpecMode({
  specModeReasoningEffort: ReasoningEffort.High,
});

await session.close();
```

When handling spec-mode approval, you can approve implementation in the same session with `ToolConfirmationOutcome.ProceedOnce`, or hand off to a fresh session with `ToolConfirmationOutcome.ProceedNewSessionHigh`.

## Tool Controls

Control which exec tools are available at session start, inspect the current tool catalog, and update tool overrides later:

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  cwd: '/my/project',
  enabledToolIds: ['Read'],
  disabledToolIds: ['Execute'],
});

const { tools } = await session.listTools();
console.log(
  tools.map((tool) => ({
    id: tool.llmId,
    allowed: tool.currentlyAllowed,
  }))
);

await session.updateSettings({
  disabledToolIds: ['Read', 'Execute'],
});

await session.close();
```

## Forking Sessions

Fork the current server-side session and continue from the new session ID:

```ts
import {
  DroidMessageType,
  createSession,
  resumeSession,
} from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

for await (const _msg of session.stream(
  'Remember this phrase: mango sunrise'
)) {
  // Consume the turn.
}

const { newSessionId } = await session.forkSession();
const fork = await resumeSession(newSessionId, { cwd: '/my/project' });

for await (const msg of fork.stream('What phrase did I ask you to remember?')) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await fork.close();
await session.close();
```

## Listing Sessions

Discover droid sessions saved on disk (mirrors the CLI's `/sessions` command). Reads `~/.factory/sessions/` directly — no droid process is spawned, so this works even when no session is running:

```ts
import { listSessions } from '@factory/droid-sdk';

// Sessions for the current project (cwd defaults to process.cwd())
const current = await listSessions();

// 10 most recent sessions in the current project
const recent = await listSessions({ numSessions: 10 });

// Every session on disk, most recent first
const all = await listSessions({ fetchOutsideCWD: true });

// 10 most recent sessions across all projects
const recentAcrossProjects = await listSessions({
  fetchOutsideCWD: true,
  numSessions: 10,
});

// Sessions for a specific other project
const other = await listSessions({ cwd: '/Users/me/other-repo' });

for (const s of current) {
  console.log(`[${s.id}] ${s.title} (${s.messageCount} msgs)`);
}
```

Each `SessionMetadata` record includes `id`, `title`, `sessionTitle`, `owner`, `messageCount`, `modifiedTime`, `createdTime`, `isFavorite`, `cwd`, `decompSessionType`, and `decompMissionId`. Archived sessions (those with an `archivedAt` in their settings file) are excluded automatically. Results are sorted by `modifiedTime` descending.

`ListSessionsOptions`:

- **`cwd`** — working directory to scope the listing to (default `process.cwd()`). Ignored when `fetchOutsideCWD` is `true`.
- **`fetchOutsideCWD`** — return sessions from every working directory on disk (default `false`)
- **`numSessions`** — cap on total sessions returned
- **`sessionsDir`** — override the sessions root (default `~/.factory/sessions/`)

## Permission Handling

Handle tool confirmation requests with a custom permission handler:

```ts
import {
  DroidMessageType,
  createSession,
  ToolConfirmationOutcome,
} from '@factory/droid-sdk';

const session = await createSession({
  cwd: '/my/project',
  permissionHandler(params) {
    console.log('Tool permission requested:', params);
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

try {
  for await (const msg of session.stream('Create a hello.txt file')) {
    if (msg.type === DroidMessageType.AssistantTextDelta) {
      process.stdout.write(msg.text);
    }
  }
} finally {
  await session.close();
}
```

## API Reference

### Top-Level Functions

| Function                      | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `run(prompt, options?)`       | One-shot prompt → aggregated `DroidResult`                       |
| `createSession(options?)`     | Create a new multi-turn session → `DroidSession`                 |
| `resumeSession(id, options?)` | Resume an existing session → `DroidSession`                      |
| `listSessions(options?)`      | List droid sessions saved on disk → `Promise<SessionMetadata[]>` |
| `createSdkMcpServer(options)` | Create an SDK-managed MCP server for in-process tools            |
| `tool(...)`                   | Define a typed SDK-backed MCP tool                               |

### `DroidSession`

Returned by `createSession()` and `resumeSession()`. Key methods:

- **`stream(prompt, options?)`** — stream `DroidMessage` events for one turn
- **`interrupt()`** — interrupt the current turn
- **`close()`** — close the session and release resources
- **`updateSettings(params)`** — update model, autonomy level, etc.
- **`enterSpecMode(params?)`** — switch the current session into spec mode
- **`forkSession()`** — create a forked server-side session and return its new session ID
- **`compactSession(params?)`** — compact session history and return the new session ID
- **`getContextStats()`** — read current context window utilization
- **`addMcpServer(params)`** / **`removeMcpServer(params)`** / **`toggleMcpServer(params)`** — manage MCP servers
- **`listMcpServers()`** / **`listMcpTools()`** / **`authenticateMcpServer(params)`** — inspect and authenticate MCP servers
- **`listTools(params?)`** — inspect the exec tool catalog and current allow/deny state
- **`renameSession(params)`** — rename the current session
- **`getRewindInfo(params)`** / **`executeRewind(params)`** — inspect and execute file rewind operations
- **`sessionId`** — the session ID
- **`initResult`** — cached `initialize_session` or `load_session` result

### `DroidResult`

Returned by `run()`:

- **`sessionId`** — session that produced the result
- **`text`** — concatenated assistant response text
- **`messages`** — all `DroidMessage` objects from the turn
- **`tokenUsage`** — final token usage, or `null`
- **`durationMs`** — wall-clock time spent consuming the turn
- **`turnCount`** — number of completed turns observed while consuming the stream
- **`error`** — first Droid error event from the turn, or `null`
- **`structuredOutput`** — parsed structured JSON object, or `null`
- **`success`** — `true` when no Droid error event was emitted

### `DroidMessage` Types

All messages have a discriminated `type` field:

```ts
import { DroidMessageType } from '@factory/droid-sdk';

if (msg.type === DroidMessageType.AssistantTextDelta) {
  process.stdout.write(msg.text);
}
```

| Type                       | Description                             |
| -------------------------- | --------------------------------------- |
| `assistant_text_delta`     | Streaming text token from the assistant |
| `thinking_text_delta`      | Streaming reasoning/thinking token      |
| `tool_use`                 | Tool invocation by the assistant        |
| `tool_result`              | Result from a tool execution            |
| `tool_progress`            | Progress update during tool execution   |
| `working_state_changed`    | Agent working state transition          |
| `token_usage_update`       | Updated token usage counters            |
| `create_message`           | Full assistant message created          |
| `turn_complete`            | Sentinel: agent turn finished           |
| `session_title_updated`    | Session title changed                   |
| `mcp_status_changed`       | MCP server status changed               |
| `mission_state_changed`    | Mission state changed                   |
| `mission_features_changed` | Mission features changed                |
| `mission_progress_entry`   | Mission progress log changed            |
| `mission_heartbeat`        | Mission heartbeat                       |
| `mission_worker_started`   | Mission worker started                  |
| `mission_worker_completed` | Mission worker completed                |
| `mcp_auth_required`        | MCP authentication required             |
| `mcp_auth_completed`       | MCP authentication completed            |
| `permission_resolved`      | Tool permission request resolved        |
| `settings_updated`         | Session settings changed                |
| `error`                    | Error event from the process            |

### Options

Session creation options used by `run()` and `createSession()` include:

- **`cwd`** — working directory for the session
- **`execPath`** — path to `droid` executable (default: `"droid"`)
- **`execArgs`** — extra CLI arguments for the spawned droid process
- **`env`** — environment variables for the spawned process
- **`transport`** — provide a custom transport instead of spawning a process
- **`modelId`** — LLM model identifier
- **`autonomyLevel`** — `AutonomyLevel` enum value
- **`interactionMode`** — `DroidInteractionMode` enum value
- **`reasoningEffort`** — `ReasoningEffort` enum value
- **`specModeModelId`** — override model used in spec mode
- **`specModeReasoningEffort`** — override reasoning level used in spec mode
- **`mcpServers`** — initial MCP server configurations, including SDK-backed MCP servers from `createSdkMcpServer()`
- **`enabledToolIds`** — explicit exec tool allowlist
- **`disabledToolIds`** — explicit exec tool denylist
- **`permissionHandler`** — callback for tool confirmations
- **`askUserHandler`** — callback for interactive questions
- **`abortSignal`** — standard `AbortSignal` for cancellation

`resumeSession()` accepts the process, transport, handler, `cwd`, `mcpServers`, and `abortSignal` options needed to reconnect to an existing session, but does not accept new-session-only options such as `modelId` or `interactionMode`.

Message APIs (`run()` and `session.stream()`) also accept:

- **`images`** — base64 image attachments
- **`files`** — document/file attachments
- **`outputFormat`** — structured output request, currently `OutputFormatType.JsonSchema`
- **`abortSignal`** — standard `AbortSignal` for turn cancellation

### `DroidClient`

Low-level JSON-RPC client for advanced use. Provides typed methods for the underlying protocol operations, including `listTools()`, `renameSession()`, `getRewindInfo()`, and `executeRewind()`. Most users should prefer `run()` and `createSession()`.

### Error Types

| Error                  | Description                            |
| ---------------------- | -------------------------------------- |
| `ConnectionError`      | Failed to connect to the droid process |
| `ProtocolError`        | JSON-RPC protocol error                |
| `SessionError`         | Base session error                     |
| `SessionNotFoundError` | Session ID not found                   |
| `TimeoutError`         | Request timed out                      |
| `ProcessExitError`     | Droid subprocess exited unexpectedly   |

## Examples

See the [`examples/`](./examples) directory for runnable examples:

- **[`session-stream.ts`](./examples/session-stream.ts)** — session streaming output
- **[`run.ts`](./examples/run.ts)** — one-shot prompt with aggregated result
- **[`multi-turn-session.ts`](./examples/multi-turn-session.ts)** — multi-turn session lifecycle
- **[`abort-session-stream.ts`](./examples/abort-session-stream.ts)** — cancel an in-flight streaming session turn with `AbortSignal`
- **[`interrupt-session.ts`](./examples/interrupt-session.ts)** — interrupt a running session turn
- **[`init-metadata.ts`](./examples/init-metadata.ts)** — read initialization and load metadata from session APIs
- **[`result-metadata.ts`](./examples/result-metadata.ts)** — inspect `DroidResult` metadata from `run()`
- **[`structured-output.ts`](./examples/structured-output.ts)** — request and parse structured output
- **[`droid-dev-structured-output.ts`](./examples/droid-dev-structured-output.ts)** — structured output smoke test with configurable Droid executable
- **[`permission-handler.ts`](./examples/permission-handler.ts)** — custom permission handling
- **[`spec-mode-same-session.ts`](./examples/spec-mode-same-session.ts)** — approve a spec and continue in the same session
- **[`spec-mode-new-session.ts`](./examples/spec-mode-new-session.ts)** — approve a spec and hand off implementation to a new session
- **[`tool-controls.ts`](./examples/tool-controls.ts)** — configure allow/deny lists and inspect tool availability
- **[`sdk-mcp-tool.ts`](./examples/sdk-mcp-tool.ts)** — expose SDK-defined tools to Droid through MCP
- **[`fork-session.ts`](./examples/fork-session.ts)** — fork a session and continue from the new session ID
- **[`list-sessions.ts`](./examples/list-sessions.ts)** — discover droid sessions saved on disk
- **[`test-compact.ts`](./examples/test-compact.ts)** — compact session history
- **[`test-rewind.ts`](./examples/test-rewind.ts)** — use low-level rewind APIs

## License

Apache 2.0
