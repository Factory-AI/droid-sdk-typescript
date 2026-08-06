# Factory TypeScript SDK

The Factory TypeScript SDK lets applications run Droid, continue conversations,
stream work, control tools, and connect to a running Droid daemon.

The public npm package is `@factory/droid-sdk`.

This page is the single user-facing SDK guide. The package's exported
TypeScript declarations remain authoritative for its compile-time API surface.

## Overview

The SDK has two main runtimes.

| Runtime | Import                    | Use it for                                                      |
| ------- | ------------------------- | --------------------------------------------------------------- |
| Node    | `@factory/droid-sdk/node` | Scripts, CI, local tools, and apps that can start the Droid CLI |
| Daemon  | `@factory/droid-sdk`      | Browser or Node apps that connect to an existing Droid daemon   |

The Node runtime starts a Droid subprocess for you. The daemon runtime connects
to a daemon over WebSocket and can manage several sessions through one
connection.

The root import is browser-safe. The `/node` import adds subprocess,
filesystem, local session discovery, and SDK MCP tool APIs.

## Requirements and installation

Install the package:

```bash
npm install @factory/droid-sdk
```

The SDK requires Node.js 18 or later.

By default, Node session APIs start the `droid` CLI from `PATH`. You can provide
a different executable with `execPath`. Supplying a custom `transport` bypasses
subprocess creation and this requirement.

Set an API key:

```bash
export FACTORY_API_KEY="your-key"
```

You can also pass `apiKey` directly when creating a Node session.

### Browser security

The daemon client currently authenticates with a Factory API key. Use browser
examples only in trusted local tools. Do not ship a Factory API key in a public
website, commit it to source control, or put it in a URL.

An HTTPS page must connect with `wss://`. Local pages served over HTTP can use
`ws://`.

## Quick start

### Run one prompt

**Runtime: Node**

```ts
import { run } from '@factory/droid-sdk/node';

const result = await run('Summarize this repository.');

if (!result.success) {
  throw new Error(result.error?.message ?? 'The run did not complete.');
}

console.log(result.text);
```

`run()` creates a session, waits for its final result, and closes the session.
Use it for one-shot work.

### Continue a conversation

**Runtime: Node**

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk/node';

const session = await createSession();

try {
  for await (const message of session.stream('What does this project do?')) {
    if (message.type === DroidMessageType.Assistant) {
      console.log(message.text);
    }
  }

  for await (const message of session.stream('What should I test first?')) {
    if (message.type === DroidMessageType.Assistant) {
      console.log(message.text);
    }
  }
} finally {
  await session.close();
}
```

Use a session when later prompts need context from earlier turns.

### Connect to a daemon

**Runtime: Node or trusted local browser**

```ts
import { connectToDaemon, DroidMessageType } from '@factory/droid-sdk';

async function runWithDaemon(apiKey: string, cwd: string) {
  const droid = await connectToDaemon({
    url: 'ws://127.0.0.1:37643',
    auth: { apiKey },
  });

  const session = await droid.sessions.create({ cwd });

  try {
    for await (const message of session.stream('Summarize this repository.')) {
      if (message.type === DroidMessageType.Assistant) {
        console.log(message.text);
      }
    }
  } finally {
    await Promise.allSettled([session.close()]);
    droid.disconnect();
  }
}
```

In browser code, obtain both arguments from trusted local configuration. This
does not make an API key secret from browser JavaScript, so keep this pattern
restricted to trusted local pages.

## Core concepts

### Session

A session holds conversation history, settings, and a working directory.

Node sessions are created with `createSession()` or loaded with
`resumeSession()`. Daemon sessions are created or resumed through
`droid.sessions`.

### Turn

A turn starts when you send one prompt with `session.stream()`. A session can
run one turn at a time. Different daemon sessions can run turns concurrently.

### Stream message

`session.stream()` yields a discriminated message union. The default stream
contains complete user, assistant, tool, hook, error, and result messages.

### Result

Every normally completed stream ends with a result message. A result reports
success, interruption, or failure and includes final text, messages, duration,
turn count, and token usage when available.

### Node and daemon lifecycle behavior

Node and daemon replacement operations intentionally behave differently.

| Behavior                        | Node session                                               | Daemon session                 |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| Successor response              | `fork`: handle; `compact`/`rewind`: outcome with `session` | Outcome with `newSessionId`    |
| Source handle after replacement | Retired                                                    | Still usable                   |
| Load successor                  | Automatic                                                  | Call `droid.sessions.resume()` |

See [Session lifecycle](#session-lifecycle) for examples.

## One-shot runs

**Runtime: Node**

```ts
function run(prompt: string, options?: RunOptions): Promise<DroidResult>;
```

`run()` supports the same creation and message options as a Node session,
except partial stream events.

```ts
const result = await run('Review the authentication middleware.', {
  cwd: '/path/to/repository',
  modelId: 'model-id',
  reasoningEffort: ReasoningEffort.High,
  disabledToolIds: ['Execute'],
});
```

Common options:

| Option                         | Purpose                                        |
| ------------------------------ | ---------------------------------------------- |
| `cwd`                          | Working directory. Defaults to `process.cwd()` |
| `apiKey`                       | Factory API key. Defaults to `FACTORY_API_KEY` |
| `modelId`                      | Model selection                                |
| `reasoningEffort`              | Model reasoning level                          |
| `autonomyLevel`                | Permission policy level                        |
| `interactionMode`              | Auto, spec, or mission mode. AGI is deprecated |
| `specModeModelId`              | Model used in spec mode                        |
| `specModeReasoningEffort`      | Reasoning level used in spec mode              |
| `disabledToolIds`              | Tools that Droid cannot use                    |
| `autoRejectPermissionRequests` | Reject all permission requests automatically   |
| `disableBuiltinSkills`         | Hide Factory-provided built-in skills          |
| `permissionHandler`            | Handles permission requests                    |
| `askUserHandler`               | Answers AskUser requests                       |
| `tags`                         | Session attribution tags                       |
| `sessionSource`                | Session source attribution                     |
| `images`                       | Base64 image attachments                       |
| `files`                        | Text or PDF attachments                        |
| `outputFormat`                 | JSON schema for structured output              |
| `abortSignal`                  | Cancels the run                                |
| `mcpServers`                   | MCP servers available to the session           |
| `observability`                | Logging, metrics, and trace integration        |
| `execPath`                     | Droid executable path                          |
| `execArgs`                     | Additional Droid process arguments             |
| `env`                          | Additional Droid process environment variables |
| `transport`                    | Custom string-framed transport                 |

## Sessions

### Create a Node session

```ts
import { createSession } from '@factory/droid-sdk/node';

const session = await createSession({
  cwd: process.cwd(),
  modelId: 'model-id',
});
```

When omitted, `cwd` defaults to `process.cwd()`. Model and reasoning defaults
come from Droid settings.

### Resume a Node session

```ts
import { resumeSession } from '@factory/droid-sdk/node';

const session = await resumeSession('session-id');
```

The saved session owns its working directory and settings. Resume options can
change handlers, transports, disabled tools, MCP servers, and observability,
but cannot replace saved model or working-directory settings.

### Session state

```ts
console.log(session.id);
console.log(session.cwd);
console.log(session.settings.modelId);
```

`settings` and `cwd` update when the running session reports changes.

### Update settings

```ts
await session.updateSettings({
  modelId: 'model-id',
  reasoningEffort: ReasoningEffort.High,
  autonomyLevel: AutonomyLevel.Low,
  disabledToolIds: ['Execute'],
});
```

Public settings include model, reasoning, interaction mode, autonomy, spec
mode settings, tags, mission settings, compaction settings, and disabled tools.

### Rename a session

```ts
await session.rename({ title: 'Authentication review' });
```

### Discover saved Node sessions

```ts
import { listSessions } from '@factory/droid-sdk/node';

const sessions = await listSessions({
  cwd: process.cwd(),
  limit: 10,
});
```

`listSessions()` reads local session storage. It does not call the Factory REST
API or a daemon.

### Close a session

Call `close()` in `finally` when your code owns a Node session.

```ts
const session = await createSession();

try {
  // Use the session.
} finally {
  await session.close();
}
```

## Streaming

### Complete messages

Complete messages are the default.

```ts
for await (const message of session.stream('Find the failing test.')) {
  switch (message.type) {
    case DroidMessageType.Assistant:
      console.log(message.text);
      break;
    case DroidMessageType.ToolCall:
      console.log(`Tool: ${message.name}`);
      break;
    case DroidMessageType.Result:
      console.log(message.subtype);
      break;
  }
}
```

Default message types:

| Type          | Purpose                              |
| ------------- | ------------------------------------ |
| `assistant`   | Complete assistant message           |
| `user`        | User message recorded by the session |
| `tool_call`   | Complete tool request                |
| `tool_result` | Complete tool result                 |
| `hook`        | Hook execution                       |
| `error`       | Runtime error event                  |
| `result`      | Final turn result                    |

### Partial events

Use partial events only when the application needs live text, thinking, tool
progress, usage, or state updates.

```ts
for await (const event of session.stream('Explain the test failure.', {
  includePartialMessages: true,
})) {
  if (event.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(event.text);
  }
}
```

Partial streams can also include thinking deltas, tool-call deltas, tool
progress, token updates, permission results, settings changes, working-state
changes, MCP status, and mission events.

### Stream concurrency

One session handle can have one active stream. Starting another active stream
throws `ConcurrentStreamError`.

Daemon sessions on the same connection may stream concurrently.

### Stop consuming a stream

Breaking out of a stream early interrupts the active server turn.

## Inputs and outputs

### Images

```ts
const result = await run('Describe this image.', {
  images: [
    {
      type: 'base64',
      data: base64Png,
      mediaType: 'image/png',
    },
  ],
});
```

Supported image types are JPEG, PNG, GIF, and WebP.

### Documents

```ts
for await (const _message of session.stream('Summarize this document.', {
  files: [
    {
      type: 'text',
      mediaType: 'text/plain',
      data: report,
      name: 'report.txt',
    },
  ],
})) {
  // Consume messages.
}
```

Document inputs support plain text and base64 PDF data.

### Structured output

Use structured output when another system needs a predictable result.

```ts
import { OutputFormatType, run } from '@factory/droid-sdk/node';

const result = await run('Review this function for correctness issues.', {
  outputFormat: {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        findings: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line: { type: 'number' },
              severity: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
              },
              message: { type: 'string' },
            },
            required: ['line', 'severity', 'message'],
          },
        },
      },
      required: ['summary', 'findings'],
    },
  },
});

if (!result.success) {
  throw new Error(
    result.structuredOutputError?.message ??
      result.error?.message ??
      'Structured output failed.'
  );
}

console.log(result.structuredOutput);
```

`structuredOutput` is typed as `unknown`. Validate or narrow it before passing
it to another system. A successful result can omit structured output.

### Result metadata

```ts
console.log(result.sessionId);
console.log(result.durationMs);
console.log(result.turnCount);
console.log(result.tokenUsage);
console.log(result.messages);
```

`tokenUsage` is `null` when usage is unavailable.

## Cancellation and interruption

### Abort one turn

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 5_000);

for await (const message of session.stream('Perform a long review.', {
  abortSignal: controller.signal,
})) {
  // Handle messages.
}
```

The stream throws the abort reason after interrupting the active turn.

### Interrupt and keep the session

```ts
await session.interrupt();
```

`interrupt()` stops the active turn on the server. The stream continues to its
terminal result, normally with subtype `interrupted`. The session remains
usable for later prompts.

A session-level abort signal passed to `createSession()` closes the whole
session when aborted.

## Permissions and user input

### Autonomy

```ts
import { AutonomyLevel } from '@factory/droid-sdk/node';

const session = await createSession({
  autonomyLevel: AutonomyLevel.Off,
});
```

Levels are `Off`, `Low`, `Medium`, and `High`. When omitted, Droid settings
choose the default.

### Permission handler

```ts
import {
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk/node';

const session = await createSession({
  autonomyLevel: AutonomyLevel.Off,
  permissionHandler(request) {
    const safe =
      request.toolUses.length > 0 &&
      request.toolUses.every(
        (use) => use.details.type === ToolConfirmationType.Create
      );

    return safe
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
  },
});
```

The handler must return an outcome supplied by the request. Invalid results and
handler errors cancel the request.

Without a handler, permission requests are cancelled.

### AskUser handler

```ts
const result = await run('Ask me which environment to deploy.', {
  askUserHandler(request) {
    return {
      answers: request.questions.map((question) => ({
        index: question.index,
        question: question.question,
        answer: question.options[0] ?? 'none',
      })),
    };
  },
});
```

To decline:

```ts
return { cancelled: true, answers: [] };
```

Without a handler, AskUser requests are declined.

### Disable tools

```ts
const session = await createSession({
  disabledToolIds: ['Execute'],
});
```

Tool IDs are strings. Use `listTools()` to inspect the tools available to the
current session.

```ts
const tools = await session.listTools();

for (const tool of tools) {
  console.log(tool.id, tool.allowed);
}
```

The public SDK provides subtractive `disabledToolIds`. It does not expose a
restrictive allowlist.

## Tools and extensions

### Skills

```ts
const { skills } = await session.listSkills();

await session.setSkillDisabled({
  skillName: 'skill-name',
  disabled: true,
  settingsLevel: 'project',
});
```

Skills may come from project, personal, built-in, or automation settings.

### SDK MCP tools

**Runtime: Node**

Use an SDK MCP server to define an in-process tool with a typed Zod input.

```ts
import { z } from 'zod';
import {
  createSdkMcpServer,
  createSession,
  tool,
} from '@factory/droid-sdk/node';

const tools = createSdkMcpServer({
  name: 'review-tools',
  tools: [
    tool(
      'lookup_owner',
      'Returns the owner of a file',
      { path: z.string() },
      ({ path }) => `Owner for ${path}: platform-team`
    ),
  ],
});

const session = await createSession({
  mcpServers: [tools],
});
```

The SDK starts an authenticated loopback MCP server and closes it with the
session.

### External MCP servers

Node sessions can add, remove, toggle, list, and authenticate MCP servers.

```ts
await session.addMcpServer({
  name: 'docs',
  type: 'http',
  url: 'https://example.com/mcp',
});

const servers = await session.listMcpServers();
const tools = await session.listMcpTools();
```

The daemon client exposes the complete MCP management API through `droid.mcp`.

### Hooks

Hooks are configured in `.factory/hooks.json`. They can run before or after
tools, when prompts are submitted, when notifications arrive, during
compaction, and when sessions or subagents stop.

Hook events are available in the stream:

```ts
for await (const message of session.stream('Run the tests.')) {
  if (message.type === DroidMessageType.Hook) {
    console.log(message.status, message.command);
  }
}
```

The SDK exposes hook schemas and types, but does not provide a programmatic
hook-registration API.

### Raw notifications

**Runtime: Node**

```ts
const unsubscribe = session.onNotification(
  (notification) => console.log(notification),
  { type: 'settings_updated' }
);

unsubscribe();
```

Use raw notifications only when the typed stream does not expose the event you
need.

## Session lifecycle

### Node replacement handles

Node `fork()` returns a ready successor handle. `compact()` and `rewind()`
return outcome objects containing a ready successor in `session`. Each
operation retires its source wrapper.

```ts
const forked = await session.fork();

const { session: compacted, removedCount } = await forked.compact();

const {
  session: rewound,
  restoredCount,
  deletedCount,
} = await compacted.rewind({
  messageId,
  filesToRestore,
  filesToDelete,
  forkTitle: 'Before the failed change',
});
```

After a successful replacement, active operations on the source wrapper throw
`SessionReplacedError`. Its `id`, `settings`, and `cwd` remain readable, and
`close()` is a no-op. The persisted source session can still be loaded later
with `resumeSession(sourceId)`.

Do not replace a session while it has an active stream.

### Daemon replacement IDs

Daemon operations return a new session ID. The source handle remains usable.

```ts
const { newSessionId } = await source.compact();
const compacted = await droid.sessions.resume(newSessionId);
```

The same rule applies to `fork()` and `rewind()`.

```ts
const forkResult = await source.fork();
const fork = await droid.sessions.resume(forkResult.newSessionId);

const rewindResult = await source.rewind({
  messageId,
  filesToRestore,
  filesToDelete,
  forkTitle: 'Before the failed change',
});
const rewound = await droid.sessions.resume(rewindResult.newSessionId);
```

Daemon replacement locking is local to one client handle. Avoid replacing or
streaming the same session through several daemon clients at once.

## Spec mode

Create a session in spec mode:

```ts
import {
  createSession,
  DroidInteractionMode,
  ReasoningEffort,
} from '@factory/droid-sdk/node';

const session = await createSession({
  interactionMode: DroidInteractionMode.Spec,
  specModeReasoningEffort: ReasoningEffort.High,
});
```

Enter spec mode later:

```ts
await session.enterSpecMode({
  specModeReasoningEffort: ReasoningEffort.High,
});
```

When Droid asks to leave spec mode, a permission handler can approve
implementation in the same session or hand it to a new session.

| Outcome                 | Behavior                                            |
| ----------------------- | --------------------------------------------------- |
| `ProceedOnce`           | Continue in the same session                        |
| `ProceedNewSessionHigh` | Start implementation in a new high-autonomy session |

New-session handoff IDs currently require inspecting raw notifications.

## Daemon and browser applications

### Connect

```ts
const droid = await connectToDaemon({
  url: 'ws://127.0.0.1:37643',
  auth: { apiKey },
  permissionHandler,
  askUserHandler,
  onError(error) {
    console.error(error);
  },
});
```

Connection-level handlers become defaults for created and resumed sessions.
Per-session handlers override them.

### Create and resume

```ts
const created = await droid.sessions.create({
  cwd: '/path/to/repository',
});

const resumed = await droid.sessions.resume('session-id');
```

One `ConnectedDroid` can have one attached handle for each session ID.

### List and inspect history

```ts
const sessions = await droid.sessions.list({ limit: 20 });

const messages = await droid.sessions.getMessages(sessions[0].id, {
  limit: 50,
});

const matches = await droid.sessions.search({
  query: 'authentication failure',
});
```

The daemon session resource also supports opened-session listing,
archive/unarchive, rename, settings, context information, and queued-message
operations.

### Concurrent sessions

Different daemon sessions can stream over one connection at the same time.

```ts
await Promise.all([
  consume(first.stream('Review the API.')),
  consume(second.stream('Review the tests.')),
]);
```

### Cleanup

| Operation            | Daemon session | Local handle           | Connection |
| -------------------- | -------------- | ---------------------- | ---------- |
| `session.detach()`   | Keeps running  | Detached               | Retained   |
| `session.close()`    | Ends           | Detached after success | Retained   |
| `droid.disconnect()` | Keeps running  | All detached           | Destroyed  |

Detached handles cannot be reused. Resume the session to obtain a new handle.

### Stable daemon resources

| Namespace      | Main methods                                                                                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sessions`     | `list`, `listOpened`, `create`, `resume`, `getMessages`, `search`, `archive`, `unarchive`, `rename`, `updateSettings`, `resolveQueuedMessage`, `killWorker`, `getRewindInfo`, `rewind`, `compact`, `fork`, `getContextBreakdown` |
| `workspace`    | `changeDirectory`, `validateDirectory`, `checkTrust`, `trust`, `listFiles`, `searchFiles`, `getFileContent`                                                                                                                      |
| `settings`     | `getDefaults`, `updateDefaults`                                                                                                                                                                                                  |
| `customModels` | `list`, `upsert`, `delete`                                                                                                                                                                                                       |
| `ssh`          | `installKey`                                                                                                                                                                                                                     |
| `updates`      | `trigger`                                                                                                                                                                                                                        |
| `relay`        | `start`, `stop`, `status`                                                                                                                                                                                                        |
| `terminals`    | `create`, `write`, `resize`, `close`, `list`                                                                                                                                                                                     |
| `mcp`          | `getConfig`, `updateConfig`, `addServer`, `removeServer`, `toggleServer`, authentication, registry, and tool methods                                                                                                             |
| `skills`       | `list`, `setDisabled`                                                                                                                                                                                                            |
| `commands`     | `list`                                                                                                                                                                                                                           |
| `plugins`      | `listAvailable`, `listInstalled`, `install`, `uninstall`, `setEnabled`, `update`                                                                                                                                                 |
| `marketplaces` | `list`, `add`, `remove`, `update`                                                                                                                                                                                                |
| `automations`  | `list`, `run`, `pause`, `resume`, history, visual, create, update, rename, delete, fork, and config methods                                                                                                                      |
| `git`          | `getDiff`, `listBranches`, `checkoutBranch`, `push`, `commit`, `createPullRequest`, `resolvePullRequestStatuses`                                                                                                                 |
| `feedback`     | `submitBugReport`                                                                                                                                                                                                                |

### Facade return shapes

The namespaced daemon facade normalizes common collection results:

- `sessions.list()` returns session summaries with `id`, `messageCount`, and
  `modifiedTime`.
- `sessions.getMessages()` returns the message array directly.
- Collection methods such as `customModels.list()`, `terminals.list()`,
  `mcp.listRegistry()`, `mcp.listTools()`, `commands.list()`, and the plugin,
  marketplace, automation, and Software Factory list methods return arrays.
- Methods whose protocol result includes additional metadata retain the result
  object. This includes `sessions.search()`, `mcp.listServers()`, and
  `skills.list()`.

The low-level `DaemonClient` returns canonical protocol response types instead
of these normalized facade shapes.

## Observability

**Runtime: Node**

```ts
const session = await createSession({
  observability: {
    logger: {
      log(event) {
        console.log(event.level, event.message);
      },
    },
    metrics: {
      record(event) {
        console.log(event.name, event.value);
      },
    },
    tracing: {
      inject(carrier) {
        carrier.traceparent = currentTraceparent;
      },
    },
  },
});
```

Observability sinks must not throw into SDK operations. The SDK avoids sending
prompt text, message content, tool inputs, raw output, and stack traces through
its observability contracts.

## Advanced resources

### Low-level daemon integration

Most applications should use `connectToDaemon()`. The root entrypoint also
exports `DaemonClient`, `DaemonSessionController`, `MultiSessionStateManager`,
`MultiMissionStateManager`, `WebSocketDaemonTransport`, daemon events, and
canonical protocol types for hosts that need custom connection or state
ownership.

Node-only IPC and in-process transports come from the `/node` entrypoint:

```ts
import { DaemonClient, MachineType } from '@factory/droid-sdk';
import {
  InProcessDaemonClientTransport,
  type InProcessDaemonClientTransportOptions,
  type InProcessMessageHandler,
} from '@factory/droid-sdk/node';

function createInProcessClient(
  sendMessage: InProcessMessageHandler,
  onMessage: NonNullable<InProcessDaemonClientTransportOptions['onMessage']>
) {
  const transport = new InProcessDaemonClientTransport({
    sendMessage,
    onMessage,
  });

  return new DaemonClient({
    machineType: MachineType.Local,
    transport,
  });
}
```

The root also exports `WebSocketDaemonTransport`; the `/node` entrypoint exports
`IpcDaemonClientTransport`.

Hosts can inject daemon-core logging, metrics, tracing, and domain helpers once
at startup:

```ts
import { configureDaemonCoreDeps } from '@factory/droid-sdk';

configureDaemonCoreDeps({
  logger: {
    info: (message, metadata) => logger.info(message, metadata),
    error: (message, metadata) => logger.error(message, metadata),
  },
});
```

Unspecified dependencies keep their standalone defaults.

### Low-level Node integration

Most Node applications should use `run()` or `DroidSession`. The `/node`
entrypoint also exports `ProcessTransport` and `DroidClient` for direct
JSON-RPC integrations.

Low-level RPC methods return complete response envelopes. Read successful
payloads from `response.result`. Direct permission and AskUser handlers receive
complete request events, while high-level session handlers receive request
parameters.

`ProcessTransport` uses `droidExecPath` and `droidExecExtraArgs` for executable
configuration. A custom `StringFramedDroidClientTransport` exchanges
newline-delimited JSON-RPC strings and can replace subprocess transport
entirely.

### Context and token usage

Read the current context-window estimate:

```ts
const stats = await session.getContextStats();

console.log(stats.used, stats.remaining, stats.limit, stats.accuracy);
```

Enable partial messages to receive live token updates:

```ts
for await (const message of session.stream('Summarize this repository.', {
  includePartialMessages: true,
})) {
  if (message.type === DroidMessageType.TokenUsageUpdate) {
    console.log(message.inputTokens, message.outputTokens);
  }
}
```

The final result's `tokenUsage` contains the last observed totals or `null`.

### Factory REST API

The browser-safe root exports REST helpers for Factory computers, machine
templates, metrics, dependency installation, and remote-session listing.

```ts
import { listComputers, listRemoteSessions } from '@factory/droid-sdk';

const options = { apiKey: process.env.FACTORY_API_KEY! };

const computers = await listComputers(options);
const sessions = await listRemoteSessions(options);
```

REST calls use `https://api.factory.ai` by default. Pass `baseUrl` to target a
different Factory API host.

| Resource            | Functions                                                                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Machine templates   | `listMachineTemplates`, `getMachineTemplate`                                                                                                    |
| Computers           | `listComputers`, `getComputer`, `getComputerByName`, `createComputer`, `updateComputer`, `deleteComputer`, `restartComputer`, `refreshComputer` |
| Computer operations | `getComputerMetrics`, `retryInstallDeps`                                                                                                        |
| Remote sessions     | `listRemoteSessions`                                                                                                                            |

### Unstable daemon resources

APIs under `droid.unstable` may change between SDK releases.

| Namespace         | Main methods or resources                                                 |
| ----------------- | ------------------------------------------------------------------------- |
| `crons`           | `list`, `create`, `update`, `delete`, `holdSession`, `resumeSession`      |
| `missions`        | `inspectReadiness`, `acknowledgeReadinessWarning`                         |
| `semanticDiff`    | `getCache`, `saveCache`, `generate`                                       |
| `fileTransfers`   | `push`, `pull`                                                            |
| `proxy`           | `getToken`                                                                |
| `softwareFactory` | `workstreams`, `signals`, `changes`, `activities`, and `events` resources |

Keep unstable API use behind an application-owned adapter.

For example, create and manage a scheduled prompt through the unstable cron
resource:

```ts
const cron = await droid.unstable.crons.create({
  kind: 'root_prompt',
  scope: { type: 'root' },
  schedule: { expression: '0 * * * *', recurring: true },
  payload: {
    type: 'prompt',
    prompt: 'Check repository health',
    target: { type: 'new_session', cwd: '/workspace' },
  },
});

await droid.unstable.crons.update(cron.id, { status: 'paused' });
await droid.unstable.crons.delete(cron.id);
```

## API reference

### Node functions

| API                                  | Returns                      |
| ------------------------------------ | ---------------------------- |
| `run(prompt, options?)`              | `Promise<DroidResult>`       |
| `createSession(options?)`            | `Promise<DroidSession>`      |
| `resumeSession(sessionId, options?)` | `Promise<DroidSession>`      |
| `listSessions(options?)`             | `Promise<SessionMetadata[]>` |
| `createSdkMcpServer(options)`        | `SdkMcpServer`               |
| `tool(...)`                          | `DroidTool`                  |

### `DroidSession`

| Member                    | Purpose                               |
| ------------------------- | ------------------------------------- |
| `id`                      | Session ID                            |
| `cwd`                     | Live working directory                |
| `settings`                | Live read-only settings               |
| `stream()`                | Run one turn                          |
| `interrupt()`             | Stop the active turn                  |
| `updateSettings()`        | Update session settings               |
| `enterSpecMode()`         | Change to spec mode                   |
| `listTools()`             | List normalized tools                 |
| `listSkills()`            | List skills                           |
| `setSkillDisabled()`      | Enable or disable a skill             |
| `addMcpServer()`          | Add an MCP server                     |
| `removeMcpServer()`       | Remove an MCP server                  |
| `toggleMcpServer()`       | Enable or disable an MCP server       |
| `listMcpServers()`        | List MCP servers                      |
| `listMcpTools()`          | List MCP tools                        |
| `authenticateMcpServer()` | Start MCP authentication              |
| `getContextStats()`       | Read context usage                    |
| `getRewindInfo()`         | Inspect rewindable file changes       |
| `rewind()`                | Create a rewound successor            |
| `compact()`               | Create a compacted successor          |
| `fork()`                  | Create a forked successor             |
| `rename()`                | Change the session title              |
| `onNotification()`        | Subscribe to raw notifications        |
| `close()`                 | Close the session and owned resources |

### Result states

| Subtype                   | `success` | `interrupted` | Meaning                   |
| ------------------------- | --------- | ------------- | ------------------------- |
| `success`                 | `true`    | `false`       | Turn completed            |
| `interrupted`             | `false`   | `true`        | Turn was stopped          |
| `error_during_execution`  | `false`   | `false`       | Runtime failure           |
| `error_structured_output` | `false`   | `false`       | Structured-output failure |

Common result fields:

```ts
{
  type: 'result';
  subtype:
    | 'success'
    | 'interrupted'
    | 'error_during_execution'
    | 'error_structured_output';
  sessionId: string;
  durationMs: number;
  tokenUsage: TokenUsage | null;
  messages: DroidStreamEvent[];
  text: string;
  turnCount: number;
  success: boolean;
  interrupted: boolean;
  structuredOutput?: unknown;
  structuredOutputError?: StructuredOutputError | null;
  error: ErrorEvent | null;
}
```

### Main enums

| Enum                   | Values                                                                           |
| ---------------------- | -------------------------------------------------------------------------------- |
| `AutonomyLevel`        | `Off`, `Low`, `Medium`, `High`                                                   |
| `DroidInteractionMode` | `Auto`, `Spec`, `Mission`; `AGI` is deprecated                                   |
| `ReasoningEffort`      | `None`, `Dynamic`, `Off`, `Minimal`, `Low`, `Medium`, `High`, `ExtraHigh`, `Max` |
| `OutputFormatType`     | `JsonSchema`                                                                     |

Model IDs and tool IDs are strings. Discover available models and tools at
runtime instead of treating them as closed enums.

### Main errors

Universal errors:

| Error                      | Meaning                                       |
| -------------------------- | --------------------------------------------- |
| `ConcurrentStreamError`    | A session handle already has an active stream |
| `SessionReplacedError`     | A Node source wrapper was replaced            |
| `SessionReplacementError`  | Successor loading or rollback failed          |
| `AbortError`               | A daemon operation was aborted                |
| `ConnectionClosedError`    | Daemon connection closed                      |
| `JsonRpcRequestError`      | Daemon JSON-RPC request failed                |
| `RelayConnectionError`     | Relay connection failed                       |
| `WebSocketConnectionError` | WebSocket connection failed                   |

Node-only errors:

| Error                    | Meaning                                      |
| ------------------------ | -------------------------------------------- |
| `DroidClientError`       | Base Node client error                       |
| `ConnectionError`        | Droid process or transport connection failed |
| `TimeoutError`           | A request timed out                          |
| `ProtocolError`          | Protocol or API response failed              |
| `SessionError`           | Base session error                           |
| `SessionNotFoundError`   | Saved session was not found                  |
| `InvalidSessionCwdError` | Saved working directory is invalid           |
| `ProcessExitError`       | Droid subprocess exited unexpectedly         |

### Custom transports

**Runtime: Node, advanced**

```ts
interface StringFramedDroidClientTransport {
  isConnected: boolean;
  send(message: string): Promise<void>;
  onMessage(handler: (message: string) => void): void;
  onError(handler: (error: Error) => void): void;
  close(): Promise<void>;
}
```

Pass a ready transport through `run()`, `createSession()`, or
`resumeSession()`. A custom transport bypasses subprocess creation and the
Node API-key requirement.

## Errors and limitations

### Handle results explicitly

```ts
const result = await run('Run the test suite.');

switch (result.subtype) {
  case 'success':
    console.log(result.text);
    break;
  case 'interrupted':
    console.log('The run was interrupted.');
    break;
  case 'error_during_execution':
  case 'error_structured_output':
    console.error(
      result.structuredOutputError?.message ??
        result.error?.message ??
        'Unknown error'
    );
    break;
}
```

### Known limitations

- Daemon replacement locking does not coordinate separate clients.
- Browser daemon authentication currently requires an API key.
- New-session spec handoff IDs require raw notification inspection.
- REST remote-session support currently provides listing only.

## Runnable examples

The package includes runnable examples for one-shot runs, streaming, sessions,
permissions, AskUser, attachments, structured output, MCP tools, hooks,
observability, spec mode, replacement lifecycle, daemon sessions, concurrent
browser sessions, and daemon lifecycle operations.

All examples are under:

```text
examples/node/
examples/browser/
```

Run a Node example directly:

```bash
npx tsx examples/node/run.ts
```

Browser examples use an interactive local launcher. Start a daemon and the
example server in separate terminals:

```bash
droid daemon --host 127.0.0.1 --port 37643
npm run serve:browser-example
```

Open `http://127.0.0.1:8420/`, then enter the daemon WebSocket URL, Factory API
key, and working directory. The values stay in page memory and are not stored,
logged, added to the URL, or sent to the example server. The launcher includes
session streaming, concurrent sessions, session lifecycle operations, and
session listing examples.
