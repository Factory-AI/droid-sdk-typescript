# @factory/droid-sdk

TypeScript SDK for the [Factory](https://factory.ai) Droid CLI. Provides a high-level API for interacting with Droid as a subprocess, with streaming message support, multi-turn sessions, spec mode, tool controls, initialization metadata, session forking, session discovery, and tool permission handling.

## Requirements

- **Node.js 18+**
- The `droid` CLI installed and available on your PATH

## Installation

```bash
npm install @factory/droid-sdk
```

## Quick Start

Send a one-shot prompt and get the final response:

```ts
import { run } from '@factory/droid-sdk';

const result = await run('What files are in the current directory?', {
  cwd: '/my/project',
});

console.log(result.text);
```

`run()` returns a successful `DroidResult` or throws an SDK error such as
`ConnectionError`, `TimeoutError`, or `ProcessExitError`.

## Multi-Turn Sessions

Use `createSession()` for persistent conversations with multiple turns:

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

// Streaming turn
for await (const msg of session.stream('List all TypeScript files')) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

// Non-streaming turn
const result = await session.send('Summarize the project');
console.log(result.text);

await session.close();
```

Resume an existing session by ID:

```ts
import { resumeSession } from '@factory/droid-sdk';

const session = await resumeSession('session-id-here');
const result = await session.send('Continue where we left off');
console.log(result.text);
await session.close();
```

The returned `DroidSession` also exposes `session.initResult`, which contains the raw `initialize_session` or `load_session` result returned by the JSON-RPC server.

## Initialization Metadata

Inspect the raw initialization metadata from `query()`, `createSession()`, and `resumeSession()`:

```ts
import { createSession, query, resumeSession } from '@factory/droid-sdk';

const stream = query({
  prompt: 'Reply with "ready" and nothing else.',
  cwd: '/my/project',
});

console.log(stream.sessionId); // null before initialization
console.log(stream.initResult); // null before initialization

const initialized = await stream.initialized;
console.log(initialized.sessionId);
console.log(initialized.settings.modelId);
stream.abort();

const session = await createSession({ cwd: '/my/project' });
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

const plan = await session.send('Draft a plan for adding integration tests');
console.log(plan.text);

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
import { createSession, resumeSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

await session.send('Remember this phrase: mango sunrise');

const { newSessionId } = await session.forkSession();
const fork = await resumeSession(newSessionId, { cwd: '/my/project' });

const result = await fork.send('What phrase did I ask you to remember?');
console.log(result.text);

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
  query,
  ToolConfirmationOutcome,
} from '@factory/droid-sdk';

const stream = query({
  prompt: 'Create a hello.txt file',
  cwd: '/my/project',
  permissionHandler(params) {
    console.log('Tool permission requested:', params);
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

for await (const msg of stream) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

## API Reference

### Top-Level Functions

| Function                      | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `run(text, options?)`         | One-shot prompt → `Promise<DroidResult>`                         |
| `query(options)`              | One-shot prompt → async generator of `DroidMessage` events       |
| `createSession(options?)`     | Create a new multi-turn session → `DroidSession`                 |
| `resumeSession(id, options?)` | Resume an existing session → `DroidSession`                      |
| `listSessions(options?)`      | List droid sessions saved on disk → `Promise<SessionMetadata[]>` |

### `run(text, options?): Promise<DroidResult>`

Creates a temporary session, sends one prompt, returns the aggregated
`DroidResult`, and closes the session automatically. It accepts the same session
creation options as `createSession()` plus message attachment options.

### `query(options): DroidQuery`

Returns an async generator that yields `DroidMessage` events. The returned `DroidQuery` object also exposes:

- **`interrupt()`** — gracefully interrupt the agent's current turn
- **`abort()`** — forcefully kill the subprocess
- **`sessionId`** — the session ID (available after initialization)
- **`initResult`** — cached `initialize_session` result, or `null` before initialization
- **`initialized`** — promise that resolves with the `initialize_session` result

`query(options)` also accepts an `abortSignal` for external cancellation.

### `DroidSession`

Returned by `createSession()` and `resumeSession()`. Key methods:

- **`stream(text, options?)`** — send a message, returns async generator of `DroidMessage`
- **`send(text, options?)`** — send a message, returns aggregated `DroidResult`
- **`interrupt()`** — interrupt the current turn
- **`close()`** — close the session and release resources
- **`updateSettings(params)`** — update model, autonomy level, etc.
- **`enterSpecMode(params?)`** — switch the current session into spec mode
- **`forkSession()`** — create a forked server-side session and return its new session ID
- **`compactSession(params?)`** — request server-side compaction
- **`getRewindInfo(params)`** / **`executeRewind(params)`** — inspect or execute rewind operations
- **`getContextStats()`** — read current context window utilization
- **`addMcpServer(params)`** / **`removeMcpServer(params)`** / **`toggleMcpServer(params)`** — manage MCP servers
- **`listMcpServers()`** / **`listMcpTools()`** / **`authenticateMcpServer(params)`** — inspect and authenticate MCP servers
- **`listSkills()`** — list available skills
- **`listTools(params?)`** — inspect the exec tool catalog and current allow/deny state
- **`renameSession(params)`** — rename the current session
- **`onNotification(callback, filter?)`** — subscribe to raw session notifications
- **`sessionId`** — the session ID
- **`initResult`** — cached `initialize_session` or `load_session` result

### `DroidResult`

Returned by `session.send()`:

- **`text`** — concatenated assistant response text
- **`messages`** — all `DroidMessage` objects from the turn
- **`tokenUsage`** — final token usage, or `null`

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
| `permission_resolved`      | Tool permission outcome                 |
| `settings_updated`         | Session settings changed                |
| `turn_complete`            | Sentinel: agent turn finished           |
| `session_title_updated`    | Session title changed                   |
| `mcp_status_changed`       | MCP server status changed               |
| `mcp_auth_required`        | MCP authentication required             |
| `mcp_auth_completed`       | MCP authentication completed            |
| `mission_state_changed`    | Mission state changed                   |
| `mission_features_changed` | Mission feature list changed            |
| `mission_progress_entry`   | Mission progress log updated            |
| `mission_heartbeat`        | Mission heartbeat received              |
| `mission_worker_started`   | Mission worker started                  |
| `mission_worker_completed` | Mission worker completed                |
| `error`                    | Error event from the process            |

### Options

`QueryOptions` and `CreateSessionOptions` accept:

- **`prompt`** — the user prompt (query only)
- **`cwd`** — working directory for the session
- **`machineId`** — machine identifier for initialization
- **`modelId`** — LLM model identifier
- **`autonomyLevel`** — `AutonomyLevel` enum value
- **`interactionMode`** — `DroidInteractionMode` enum value
- **`reasoningEffort`** — `ReasoningEffort` enum value
- **`specModeModelId`** — override model used in spec mode
- **`specModeReasoningEffort`** — override reasoning level used in spec mode
- **`mcpServers`** — initial MCP server configurations
- **`tags`** — session tags; the SDK appends its own SDK tag automatically
- **`enabledToolIds`** — explicit exec tool allowlist
- **`disabledToolIds`** — explicit exec tool denylist
- **`images`** / **`files`** — message attachments for `run()`, `session.send()`, and `session.stream()`
- **`permissionHandler`** — callback for tool confirmations
- **`askUserHandler`** — callback for interactive questions
- **`abortSignal`** — standard `AbortSignal` for cancellation
- **`execPath`** — path to `droid` executable (default: `"droid"`)
- **`execArgs`** / **`env`** — subprocess arguments and environment overrides
- **`transport`** — provide a custom transport instead of spawning a process

### `DroidClient`

Low-level JSON-RPC client for advanced use. Provides typed methods for the underlying protocol operations, including session management, tool controls, MCP management, compaction, rewind, and bug-report helpers. Most users should prefer `run()`, `query()`, and `createSession()`.

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

- **[`run.ts`](./examples/run.ts)** — one-shot run with aggregated result
- **[`simple-query.ts`](./examples/simple-query.ts)** — one-shot query with streaming output
- **[`multi-turn-session.ts`](./examples/multi-turn-session.ts)** — multi-turn session lifecycle
- **[`abort-session-stream.ts`](./examples/abort-session-stream.ts)** — cancel an in-flight streaming session turn with `AbortSignal`
- **[`init-metadata.ts`](./examples/init-metadata.ts)** — read initialization and load metadata from query/session APIs
- **[`permission-handler.ts`](./examples/permission-handler.ts)** — custom permission handling
- **[`interrupt-session.ts`](./examples/interrupt-session.ts)** — interrupt an active streaming turn
- **[`spec-mode-same-session.ts`](./examples/spec-mode-same-session.ts)** — approve a spec and continue in the same session
- **[`spec-mode-new-session.ts`](./examples/spec-mode-new-session.ts)** — approve a spec and hand off implementation to a new session
- **[`tool-controls.ts`](./examples/tool-controls.ts)** — configure allow/deny lists and inspect tool availability
- **[`fork-session.ts`](./examples/fork-session.ts)** — fork a session and continue from the new session ID
- **[`compact-session.ts`](./examples/compact-session.ts)** — compact a session's history
- **[`rewind-session.ts`](./examples/rewind-session.ts)** — inspect and execute rewind operations
- **[`list-sessions.ts`](./examples/list-sessions.ts)** — discover droid sessions saved on disk

## License

Apache 2.0
