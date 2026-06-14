# SDK Usage Guide

In-depth guide to `@factory/droid-sdk`, the TypeScript SDK for the Factory Droid CLI. For a quick overview and the public API reference, see the [README](../README.md). This guide is the depth document: it walks through each capability with a runnable example.

This guide covers **exec mode** (`run()`, `createSession()`), which spawns a `droid` subprocess per session. For WebSocket-based daemon mode with concurrent sessions, see the [Daemon Usage Guide](./daemon-usage-guide.md).

## Table of Contents

- [Getting Started](#getting-started)
- [Core Usage](#core-usage)
  - [One-shot Run](#one-shot-run)
  - [Structured Output](#structured-output)
- [Sessions](#sessions)
  - [Multi-turn Session](#multi-turn-session)
  - [Resume Session](#resume-session)
  - [Fork Session](#fork-session)
  - [Compact Session](#compact-session)
  - [List Sessions](#list-sessions)
  - [Rename Session](#rename-session)
- [Streaming](#streaming)
  - [Full Message Streaming](#full-message-streaming)
  - [Partial Message Streaming](#partial-message-streaming)
  - [Interrupt or Cancel Running Work](#interrupt-or-cancel-running-work)
- [Controlling the Droid](#controlling-the-droid)
  - [Autonomy Levels](#autonomy-levels)
  - [Enabled/Disabled Tools](#enableddisabled-tools)
  - [Permission Handler](#permission-handler)
  - [Ask-User Handler](#ask-user-handler)
  - [Spec Mode](#spec-mode)
  - [Model and Reasoning Effort](#model-and-reasoning-effort)
  - [Multimodal Input](#multimodal-input)
- [MCP](#mcp)
  - [SDK-backed MCP Tools](#sdk-backed-mcp-tools)
  - [MCP Server Management](#mcp-server-management)
- [Observability](#observability)
  - [Hook Execution Monitoring](#hook-execution-monitoring)
  - [Token Usage Tracking](#token-usage-tracking)
  - [Context Stats](#context-stats)
  - [List Skills](#list-skills)
  - [Raw Notification Subscription](#raw-notification-subscription)
- [Error Handling](#error-handling)
- [Low-level APIs](#low-level-apis)
- [Configuration Reference](#configuration-reference)

> **Convention used in this guide:** most examples create a session with `apiKey` and `cwd`, run a turn, and then `close()`. The two creation options are repeated for copy-paste convenience; in your own code you typically create one session and reuse it across turns.

---

## Getting Started

```bash
npm install @factory/droid-sdk
```

Requires Node.js 18+ and the `droid` CLI on your PATH.

```ts
import { run } from '@factory/droid-sdk';

const result = await run('What files are in this directory?', {
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
console.log(result.text);
```

`apiKey` is required by the type signature, but its runtime value may be `undefined`: the `!` only satisfies TypeScript. When the value is undefined, the `droid` CLI falls back to its stored login credentials, so `apiKey: process.env.FACTORY_API_KEY!` works on any machine where `droid` is logged in. The remaining examples use the same pattern.

---

## Core Usage

### One-shot Run

Send a prompt, get a result, done. The session is created and closed automatically.

```ts
import { run } from '@factory/droid-sdk';

const result = await run('What is 2 + 2?', {
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
console.log(result.text);
```

`run()` accepts every [`MessageOptions`](#messageoptions) field except `includePartialMessages` (one-shot runs aggregate the whole turn, so there is nothing to stream). See [Structured Output](#structured-output) for an example that uses `outputFormat`.

The returned `DroidResult` carries more than `text`. See [Error Handling](#error-handling) for how to discriminate success from error results (`isError`, `subtype`, `errors`, `structuredOutputError`).

### Structured Output

Force the response to match a JSON schema. The validated object is available on `result.structuredOutput` (typed `unknown`, so cast it or validate it before use).

```ts
import { OutputFormatType, run } from '@factory/droid-sdk';

const result = await run('Pick a number between 1 and 42.', {
  apiKey: process.env.FACTORY_API_KEY!,
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

If the model's output cannot be coerced to the schema, the result becomes an **error result** with `subtype: 'error_structured_output'` and a populated `structuredOutputError` (see [Error Handling](#error-handling)). Always check `result.isError` before reading `structuredOutput`.

---

## Sessions

### Multi-turn Session

Create a session once, then call `stream()` multiple times. Context is preserved across turns.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

for await (const msg of session.stream('Remember the word "mango".')) {
  // consume first turn
}

for await (const msg of session.stream('What word did I say?')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

### Resume Session

Reconnect to a previously created session by its ID. The `options` argument is optional; when omitted, the CLI uses its stored credentials.

```ts
import { resumeSession, DroidMessageType } from '@factory/droid-sdk';

const session = await resumeSession('existing-session-id');

for await (const msg of session.stream('Continue where we left off.')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

`resumeSession()` always runs in the working directory persisted with the session; it intentionally does not accept a `cwd` option. To run in a different directory, create a new session or fork the existing one. See [`ResumeSessionOptions`](#resumesessionoptions) for the full option set.

### Fork Session

Create a copy of the current session with all context preserved. Useful for branching a conversation.

```ts
import {
  createSession,
  DroidMessageType,
  resumeSession,
} from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
for await (const msg of session.stream('Remember: the password is "banana".')) {
}

const { newSessionId } = await session.forkSession();
const fork = await resumeSession(newSessionId);

for await (const msg of fork.stream('What is the password?')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await fork.close();
await session.close();
```

### Compact Session

Summarize and remove old messages to free up context window space.

```ts
import { createSession, resumeSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

// ... after many turns ...
const result = await session.compactSession({
  // customInstructions: 'Keep the API design decisions verbatim.',
});
console.log(
  `New session: ${result.newSessionId}, removed: ${result.removedCount} messages`
);

await session.close();

// Compaction produces a NEW session id. The original `session` object still
// points at the pre-compaction session id, so to continue with the compacted
// history, resume the new id:
const compacted = await resumeSession(result.newSessionId);
// ... use `compacted` ...
await compacted.close();
```

`compactSession()` optionally takes `customInstructions` to steer what the summary preserves.

### List Sessions

Discover saved sessions on disk. Filters to the current project by default (`cwd` defaults to `process.cwd()`, `fetchOutsideCWD` defaults to `false`). No `droid` process is spawned.

```ts
import { listSessions } from '@factory/droid-sdk';

const sessions = await listSessions({ numSessions: 10 });

for (const s of sessions) {
  console.log(`${s.id}: ${s.sessionTitle ?? '(untitled)'}`);
}
```

`ListSessionsOptions`: `cwd` (scope to a directory; ignored when `fetchOutsideCWD` is `true`), `fetchOutsideCWD` (return sessions from every working directory), `numSessions` (cap on results), `sessionsDir` (override the sessions root, default `~/.factory/sessions/`).

### Rename Session

Give the current session a human-readable title.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

await session.renameSession({ title: 'Refactor auth module' });

await session.close();
```

---

## Streaming

### Full Message Streaming

By default, `stream()` yields complete messages: assistant text, user messages, tool calls, tool results, hooks, errors, and the final result.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

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

The default stream also yields `user` messages (`DroidMessageType.User`); the example above simply does not handle them. See the README's [DroidMessage Types](../README.md#droidmessage-types) tables for the full type list.

### Partial Message Streaming

Enable `includePartialMessages` to also get token-by-token deltas, thinking blocks, tool progress, token-usage updates, and more.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

for await (const msg of session.stream('Explain recursion.', {
  includePartialMessages: true,
})) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await session.close();
```

### Interrupt or Cancel Running Work

Use `session.interrupt()` to stop the current turn server-side, or pass an `AbortSignal` to cancel from the client.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

// Interrupt after receiving some output
const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
for await (const msg of session.stream('Write a long essay.')) {
  if (msg.type === DroidMessageType.Assistant) {
    await session.interrupt();
  }
}
await session.close();

// Or cancel with AbortSignal
const session2 = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
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

When you abort via `AbortSignal`, the stream throws a plain `Error` carrying the signal's `reason` (not one of the typed SDK errors). See [Error Handling](#error-handling).

---

## Controlling the Droid

### Autonomy Levels

Control what Droid can do without asking for permission. Set at session creation or change mid-session.

```ts
import { createSession, AutonomyLevel } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
  autonomyLevel: AutonomyLevel.High, // Off | Low | Medium | High
});

// Change mid-session
await session.updateSettings({ autonomyLevel: AutonomyLevel.Low });
await session.close();
```

### Enabled/Disabled Tools

Restrict which exec tools Droid can use. Tool IDs are the CLI's internal IDs (`'read-cli'`, `'execute-cli'`, `'grep_tool_cli'`, `'ls-cli'`, `'glob-search-cli'`, ...), **not** the model-facing names like `'Read'`. Use [`session.listTools()`](#tool-discovery-with-listtools) to discover the exact IDs and their current allow/deny state.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
  disabledToolIds: ['execute-cli'],
});

// Change mid-session
await session.updateSettings({
  disabledToolIds: ['read-cli', 'execute-cli'],
});
await session.close();
```

`disabledToolIds` turns the listed tools off. `enabledToolIds` re-enables tools that are off by default; it is applied **on top of** the default tool set, not as an exclusive allowlist. Disabling a tool is the reliable way to restrict capability.

#### Tool discovery with `listTools()`

`session.listTools()` returns the exec tool catalog with each tool's `id`, `llmId`, `displayName`, `category`, `defaultAllowed`, and `currentlyAllowed`. Use it to find IDs and confirm the effect of your overrides.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
  disabledToolIds: ['execute-cli'],
});

const { tools } = await session.listTools();
for (const t of tools) {
  console.log(`${t.id} (${t.llmId}): allowed=${t.currentlyAllowed}`);
}

await session.close();
```

### Permission Handler

Programmatically approve or reject tool calls instead of prompting a human. The handler receives full tool details including file paths and commands.

**By default (no handler set), every confirmation request is cancelled.** At higher autonomy levels most tool calls are auto-approved and never reach a handler; to route confirmations through your handler, set a stricter `autonomyLevel` (such as `AutonomyLevel.Off`) or rely on the tools that always require confirmation (such as MCP tools, see below).

```ts
import {
  run,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

await run('Create hello.txt with "Hello, World!"', {
  apiKey: process.env.FACTORY_API_KEY!,
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

A handler may return a `ToolConfirmationOutcome` enum value, a plain string outcome, or an object of the form `{ selectedOption, updatedContent? }`. Returning `ToolConfirmationOutcome.Cancel` rejects the call.

### Ask-User Handler

Programmatically answer questions that Droid asks the user during execution.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
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
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

### Spec Mode

Start Droid in read-only planning mode. It researches and produces a plan, then requests to exit spec mode for implementation.

```ts
import {
  createSession,
  DroidInteractionMode,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
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

You can also switch an existing session into spec mode with `session.enterSpecMode({ specModeModelId?, specModeReasoningEffort? })`. When approving the exit-spec-mode confirmation, returning `ToolConfirmationOutcome.ProceedOnce` continues implementation in the same session, while `ToolConfirmationOutcome.ProceedNewSessionHigh` hands off to a fresh session.

### Model and Reasoning Effort

Choose which model to use and how much reasoning effort to apply. Configurable at creation or mid-session.

```ts
import { createSession, ReasoningEffort } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
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

For valid model identifiers, see the `ModelID` enum in the [`@factory/droid-sdk/protocol`](#low-level-apis) subpath export. The full `ReasoningEffort` enum is listed in the [Configuration Reference](#createsessionoptions).

### Multimodal Input

Send images or documents alongside your prompt. Images must be base64-encoded; `mediaType` must be one of `image/jpeg`, `image/png`, `image/gif`, or `image/webp`.

```ts
import { readFileSync } from 'node:fs';
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

for await (const msg of session.stream('Describe this image.', {
  images: [
    {
      type: 'base64',
      data: readFileSync('screenshot.png').toString('base64'),
      mediaType: 'image/png',
    },
  ],
})) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

Documents are passed through the `files` option (`DocumentSource[]`) the same way:

```ts
import { readFileSync } from 'node:fs';
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

for await (const msg of session.stream('Summarize this document.', {
  files: [
    {
      type: 'base64',
      data: readFileSync('report.pdf').toString('base64'),
      mediaType: 'application/pdf',
    },
  ],
})) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

---

## MCP

### SDK-backed MCP Tools

Define custom tools that Droid can call during a session. Tools are served via a local MCP server that the SDK starts and stops automatically with the session lifecycle.

```ts
import {
  createSession,
  createSdkMcpServer,
  DroidMessageType,
  tool,
  ToolConfirmationOutcome,
  ToolConfirmationType,
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
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
  mcpServers: [server],
  permissionHandler(params) {
    const allMcp = params.toolUses.every(
      (item) => item.details.type === ToolConfirmationType.McpTool
    );
    return allMcp
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
  },
});

for await (const msg of session.stream('Look up Alice.')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

**MCP tool calls request confirmation even at the default autonomy level**, so the session must supply a `permissionHandler` (or set a high autonomy level) to approve them. The handler above gates approval on `ToolConfirmationType.McpTool` so it only auto-approves your tools and cancels everything else.

`tool()` has two forms: `tool(name, description, zodShape, handler)` for typed input validation (the input is parsed against the Zod object shape), and `tool(name, description, handler)` with no schema for tools that take no structured input. A tool handler may return a string or a full MCP `CallToolResult`.

### MCP Server Management

Add, remove, toggle, and list external MCP servers from within an active session.

> **Side effect warning:** `addMcpServer()` persists the server into your **user-level** `droid` settings, so it remains configured in future sessions until removed. `removeMcpServer()` and `toggleMcpServer()` likewise operate on user-level settings and require `settingsLevel: SettingsLevel.User`. The example below adds a server and then removes it in the same script so it leaves no trace.

```ts
import {
  createSession,
  McpServerType,
  SettingsLevel,
} from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

await session.addMcpServer({
  name: 'my-server',
  type: McpServerType.Http,
  url: 'https://mcp.example.com/mcp',
});

const { servers, summary } = await session.listMcpServers();
// `summary` is an McpStatusSummary: { total, connected, connecting, failed, disabled? }.
// There is no `summary.status` field; per-server status lives on servers[i].status.
console.log(`Connected: ${summary.connected}/${summary.total}`);
for (const s of servers) {
  console.log(`${s.name}: ${s.status}`);
}

// Toggle a server on/off (user-level settings)...
await session.toggleMcpServer({
  serverName: 'my-server',
  enabled: false,
  settingsLevel: SettingsLevel.User,
});

// ...and remove it to undo the persistent change made by addMcpServer().
await session.removeMcpServer({
  serverName: 'my-server',
  settingsLevel: SettingsLevel.User,
});

await session.close();
```

Inspect tools exposed by MCP servers with `session.listMcpTools()`, and authenticate OAuth-style servers with `session.authenticateMcpServer(params)`.

---

## Observability

### Hook Execution Monitoring

Observe file hooks (pre/post tool execution hooks) as they run during a session.

> **Hooks must be configured in your `droid` settings files.** The SDK only _observes_ hook executions reported by the CLI; it does not register hooks. If no hooks are configured for the events your session triggers, the stream contains no `hook` messages and the loop below prints nothing.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

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

### Token Usage Tracking

Monitor token consumption in real time via stream events (requires `includePartialMessages: true`), or read the final totals from the result.

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

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

### Context Stats

Query current context window usage to understand how much capacity remains.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
for await (const msg of session.stream('Hello')) {
}

const stats = await session.getContextStats();
console.log(
  `Used: ${stats.used}, Remaining: ${stats.remaining}, Limit: ${stats.limit}`
);

await session.close();
```

### List Skills

List all skills available in the current session.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
const { skills } = await session.listSkills();

for (const skill of skills) {
  console.log(`${skill.name} (${skill.location}): ${skill.description ?? ''}`);
}

await session.close();
```

### Raw Notification Subscription

Subscribe to raw protocol notifications for custom event handling beyond the stream API. The callback receives the raw JSON-RPC envelope; the payload is at `params.notification`. An optional filter restricts which notification types are delivered.

```ts
import { createSession, SessionNotificationType } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

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

---

## Error Handling

There are two distinct failure surfaces, and most failures are the **first** kind:

1. **Error results** — the turn completes but reports a problem. `run()` returns (and `stream()` yields) a `DroidResult` with `isError: true`. This is the most common failure mode and does **not** throw.
2. **Thrown exceptions** — connection, protocol, or session-level failures throw typed SDK errors you catch with `try`/`catch`.

### Handling error results

Always check `result.isError` before trusting `text` or `structuredOutput`:

```ts
import { run } from '@factory/droid-sdk';

const result = await run('Do something that might fail.', {
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});

if (result.isError) {
  // subtype is 'error_during_execution' | 'error_structured_output'
  console.error(`Failed (${result.subtype}):`, result.errors);
  if (result.structuredOutputError) {
    console.error('Structured output error:', result.structuredOutputError);
  }
} else {
  console.log(result.text);
}
```

Result discrimination fields: `success` / `isError` (booleans), `subtype` (`'success' | 'error_during_execution' | 'error_structured_output'`), `errors` (error descriptions, error results only), `error` (the first error event, or `null`), and `structuredOutputError` (structured-output parse/validation failure, if any). The same `result` message arrives as the final `DroidMessageType.Result` event when streaming.

### Handling thrown errors

The SDK throws typed errors with structured context. Catch specific classes to handle different failure modes.

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

See the [Error Types](#error-types) reference for all classes. Note that aborting a stream via `AbortSignal` throws a plain `Error` (carrying `signal.reason`), not one of these typed errors.

---

## Low-level APIs

Most users should use `run()` and `DroidSession`. For direct RPC access, the SDK also exports `ProcessTransport`, `ProtocolEngine`, and `DroidClient`.

`DroidClient` exposes additional methods not on `DroidSession`: `killWorkerSession()`, `cancelMcpAuth()`, `clearMcpAuth()`, `submitMcpAuthCode()`, `listMcpRegistry()`, `toggleMcpTool()`, and `submitBugReport()`.

The package also re-exports its full Zod schema surface from the package root for runtime validation of protocol payloads. Low-level JSON-RPC protocol types, enums (including `ModelID`), and schemas are additionally available from the `@factory/droid-sdk/protocol` subpath export and the `protocol` namespace export. Factory REST API helpers (for managing remote computers, machine templates, and remote sessions) are also exported from the package root.

---

## Configuration Reference

### `CreateSessionOptions`

| Field                     | Type                     | Description                                                                                                  |
| :------------------------ | :----------------------- | :----------------------------------------------------------------------------------------------------------- |
| `apiKey`                  | `string`                 | **Required by the type.** Runtime value may be `undefined`; the CLI then uses stored credentials             |
| `cwd`                     | `string`                 | Working directory for the session (default: `"."`)                                                           |
| `machineId`               | `string`                 | Machine identifier for initialization (default: `"default"`)                                                 |
| `modelId`                 | `string`                 | LLM model identifier                                                                                         |
| `autonomyLevel`           | `AutonomyLevel`          | `Off` \| `Low` \| `Medium` \| `High`                                                                         |
| `interactionMode`         | `DroidInteractionMode`   | `Auto` \| `Spec` \| `AGI`                                                                                    |
| `reasoningEffort`         | `ReasoningEffort`        | `None` \| `Dynamic` \| `Off` \| `Minimal` \| `Low` \| `Medium` \| `High` \| `ExtraHigh` (`'xhigh'`) \| `Max` |
| `specModeModelId`         | `string`                 | Override model for spec mode                                                                                 |
| `specModeReasoningEffort` | `ReasoningEffort`        | Override reasoning effort for spec mode                                                                      |
| `mcpServers`              | `DroidMcpServerConfig[]` | Initial MCP server configs, including SDK-backed servers from `createSdkMcpServer()`                         |
| `enabledToolIds`          | `string[]`               | Tool IDs to re-enable on top of the default set (not an exclusive allowlist)                                 |
| `disabledToolIds`         | `string[]`               | Tool IDs to disable                                                                                          |
| `tags`                    | `SessionTag[]`           | Session tags for categorization (the SDK always appends its own SDK tag)                                     |
| `sessionSource`           | `SessionSource`          | Attribution metadata (e.g., integration origin)                                                              |
| `permissionHandler`       | `PermissionHandler`      | Tool confirmation callback (default behavior with no handler: cancel everything)                             |
| `askUserHandler`          | `AskUserHandler`         | Structured user-input callback                                                                               |
| `execPath`                | `string`                 | Path to `droid` executable (default: `"droid"`)                                                              |
| `execArgs`                | `string[]`               | Extra CLI arguments for the subprocess                                                                       |
| `env`                     | `Record<string, string>` | Environment variables for the subprocess                                                                     |
| `transport`               | `DroidClientTransport`   | Custom transport (skips subprocess spawn)                                                                    |
| `abortSignal`             | `AbortSignal`            | Cancellation signal                                                                                          |

### `ResumeSessionOptions`

Accepted by `resumeSession(sessionId, options?)`. The `options` argument is optional. `resumeSession()` accepts only the subset of options needed to reconnect; new-session-only options such as `modelId` or `interactionMode` are not accepted, and `cwd` is intentionally omitted (the persisted session cwd is authoritative).

| Field               | Type                     | Description                                                           |
| :------------------ | :----------------------- | :-------------------------------------------------------------------- |
| `apiKey`            | `string`                 | **Optional on resume.** When omitted, the CLI uses stored credentials |
| `mcpServers`        | `DroidMcpServerConfig[]` | MCP servers to attach to the resumed session                          |
| `permissionHandler` | `PermissionHandler`      | Tool confirmation callback                                            |
| `askUserHandler`    | `AskUserHandler`         | Structured user-input callback                                        |
| `execPath`          | `string`                 | Path to `droid` executable (default: `"droid"`)                       |
| `execArgs`          | `string[]`               | Extra CLI arguments for the subprocess                                |
| `env`               | `Record<string, string>` | Environment variables for the subprocess                              |
| `transport`         | `DroidClientTransport`   | Custom transport (skips subprocess spawn)                             |
| `abortSignal`       | `AbortSignal`            | Cancellation signal                                                   |

### `MessageOptions`

Accepted by `session.stream()` and `run()` (`run()` accepts all of these except `includePartialMessages`):

| Field                    | Type                  | Description                                                   |
| :----------------------- | :-------------------- | :------------------------------------------------------------ |
| `images`                 | `Base64ImageSource[]` | Base64-encoded image attachments                              |
| `files`                  | `DocumentSource[]`    | Document/file attachments                                     |
| `outputFormat`           | `OutputFormat`        | Structured output JSON schema request                         |
| `includePartialMessages` | `boolean`             | `stream()` only: yield token-level deltas and progress events |
| `abortSignal`            | `AbortSignal`         | Cancellation signal for this turn                             |

### Error Types

| Error                  | Description                               |
| :--------------------- | :---------------------------------------- |
| `ConnectionError`      | Failed to connect to the droid subprocess |
| `ProtocolError`        | JSON-RPC or protocol-level failure        |
| `SessionError`         | Base session error                        |
| `SessionNotFoundError` | Requested session does not exist          |
| `TimeoutError`         | RPC timed out                             |
| `ProcessExitError`     | Subprocess exited unexpectedly            |

Aborting a turn via `AbortSignal` throws a plain `Error` (carrying `signal.reason`), not one of the typed SDK errors above.
