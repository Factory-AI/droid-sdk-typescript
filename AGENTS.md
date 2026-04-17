# AGENTS.md — Integrating the Factory Droid SDK

This document explains how to integrate the `@factory/droid-sdk` TypeScript SDK into your applications. It covers architecture, API patterns, and detailed examples. For runnable code, see the [`examples/`](./examples) directory.

**Repository:** [github.com/Factory-AI/droid-sdk-typescript](https://github.com/Factory-AI/droid-sdk-typescript)

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Architecture](#architecture)
5. [API Patterns](#api-patterns)
   - [One-Shot Query](#one-shot-query)
   - [Multi-Turn Session](#multi-turn-session)
   - [Resuming Sessions](#resuming-sessions)
6. [Handling Stream Messages](#handling-stream-messages)
7. [Thinking and Reasoning Text](#thinking-and-reasoning-text)
8. [Sending Images and Documents](#sending-images-and-documents)
9. [Permission Handling](#permission-handling)
10. [Tool Confirmation Details](#tool-confirmation-details)
11. [Ask-User Handling](#ask-user-handling)
12. [Interrupting and Aborting](#interrupting-and-aborting)
13. [AbortSignal Support](#abortsignal-support)
14. [Session Settings](#session-settings)
15. [Session Tags and Source Metadata](#session-tags-and-source-metadata)
16. [Notification Filtering](#notification-filtering)
17. [MCP Server Management](#mcp-server-management)
18. [MCP OAuth Authentication](#mcp-oauth-authentication)
19. [Skills](#skills)
20. [Missions (AGI Mode)](#missions-agi-mode)
21. [Custom Transport](#custom-transport)
22. [Low-Level Client](#low-level-client)
23. [Zod Schemas for Runtime Validation](#zod-schemas-for-runtime-validation)
24. [Error Handling](#error-handling)
25. [Key Enums and Types](#key-enums-and-types)
26. [Source Code Map](#source-code-map)

---

## Overview

The Droid SDK provides a high-level TypeScript API for interacting with the [Factory Droid CLI](https://factory.ai) as a subprocess. It communicates over newline-delimited JSON-RPC (JSONL) via stdin/stdout, and exposes two main patterns:

- **`query()`** — One-shot prompt with streaming response. Manages the full lifecycle (spawn, connect, initialize, message, close) automatically.
- **`createSession()` / `resumeSession()`** — Multi-turn sessions for persistent conversations with multiple exchanges.

Both patterns yield typed `DroidMessage` events via async generators.

## Prerequisites

- **Node.js 18+**
- The `droid` CLI installed and available on your PATH (`npm install -g @anthropic-ai/droid` or via [factory.ai](https://factory.ai))

## Installation

```bash
npm install @factory/droid-sdk
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Your Application                                   │
│                                                     │
│  query() / createSession() / resumeSession()        │
│       │                                             │
│       ▼                                             │
│  DroidSession / DroidQuery (high-level API)         │
│       │                                             │
│       ▼                                             │
│  DroidClient (typed JSON-RPC methods)               │
│       │                                             │
│       ▼                                             │
│  ProtocolEngine (JSON-RPC framing, request/response)│
│       │                                             │
│       ▼                                             │
│  ProcessTransport (stdin/stdout JSONL over subprocess│
│       │                                             │
│       ▼                                             │
│  droid exec --input-format stream-jsonrpc           │
│             --output-format stream-jsonrpc           │
└─────────────────────────────────────────────────────┘
```

The SDK is layered:

| Layer     | File                                     | Purpose                                              |
| --------- | ---------------------------------------- | ---------------------------------------------------- |
| Transport | [`src/transport.ts`](./src/transport.ts) | Spawns `droid exec`, JSONL framing over stdin/stdout |
| Protocol  | [`src/protocol.ts`](./src/protocol.ts)   | JSON-RPC request/response correlation, timeouts      |
| Client    | [`src/client.ts`](./src/client.ts)       | Typed methods for all 19 RPC operations              |
| Stream    | [`src/stream.ts`](./src/stream.ts)       | Notification-to-message conversion, turn detection   |
| Query     | [`src/query.ts`](./src/query.ts)         | One-shot `query()` convenience function              |
| Session   | [`src/session.ts`](./src/session.ts)     | Multi-turn `DroidSession` class                      |

## API Patterns

### One-Shot Query

Use `query()` when you need a single prompt-response cycle. It handles the entire lifecycle automatically — spawning the process, initializing a session, sending the prompt, streaming the response, and cleaning up.

```ts
import { query } from '@factory/droid-sdk';

const stream = query({
  prompt: 'What files are in the current directory?',
  cwd: '/my/project',
});

for await (const msg of stream) {
  switch (msg.type) {
    case 'assistant_text_delta':
      process.stdout.write(msg.text);
      break;
    case 'tool_use':
      console.log(`[Tool] ${msg.toolName}`);
      break;
    case 'tool_result':
      console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
      break;
    case 'turn_complete':
      console.log('\nDone!');
      if (msg.tokenUsage) {
        console.log(
          `Tokens: ${msg.tokenUsage.inputTokens} in, ${msg.tokenUsage.outputTokens} out`
        );
      }
      break;
  }
}
```

The returned `DroidQuery` object also exposes `interrupt()`, `abort()`, and `sessionId`. Breaking out of the `for await` loop automatically closes the transport.

> **Full example:** [`examples/simple-query.ts`](./examples/simple-query.ts)

### Multi-Turn Session

Use `createSession()` for conversations that span multiple turns. The session keeps the droid process alive between messages.

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

// Streaming turn
for await (const msg of session.stream('List all TypeScript files')) {
  if (msg.type === 'assistant_text_delta') {
    process.stdout.write(msg.text);
  }
}

// Non-streaming turn (collects the full response)
const result = await session.send('Summarize the project in one sentence');
console.log(result.text); // concatenated assistant text
console.log(result.messages.length); // all DroidMessage objects
console.log(result.tokenUsage); // final token counters

// Always close when done
await session.close();
```

`session.stream()` returns an async generator of `DroidMessage` events. `session.send()` consumes the stream internally and returns an aggregated `DroidResult` with `.text`, `.messages`, and `.tokenUsage`.

> **Full example:** [`examples/multi-turn-session.ts`](./examples/multi-turn-session.ts)

### Resuming Sessions

Resume a previous session by its ID:

```ts
import { resumeSession } from '@factory/droid-sdk';

const session = await resumeSession('session-id-here');
const result = await session.send('Continue where we left off');
console.log(result.text);
await session.close();
```

The session ID is available as `session.sessionId` after creation, or as `stream.sessionId` on a `DroidQuery`.

## Handling Stream Messages

All messages are discriminated by `msg.type`. The full `DroidMessage` union includes 22 types:

| Type                       | Description                    | Key Fields                           |
| -------------------------- | ------------------------------ | ------------------------------------ |
| `assistant_text_delta`     | Streaming text token           | `text`, `messageId`, `blockIndex`    |
| `thinking_text_delta`      | Reasoning/thinking token       | `text`, `messageId`, `blockIndex`    |
| `tool_use`                 | Tool invocation                | `toolName`, `toolInput`, `toolUseId` |
| `tool_result`              | Tool execution result          | `toolUseId`, `content`, `isError`    |
| `tool_progress`            | Progress during tool execution | `toolUseId`, `toolName`, `content`   |
| `working_state_changed`    | Agent state transition         | `state` (see `DroidWorkingState`)    |
| `token_usage_update`       | Token counters update          | `inputTokens`, `outputTokens`, etc.  |
| `create_message`           | Full assistant message         | `messageId`, `role`, `content[]`     |
| `turn_complete`            | Agent turn finished (sentinel) | `tokenUsage` (or null)               |
| `error`                    | Error from the process         | `message`, `errorType`, `timestamp`  |
| `permission_resolved`      | Permission request resolved    | `requestId`, `selectedOption`        |
| `settings_updated`         | Session settings changed       | `settings`                           |
| `session_title_updated`    | Title changed                  | `title`                              |
| `mcp_status_changed`       | MCP server status change       | `servers`, `summary`                 |
| `mcp_auth_required`        | OAuth authentication needed    | `serverName`, `authUrl`              |
| `mcp_auth_completed`       | OAuth authentication done      | `serverName`, `outcome`              |
| `mission_state_changed`    | Mission state transition       | `state`                              |
| `mission_features_changed` | Mission features updated       | `features`                           |
| `mission_progress_entry`   | Mission progress log           | `progressLog`                        |
| `mission_heartbeat`        | Mission keepalive              | `timestamp`                          |
| `mission_worker_started`   | Worker session started         | `workerSessionId`                    |
| `mission_worker_completed` | Worker session finished        | `workerSessionId`, `exitCode`        |

The `turn_complete` message is the sentinel that signals the end of an agent turn. It is synthesized by the SDK when the agent transitions from a non-idle working state back to idle.

## Thinking and Reasoning Text

When using models with reasoning/thinking capabilities (and a `reasoningEffort` above `None`), the agent may emit `thinking_text_delta` messages alongside `assistant_text_delta`. These contain the model's chain-of-thought reasoning:

```ts
import { query, ReasoningEffort } from '@factory/droid-sdk';

const stream = query({
  prompt: 'Analyze the architecture of this project',
  cwd: '/my/project',
  reasoningEffort: ReasoningEffort.High,
});

let thinkingText = '';

for await (const msg of stream) {
  switch (msg.type) {
    case 'thinking_text_delta':
      thinkingText += msg.text;
      // Optionally display thinking in a collapsible UI section
      break;
    case 'assistant_text_delta':
      process.stdout.write(msg.text);
      break;
  }
}

console.log(`\nThinking length: ${thinkingText.length} chars`);
```

Both delta types include `messageId` and `blockIndex` for correlating fragments to their parent message and content block.

## Sending Images and Documents

Both `session.stream()` and `session.send()` accept optional `images` and `files` alongside the text message, via the `MessageOptions` parameter:

```ts
import { createSession } from '@factory/droid-sdk';
import * as fs from 'node:fs';

const session = await createSession({ cwd: '/my/project' });

// Send a message with an image (base64-encoded)
const imageData = fs.readFileSync('screenshot.png').toString('base64');

for await (const msg of session.stream('What does this screenshot show?', {
  images: [
    {
      type: 'base64',
      data: imageData,
      mediaType: 'image/png',
    },
  ],
})) {
  if (msg.type === 'assistant_text_delta') {
    process.stdout.write(msg.text);
  }
}

// Send a message with a document (e.g., PDF)
const pdfData = fs.readFileSync('spec.pdf').toString('base64');

const result = await session.send('Summarize this document', {
  files: [
    {
      type: 'base64',
      mediaType: 'application/pdf',
      data: pdfData,
      name: 'spec.pdf',
    },
  ],
});
console.log(result.text);

await session.close();
```

Supported image media types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`. See [`src/schemas/messages.ts`](./src/schemas/messages.ts) for the full content block schemas.

## Permission Handling

When the agent needs to execute a tool that requires user confirmation (file edits, command execution, etc.), the SDK invokes your `permissionHandler`. Return a `ToolConfirmationOutcome` value:

```ts
import { query, ToolConfirmationOutcome } from '@factory/droid-sdk';

const stream = query({
  prompt: 'Create a hello.txt file',
  cwd: '/my/project',
  permissionHandler(params) {
    // params.toolUses is an array of { toolUse: { name, input }, confirmationType }
    const toolUses = params.toolUses as Array<{
      toolUse: { name: string; input: Record<string, unknown> };
      confirmationType: string;
    }>;

    for (const item of toolUses) {
      console.log(`Tool: ${item.toolUse.name}, Type: ${item.confirmationType}`);
    }

    // Approve this single execution
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

for await (const msg of stream) {
  if (msg.type === 'assistant_text_delta') process.stdout.write(msg.text);
}
```

Available outcomes:

| Outcome                | Effect                                        |
| ---------------------- | --------------------------------------------- |
| `ProceedOnce`          | Approve this tool execution only              |
| `ProceedAlways`        | Approve this tool for the rest of the session |
| `ProceedAutoRun`       | Auto-approve all tools                        |
| `ProceedAutoRunLow`    | Auto-approve low-risk tools only              |
| `ProceedAutoRunMedium` | Auto-approve up to medium-risk tools          |
| `ProceedAutoRunHigh`   | Auto-approve up to high-risk tools            |
| `ProceedEdit`          | Allow the edit to proceed                     |
| `Cancel`               | Reject the tool execution                     |

If no handler is set, the SDK defaults to `Cancel`.

> **Full example:** [`examples/permission-handler.ts`](./examples/permission-handler.ts)

## Tool Confirmation Details

Each tool confirmation request includes rich, typed detail objects in `params.toolUses[].details` that vary by `confirmationType`. You can use these to build informed approval UIs:

```ts
import {
  query,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

const stream = query({
  prompt: 'Refactor the utils module',
  cwd: '/my/project',
  permissionHandler(params) {
    const toolUses = params.toolUses as Array<{
      toolUse: { name: string; input: Record<string, unknown> };
      confirmationType: string;
      details: Record<string, unknown>;
    }>;

    for (const item of toolUses) {
      switch (item.confirmationType) {
        case ToolConfirmationType.Edit:
          // details: { filePath, fileName, oldContent?, newContent? }
          console.log(`Edit: ${item.details.filePath}`);
          console.log(
            `  Old: ${(item.details.oldContent as string)?.slice(0, 80)}...`
          );
          console.log(
            `  New: ${(item.details.newContent as string)?.slice(0, 80)}...`
          );
          break;

        case ToolConfirmationType.Create:
          // details: { filePath, fileName, content }
          console.log(`Create: ${item.details.filePath}`);
          break;

        case ToolConfirmationType.Execute:
          // details: { fullCommand, command, extractedCommands?, impactLevel? }
          console.log(`Execute: ${item.details.fullCommand}`);
          console.log(`  Impact: ${item.details.impactLevel}`);
          break;

        case ToolConfirmationType.ApplyPatch:
          // details: { filePath, fileName, patchContent, oldContent?, newContent? }
          console.log(`Patch: ${item.details.filePath}`);
          break;

        case ToolConfirmationType.McpTool:
          // details: { toolName, impactLevel }
          console.log(
            `MCP Tool: ${item.details.toolName} (${item.details.impactLevel})`
          );
          break;
      }
    }

    return ToolConfirmationOutcome.ProceedOnce;
  },
});

for await (const msg of stream) {
  if (msg.type === 'assistant_text_delta') process.stdout.write(msg.text);
}
```

All confirmation detail types:

| `confirmationType` | Enum / Value          | Detail Fields                                                        | Description                |
| ------------------ | --------------------- | -------------------------------------------------------------------- | -------------------------- |
| `Edit`             | `"edit"`              | `filePath`, `fileName`, `oldContent?`, `newContent?`                 | File edit with diff        |
| `Create`           | `"create"`            | `filePath`, `fileName`, `content`                                    | New file creation          |
| `Execute`          | `"exec"`              | `fullCommand`, `command`, `extractedCommands?`, `impactLevel?`       | Shell command execution    |
| `ApplyPatch`       | `"apply_patch"`       | `filePath`, `fileName`, `patchContent`, `oldContent?`, `newContent?` | Patch application          |
| `McpTool`          | `"mcp_tool"`          | `toolName`, `impactLevel`                                            | MCP tool invocation        |
| `AskUser`          | `"ask_user"`          | `questionnaire`, `parsed?`, `parseError?`                            | Agent asking a question    |
| `ExitSpecMode`     | `"exit_spec_mode"`    | `plan`, `title?`, `optionNames?`                                     | Exiting spec/planning mode |
| `ProposeMission`   | `"propose_mission"`   | `proposal`, `title?`                                                 | Mission proposal           |
| `StartMissionRun`  | `"start_mission_run"` | `runningMissionCount`, `runningMissionSessionIds`                    | Starting a mission run     |

Schemas: [`src/schemas/server.ts`](./src/schemas/server.ts) (`ToolConfirmationDetailsSchema`)

## Ask-User Handling

When the agent needs to ask the user a question (e.g., clarification), the SDK invokes your `askUserHandler`. The handler receives structured questions with indexed options and should return matching answers:

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  cwd: '/my/project',
  askUserHandler(params) {
    // params.questions is an array of:
    //   { index: number, topic: string, question: string, options: string[] }
    const questions = params.questions as Array<{
      index: number;
      topic: string;
      question: string;
      options: string[];
    }>;

    console.log('Agent asks:');
    for (const q of questions) {
      console.log(`  [${q.topic}] ${q.question}`);
      console.log(`    Options: ${q.options.join(', ')}`);
    }

    // Return structured answers (one per question, matching by index)
    return {
      cancelled: false,
      answers: questions.map((q) => ({
        index: q.index,
        question: q.question,
        answer: q.options[0], // pick first option as example
      })),
    };

    // Or to cancel: return { cancelled: true, answers: [] };
  },
});
```

If no handler is set, the SDK defaults to `{ cancelled: true, answers: [] }`.

See [`src/schemas/server.ts`](./src/schemas/server.ts) for `AskUserRequestParamsSchema` and `AskUserResultSchema`.

## Interrupting and Aborting

### Interrupt (graceful)

Interrupt tells the agent to stop after its current operation. The stream continues yielding messages until `turn_complete`.

```ts
// With query()
const stream = query({ prompt: 'Write a long essay...', cwd: '.' });
setTimeout(() => stream.interrupt(), 5000);
for await (const msg of stream) {
  /* ... */
}

// With session
const session = await createSession({ cwd: '.' });
let count = 0;
for await (const msg of session.stream('Write a detailed essay...')) {
  if (msg.type === 'assistant_text_delta') {
    count++;
    process.stdout.write(msg.text);
    if (count === 5) {
      await session.interrupt();
    }
  }
}
```

> **Full example:** [`examples/interrupt-session.ts`](./examples/interrupt-session.ts)

### Abort (forceful)

Abort kills the subprocess immediately. Only available on `DroidQuery`:

```ts
const stream = query({ prompt: '...', cwd: '.' });
stream.abort(); // kills the process, generator terminates
```

## AbortSignal Support

The `query()`, `createSession()`, and `resumeSession()` functions all accept a standard `AbortSignal` for external cancellation. Aborting the signal invokes `query.abort()` (or closes the session), which terminates the subprocess and ends the stream. You can also call `query.abort()` or `query.interrupt()` directly.

```ts
import { query } from '@factory/droid-sdk';

const controller = new AbortController();

const stream = query({
  prompt: 'Analyze the entire codebase',
  cwd: '/my/project',
  abortSignal: controller.signal,
});

// Cancel after 30 seconds
setTimeout(() => controller.abort(), 30_000);

try {
  for await (const msg of stream) {
    if (msg.type === 'assistant_text_delta') {
      process.stdout.write(msg.text);
    }
  }
} catch {
  console.log('Query was aborted');
}
```

## Session Settings

Update model, autonomy, and reasoning effort during a session:

```ts
import {
  createSession,
  AutonomyLevel,
  ReasoningEffort,
  DroidInteractionMode,
} from '@factory/droid-sdk';

const session = await createSession({
  cwd: '/my/project',
  modelId: 'claude-sonnet-4-20250514',
  autonomyLevel: AutonomyLevel.Medium,
  reasoningEffort: ReasoningEffort.High,
  interactionMode: DroidInteractionMode.Auto,
});

// Change settings mid-session
await session.updateSettings({
  modelId: 'claude-sonnet-4-20250514',
  reasoningEffort: ReasoningEffort.Low,
  autonomyLevel: AutonomyLevel.High,
});
```

You can also pass these in `QueryOptions` for one-shot queries.

## Session Tags and Source Metadata

When initializing sessions via the low-level `DroidClient`, you can attach tags and source metadata for tracking and filtering:

```ts
import { DroidClient, ProcessTransport } from '@factory/droid-sdk';

const transport = new ProcessTransport({ cwd: '/my/project' });
await transport.connect();
const client = new DroidClient({ transport });

const initResult = await client.initializeSession({
  machineId: 'default',
  cwd: '/my/project',
  tags: [
    { name: 'environment', metadata: { value: 'production' } },
    { name: 'team', metadata: { value: 'platform' } },
  ],
  sessionSource: {
    platform: 'my-app',
    // additional keys are allowed (passthrough schema)
  },
});
```

Tags are `{ name: string, metadata?: Record<string, string> }` pairs. The session source identifies which platform created the session.

## Notification Filtering

When subscribing to notifications on a session or client, you can filter by notification type to only receive events you care about:

```ts
import { createSession, SessionNotificationType } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

// Only receive tool_result notifications
const unsubscribe = session.onNotification(
  (notification) => {
    console.log('Tool result received:', notification);
  },
  { type: SessionNotificationType.TOOL_RESULT }
);

// ... send messages and process results ...

// Stop listening
unsubscribe();

await session.close();
```

Available notification types are enumerated in `SessionNotificationType` (20 types total). Without a filter, the listener receives all notifications. Multiple listeners can be registered simultaneously, each with independent filters.

## MCP Server Management

Add, remove, list, and toggle MCP (Model Context Protocol) servers within a session:

```ts
import {
  createSession,
  McpServerType,
  SettingsLevel,
} from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

// Add an MCP server
await session.addMcpServer({
  name: 'my-server',
  type: McpServerType.Http,
  url: 'https://mcp.example.com/mcp',
});

// List servers
const { servers, summary } = await session.listMcpServers();
console.log(
  `MCP: ${summary.connected}/${summary.total} connected, ${servers.length} servers`
);

// List available tools
const { tools } = await session.listMcpTools();
for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description}`);
}

// Remove a server
await session.removeMcpServer({
  serverName: 'my-server',
  settingsLevel: SettingsLevel.User,
});

await session.close();
```

You can also pass MCP servers at initialization time:

```ts
const session = await createSession({
  cwd: '/my/project',
  mcpServers: [
    {
      name: 'figma',
      type: 'http',
      url: 'https://mcp.figma.com/mcp',
      headers: [],
    },
    { name: 'local-tools', command: 'npx', args: ['-y', 'my-mcp-server'] },
  ],
});
```

## MCP OAuth Authentication

Some MCP servers require OAuth authentication. The SDK provides a full OAuth lifecycle through stream events and client methods:

```ts
import { createSession, McpServerType } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

await session.addMcpServer({
  name: 'github-mcp',
  type: McpServerType.Http,
  url: 'https://mcp.github.com/mcp',
});

// Listen for auth events
session.onNotification((notification) => {
  const params = notification.params as Record<string, unknown>;
  const inner = params?.notification as Record<string, unknown>;

  if (inner?.type === 'mcp_auth_required') {
    // Open this URL in the user's browser for OAuth
    console.log(`Auth required for ${inner.serverName}`);
    console.log(`Open: ${inner.authUrl}`);
  }

  if (inner?.type === 'mcp_auth_completed') {
    console.log(
      `Auth ${inner.outcome} for ${inner.serverName}: ${inner.message}`
    );
  }
});

// Trigger authentication for a server
await session.authenticateMcpServer({ serverName: 'github-mcp' });

// The auth timeout is 300 seconds (MCP_AUTH_TIMEOUT) to allow
// for the user to complete the OAuth flow in their browser.

await session.close();
```

The OAuth flow emits `mcp_auth_required` (with `authUrl` to open in a browser) and `mcp_auth_completed` (with `outcome`: `success`, `cancelled`, or `failed`) stream events. The low-level `DroidClient` also exposes `cancelMcpAuth()`, `clearMcpAuth()`, and `submitMcpAuthCode()` for advanced OAuth control (these are not available on `DroidSession`).

## Skills

List available skills (custom droids, built-in skills, and project-level skills) within a session:

```ts
import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: '/my/project' });

const { skills } = await session.listSkills();

for (const skill of skills) {
  console.log(`${skill.name} (${skill.location})`);
  if (skill.description) console.log(`  ${skill.description}`);
  if (skill.resources?.length) {
    console.log(
      `  Resources: ${skill.resources.map((r) => r.name).join(', ')}`
    );
  }
}

await session.close();
```

Each skill has a `name`, `description`, `location` (`project`, `personal`, or `builtin`), `filePath`, and optional `resources` (reference files or assets). See `SkillInfoSchema` in [`src/schemas/client.ts`](./src/schemas/client.ts).

## Missions (AGI Mode)

The SDK supports Factory's mission/AGI mode, where an orchestrator decomposes complex tasks into features and delegates them to parallel worker sessions. Enable it via `DroidInteractionMode.AGI`:

```ts
import { createSession, DroidInteractionMode } from '@factory/droid-sdk';

const session = await createSession({
  cwd: '/my/project',
  interactionMode: DroidInteractionMode.AGI,
});

for await (const msg of session.stream(
  'Build a REST API with auth, CRUD, and tests'
)) {
  switch (msg.type) {
    case 'assistant_text_delta':
      process.stdout.write(msg.text);
      break;

    case 'mission_state_changed':
      // States: AwaitingInput → Initializing → Running → OrchestratorTurn → Completed
      console.log(`\n[Mission] State: ${msg.state}`);
      break;

    case 'mission_features_changed':
      // Features with status lifecycle: Pending → InProgress → Completed/Cancelled
      for (const feature of msg.features) {
        console.log(`  Feature: ${feature.description} [${feature.status}]`);
      }
      break;

    case 'mission_worker_started':
      console.log(`[Worker] Started: ${msg.workerSessionId}`);
      break;

    case 'mission_worker_completed':
      console.log(
        `[Worker] Completed: ${msg.workerSessionId} (exit: ${msg.exitCode})`
      );
      break;

    case 'mission_progress_entry':
      // Detailed progress log with typed entries
      for (const entry of msg.progressLog) {
        console.log(`  [${entry.type}] ${JSON.stringify(entry)}`);
      }
      break;

    case 'mission_heartbeat':
      // Periodic keepalive during long-running missions
      break;
  }
}

await session.close();
```

### Mission Data Model

Features (`MissionFeature`) include:

- `id`, `description`, `status` (`pending`, `in_progress`, `completed`, `cancelled`)
- `skillName` — the skill/droid used
- `preconditions`, `expectedBehavior`, `verificationSteps`
- `workerSessionIds`, `currentWorkerSessionId`

Progress log entries are a discriminated union of 11 types: `mission_accepted`, `mission_paused`, `mission_resumed`, `mission_run_started`, `worker_started`, `worker_selected_feature`, `worker_completed`, `worker_failed`, `worker_paused`, `handoff_items_dismissed`, `milestone_validation_triggered`.

Worker completion entries include a `handoff` object with `whatWasImplemented`, `whatWasLeftUndone`, `verification` (commands run + results), `tests` (files added/updated + coverage), and `discoveredIssues`.

You can kill a worker mid-execution via the low-level client: `client.killWorkerSession({ workerSessionId: "..." })`.

Schemas: [`src/schemas/mission.ts`](./src/schemas/mission.ts), [`src/schemas/enums.ts`](./src/schemas/enums.ts) (`MissionState`, `FeatureStatus`, `FeatureSuccessState`, `ProgressLogEntryType`)

## Custom Transport

By default, the SDK spawns a `droid exec` subprocess via `ProcessTransport`. You can provide your own transport implementation for testing or custom communication channels:

```ts
import { createSession, type DroidClientTransport } from '@factory/droid-sdk';

const myTransport: DroidClientTransport = {
  send(message: object) {
    /* ... */
  },
  onMessage(callback) {
    /* ... */
  },
  onError(callback) {
    /* ... */
  },
  async close() {
    /* ... */
  },
  get isConnected() {
    return true;
  },
};

const session = await createSession({
  transport: myTransport,
  cwd: '/my/project',
});
```

The `DroidClientTransport` interface is defined in [`src/types.ts`](./src/types.ts). It requires `send()`, `onMessage()`, `onError()`, `close()`, and `isConnected`.

## Low-Level Client

For advanced use cases, you can use `DroidClient` directly. It provides typed methods for all 19 JSON-RPC operations:

```ts
import { DroidClient, ProcessTransport } from '@factory/droid-sdk';

const transport = new ProcessTransport({ cwd: '/my/project' });
await transport.connect();

const client = new DroidClient({ transport });

// Initialize session
const initResult = await client.initializeSession({
  machineId: 'default',
  cwd: '/my/project',
});
console.log('Session:', initResult.sessionId);

// Register notification listener
const unsubscribe = client.onNotification((notification) => {
  console.log('Notification:', notification);
});

// Set permission handler
client.setPermissionHandler((params) => 'proceed_once');

// Send a message
await client.addUserMessage({ text: 'Hello!' });

// ... listen for notifications ...

// Cleanup
unsubscribe();
await client.close();
```

Available client methods: `initializeSession`, `loadSession`, `addUserMessage`, `interruptSession`, `killWorkerSession`, `updateSessionSettings`, `addMcpServer`, `removeMcpServer`, `toggleMcpServer`, `listMcpServers`, `listMcpTools`, `listMcpRegistry`, `toggleMcpTool`, `authenticateMcpServer`, `cancelMcpAuth`, `clearMcpAuth`, `submitMcpAuthCode`, `listSkills`, `submitBugReport`.

See [`src/client.ts`](./src/client.ts) for the full implementation.

## Zod Schemas for Runtime Validation

Every request, response, and notification type in the SDK has an exported Zod schema, enabling runtime validation of protocol messages. This is useful for building custom transports, debugging protocol issues, or validating payloads in tests:

```ts
import {
  InitializeSessionRequestParamsSchema,
  SessionNotificationPayloadSchema,
  ToolConfirmationDetailsSchema,
} from '@factory/droid-sdk';

// Validate request params before sending
const params = InitializeSessionRequestParamsSchema.parse({
  machineId: 'default',
  cwd: '/my/project',
  modelId: 'claude-sonnet-4-20250514',
});

// Validate a notification payload
const notification = SessionNotificationPayloadSchema.parse({
  type: 'assistant_text_delta',
  messageId: 'msg-123',
  blockIndex: 0,
  textDelta: 'Hello',
});

// Validate tool confirmation details (discriminated union)
const details = ToolConfirmationDetailsSchema.parse({
  type: 'edit',
  filePath: '/src/main.ts',
  fileName: 'main.ts',
  oldContent: 'const x = 1;',
  newContent: 'const x = 2;',
});

// All schemas use .passthrough() for forward-compatibility with
// new fields added by future protocol versions.
```

Schemas are defined in `src/schemas/`:

- **Client requests/responses:** [`src/schemas/client.ts`](./src/schemas/client.ts) (19 RPC methods)
- **Server notifications/requests:** [`src/schemas/server.ts`](./src/schemas/server.ts) (20 notification types + permission + ask-user)
- **JSON-RPC base:** [`src/schemas/shared.ts`](./src/schemas/shared.ts)
- **Content blocks:** [`src/schemas/messages.ts`](./src/schemas/messages.ts) (text, image, thinking, tool_use, tool_result, document)
- **MCP entities:** [`src/schemas/mcp.ts`](./src/schemas/mcp.ts)
- **Mission entities:** [`src/schemas/mission.ts`](./src/schemas/mission.ts)

## Error Handling

The SDK provides a typed error hierarchy. All errors extend `Error`:

```ts
import {
  resumeSession,
  ConnectionError,
  ProtocolError,
  SessionNotFoundError,
  TimeoutError,
  ProcessExitError,
} from '@factory/droid-sdk';

try {
  const session = await resumeSession('invalid-id');
} catch (err) {
  if (err instanceof SessionNotFoundError) {
    console.log(`Session not found: ${err.sessionId}`);
  } else if (err instanceof ConnectionError) {
    console.log(`Connection failed: ${err.message} (cwd: ${err.cwd})`);
  } else if (err instanceof TimeoutError) {
    console.log(`Timed out: ${err.message}`);
  } else if (err instanceof ProcessExitError) {
    console.log(`Process exited: code=${err.exitCode}, signal=${err.signal}`);
  } else if (err instanceof ProtocolError) {
    console.log(`Protocol error: ${err.message} (code: ${err.code})`);
  }
}
```

| Error                  | When Thrown                                          |
| ---------------------- | ---------------------------------------------------- |
| `ConnectionError`      | Failed to spawn or connect to the droid process      |
| `ProtocolError`        | JSON-RPC protocol violation or server error response |
| `SessionError`         | General session-level error (base class)             |
| `SessionNotFoundError` | Session ID does not exist (extends `SessionError`)   |
| `TimeoutError`         | Request exceeded timeout (default: 30s, init: 60s)   |
| `ProcessExitError`     | Droid subprocess exited unexpectedly                 |

Source: [`src/errors.ts`](./src/errors.ts)

## Key Enums and Types

All enums are exported from the main entry point:

```ts
import {
  AutonomyLevel, // Off, Low, Medium, High
  DroidInteractionMode, // Auto, Spec, AGI
  ReasoningEffort, // None, Off, Dynamic, Minimal, Low, Medium, High, ExtraHigh ("xhigh"), Max
  ToolConfirmationOutcome, // ProceedOnce, ProceedAlways, Cancel, etc.
  ToolConfirmationType, // Edit, Execute, Create, McpTool, etc.
  DroidWorkingState, // Idle, StreamingAssistantMessage, ExecutingTool, etc.
  McpServerType, // Stdio, Http, Sse
  McpServerStatus, // Connecting, Connected, Disconnected, Failed, Disabled
} from '@factory/droid-sdk';
```

Full enum definitions: [`src/schemas/enums.ts`](./src/schemas/enums.ts)

Zod schemas for request/response validation: [`src/schemas/client.ts`](./src/schemas/client.ts)

## Source Code Map

```
src/
├── index.ts          # Public API barrel (all exports)
├── query.ts          # query() one-shot function + DroidQuery
├── session.ts        # createSession(), resumeSession(), DroidSession
├── client.ts         # DroidClient (typed RPC methods)
├── protocol.ts       # ProtocolEngine (JSON-RPC layer)
├── transport.ts      # ProcessTransport (subprocess management)
├── stream.ts         # DroidMessage types + notification converter
├── types.ts          # DroidClientTransport interface
├── errors.ts         # Error class hierarchy
├── constants.ts      # Timeout re-exports
└── schemas/
    ├── index.ts      # Schema barrel
    ├── enums.ts      # All protocol enums
    ├── client.ts     # Request/response Zod schemas (19 RPC methods)
    ├── server.ts     # Server→client message schemas
    ├── shared.ts     # JSON-RPC base schemas
    ├── constants.ts  # Protocol version + timeout constants
    ├── messages.ts   # Image/document content schemas
    ├── mcp.ts        # MCP server/tool schemas
    └── mission.ts    # Mission/feature schemas

examples/
├── simple-query.ts        # One-shot query with streaming
├── multi-turn-session.ts  # Multi-turn session lifecycle
├── permission-handler.ts  # Custom permission handling
└── interrupt-session.ts   # Interrupting a session mid-turn

tests/                     # Vitest test suite
```

All examples can be run with `npx tsx examples/<name>.ts` from the project root.
