# @factory/droid-sdk

TypeScript SDK for the [Factory](https://factory.ai) Droid CLI. Provides a high-level API for interacting with Droid as a subprocess, with streaming message support, multi-turn sessions, and tool permission handling.

## Requirements

- **Node.js 18+**
- The `droid` CLI installed and available on your PATH

## Installation

```bash
npm install @factory/droid-sdk
```

## Quick Start

Send a one-shot prompt and stream the response:

```ts
import { query } from '@factory/droid-sdk';

const stream = query({
  prompt: 'What files are in the current directory?',
  cwd: '/my/project',
});

for await (const msg of stream) {
  if (msg.type === 'assistant_text_delta') {
    process.stdout.write(msg.text);
  }
  if (msg.type === 'turn_complete') {
    console.log('\nDone!');
  }
}
```

## Multi-Turn Sessions

Use `createSession()` for persistent conversations with multiple turns:

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

// Streaming turn
for await (const msg of session.stream('List all TypeScript files')) {
  if (msg.type === 'assistant_text_delta') {
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

## Permission Handling

Handle tool confirmation requests with a custom permission handler:

```ts
import { query, ToolConfirmationOutcome } from '@factory/droid-sdk';

const stream = query({
  prompt: 'Create a hello.txt file',
  cwd: '/my/project',
  permissionHandler(params) {
    console.log('Tool permission requested:', params);
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

for await (const msg of stream) {
  if (msg.type === 'assistant_text_delta') {
    process.stdout.write(msg.text);
  }
}
```

## API Reference

### Top-Level Functions

| Function                      | Description                                                |
| ----------------------------- | ---------------------------------------------------------- |
| `query(options)`              | One-shot prompt → async generator of `DroidMessage` events |
| `createSession(options?)`     | Create a new multi-turn session → `DroidSession`           |
| `resumeSession(id, options?)` | Resume an existing session → `DroidSession`                |

### `query(options): DroidQuery`

Returns an async generator that yields `DroidMessage` events. The returned `DroidQuery` object also exposes:

- **`interrupt()`** — gracefully interrupt the agent's current turn
- **`abort()`** — forcefully kill the subprocess
- **`sessionId`** — the session ID (available after initialization)

### `DroidSession`

Returned by `createSession()` and `resumeSession()`. Key methods:

- **`stream(text, options?)`** — send a message, returns async generator of `DroidMessage`
- **`send(text, options?)`** — send a message, returns aggregated `DroidResult`
- **`interrupt()`** — interrupt the current turn
- **`close()`** — close the session and release resources
- **`updateSettings(params)`** — update model, autonomy level, etc.
- **`addMcpServer(params)`** / **`removeMcpServer(params)`** — manage MCP servers
- **`sessionId`** — the session ID

### `DroidResult`

Returned by `session.send()`:

- **`text`** — concatenated assistant response text
- **`messages`** — all `DroidMessage` objects from the turn
- **`tokenUsage`** — final token usage, or `null`

### `DroidMessage` Types

All messages have a discriminated `type` field:

| Type                    | Description                             |
| ----------------------- | --------------------------------------- |
| `assistant_text_delta`  | Streaming text token from the assistant |
| `thinking_text_delta`   | Streaming reasoning/thinking token      |
| `tool_use`              | Tool invocation by the assistant        |
| `tool_result`           | Result from a tool execution            |
| `tool_progress`         | Progress update during tool execution   |
| `working_state_changed` | Agent working state transition          |
| `token_usage_update`    | Updated token usage counters            |
| `create_message`        | Full assistant message created          |
| `turn_complete`         | Sentinel: agent turn finished           |
| `error`                 | Error event from the process            |

### Options

`QueryOptions` and `CreateSessionOptions` accept:

- **`prompt`** — the user prompt (query only)
- **`cwd`** — working directory for the session
- **`modelId`** — LLM model identifier
- **`autonomyLevel`** — `AutonomyLevel` enum value
- **`reasoningEffort`** — `ReasoningEffort` enum value
- **`permissionHandler`** — callback for tool confirmations
- **`askUserHandler`** — callback for interactive questions
- **`execPath`** — path to `droid` executable (default: `"droid"`)
- **`transport`** — provide a custom transport instead of spawning a process

### `DroidClient`

Low-level JSON-RPC client for advanced use. Provides typed methods for all 19 protocol operations. Most users should prefer `query()` and `createSession()`.

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

- **[`simple-query.ts`](./examples/simple-query.ts)** — one-shot query with streaming output
- **[`multi-turn-session.ts`](./examples/multi-turn-session.ts)** — multi-turn session lifecycle
- **[`permission-handler.ts`](./examples/permission-handler.ts)** — custom permission handling

## License

Apache 2.0
