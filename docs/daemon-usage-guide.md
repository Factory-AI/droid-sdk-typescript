# Daemon SDK Usage Guide

The daemon SDK connects to a running `droid daemon` process over WebSocket instead of spawning a new subprocess per session. This enables multiple concurrent sessions over a single connection and is the transport used by Slack, Linear, REST API, and Automations integrations.

## Getting Started

```bash
npm install @factory/droid-sdk
```

Requires a running `droid daemon` (the SDK will auto-start one locally) and a `FACTORY_API_KEY`. For simpler use cases that don't need concurrent sessions, see the [SDK Usage Guide](./sdk-usage-guide.md) which covers exec mode (`run()`, `createSession()`).

```ts
import { connectDaemon, DroidMessageType } from '@factory/droid-sdk';

const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
});
const session = await connection.createSession({ cwd: process.cwd() });

for await (const msg of session.stream('What files are in this directory?')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
  if (msg.type === DroidMessageType.Result)
    console.log(`Done in ${msg.durationMs}ms`);
}

await session.close();
await connection.close();
```

---

## Daemon vs Exec Mode

|           | Exec mode (`run`, `createSession`)     | Daemon mode (`connectDaemon`)                 |
| --------- | -------------------------------------- | --------------------------------------------- |
| Transport | Spawns `droid exec` subprocess (stdio) | WebSocket to `droid daemon`                   |
| Sessions  | One per subprocess                     | Multiple per connection                       |
| Auth      | Explicit (`apiKey`)                    | Explicit (`apiKey`)                           |
| Use case  | Simple scripts, CI                     | Server-side integrations, long-lived services |

Use daemon mode when you need multiple concurrent sessions, want to avoid subprocess overhead, or are building a server-side integration.

---

## Connect to Local Daemon

The simplest form -- the SDK spawns a local daemon and authenticates with the provided API key.

```ts
import { connectDaemon } from '@factory/droid-sdk';

const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
});
```

### Connect to Remote Machine

```ts
import { connectDaemon, MachineType } from '@factory/droid-sdk';

// Ephemeral sandbox (e2b)
const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
  machine: {
    type: MachineType.Ephemeral,
    sandboxId: 'sandbox-abc123',
    workspaceId: 'ws-xyz',
  },
});

// Computer relay
const connection2 = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
  machine: {
    type: MachineType.Computer,
    computerId: 'comp-abc123',
  },
});
```

### Direct URL

Skip machine-based resolution and connect to a specific WebSocket endpoint.

```ts
const connection = await connectDaemon({
  url: 'ws://127.0.0.1:37643',
  apiKey: process.env.FACTORY_API_KEY!,
});
```

### Connection Retries

```ts
const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
  maxRetries: 3, // Retry connect+authenticate cycle up to 3 times
});
```

---

## Create a Session

```ts
import {
  connectDaemon,
  AutonomyLevel,
  ReasoningEffort,
} from '@factory/droid-sdk';

const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
});

const session = await connection.createSession({
  cwd: '/path/to/project',
  modelId: 'claude-sonnet-4-20250514',
  autonomyLevel: AutonomyLevel.High,
  reasoningEffort: ReasoningEffort.High,
});
```

---

## Stream a Response

`stream()` yields complete messages by default: assistant text, tool calls, tool results, and the final result.

```ts
import { DroidMessageType } from '@factory/droid-sdk';

for await (const msg of session.stream('Refactor the utils module.')) {
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
      console.log(`Done in ${msg.durationMs}ms, turns: ${msg.numTurns}`);
      break;
  }
}
```

## Partial Message Streaming

Enable `includePartialMessages` to get token-by-token deltas as they arrive.

```ts
import { DroidMessageType } from '@factory/droid-sdk';

for await (const msg of session.stream('Explain recursion.', {
  includePartialMessages: true,
})) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

---

## Fire-and-Forget with send()

`send()` dispatches a prompt and returns after the daemon acknowledges it. The agent runs in the background -- you don't wait for completion. Use this for delegation workflows (e.g., Slack bot triggers a task).

```ts
await session.send('Fix all lint errors in src/.');
// Returns immediately after daemon ACK.
// The agent works in the background.
```

---

## Multi-turn Session

Context is preserved across `stream()` calls on the same session.

```ts
import { DroidMessageType } from '@factory/droid-sdk';

const session = await connection.createSession({ cwd: process.cwd() });

for await (const msg of session.stream('Remember: the secret is 42.')) {
  // consume first turn
}

for await (const msg of session.stream('What is the secret?')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text); // "42"
}

await session.close();
```

---

## Resume a Previous Session

Reconnect to a session that was created earlier (on this connection or a previous one).

```ts
import { DroidMessageType } from '@factory/droid-sdk';

const session = await connection.resumeSession('existing-session-id');

for await (const msg of session.stream('Continue where we left off.')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
```

---

## Concurrent Sessions

A single daemon connection supports multiple sessions running simultaneously. The SDK routes notifications to the correct session automatically.

```ts
import {
  connectDaemon,
  DaemonSession,
  DroidMessageType,
} from '@factory/droid-sdk';

const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
});

const [session1, session2] = await Promise.all([
  connection.createSession({ cwd: '/project-a' }),
  connection.createSession({ cwd: '/project-b' }),
]);

// Stream on both concurrently
const [result1, result2] = await Promise.all([
  collectResult(session1, 'Fix tests in project A.'),
  collectResult(session2, 'Add logging to project B.'),
]);

await session1.close();
await session2.close();
await connection.close();

async function collectResult(
  session: DaemonSession,
  prompt: string
): Promise<string> {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === DroidMessageType.Result) text = msg.result;
  }
  return text;
}
```

---

## Interrupt a Session

### From the session object

```ts
import { DroidMessageType } from '@factory/droid-sdk';

// Interrupt after receiving some output
for await (const msg of session.stream('Write a long essay.')) {
  if (msg.type === DroidMessageType.Assistant) {
    await session.interrupt();
    break;
  }
}
```

### With AbortSignal

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

try {
  for await (const msg of session.stream('Write a long essay.', {
    abortSignal: controller.signal,
  })) {
    // ...
  }
} catch {
  console.log('Aborted after 5 seconds');
}
```

### From the connection (without a session object)

```ts
await connection.interruptSession('session-id-to-interrupt');
```

---

## Permission Handler

Programmatically approve or reject tool calls.

```ts
import {
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

const session = await connection.createSession({
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

---

## Ask-User Handler

Programmatically answer questions that Droid asks during execution.

```ts
const session = await connection.createSession({
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
```

---

## SDK-backed MCP Tools

Define custom tools that Droid can call during a session.

```ts
import {
  connectDaemon,
  createSdkMcpServer,
  DroidMessageType,
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

for await (const msg of session.stream('Look up Alice.')) {
  if (msg.type === DroidMessageType.Assistant) console.log(msg.text);
}

await session.close();
await connection.close();
```

---

## Raw Notification Subscription

Subscribe to raw protocol notifications for custom event handling.

```ts
import { SessionNotificationType } from '@factory/droid-sdk';

const unsubscribe = session.onNotification(
  (notification) => {
    console.log('Notification:', notification);
  },
  { type: SessionNotificationType.DROID_WORKING_STATE_CHANGED }
);

// ... use the session ...

unsubscribe();
```

---

## Error Handling

The daemon SDK throws the same typed errors as exec mode.

```ts
import {
  connectDaemon,
  ConnectionError,
  TimeoutError,
  SessionNotFoundError,
  ProtocolError,
} from '@factory/droid-sdk';

try {
  const connection = await connectDaemon({
    apiKey: process.env.FACTORY_API_KEY!,
  });
  const session = await connection.resumeSession('nonexistent-id');
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

---

## Lifecycle Pattern

Always close sessions and connections when done.

```ts
import { connectDaemon } from '@factory/droid-sdk';

const connection = await connectDaemon({
  apiKey: process.env.FACTORY_API_KEY!,
});

try {
  const session = await connection.createSession({ cwd: process.cwd() });
  try {
    for await (const msg of session.stream('Do the thing.')) {
      // ...
    }
  } finally {
    await session.close();
  }
} finally {
  await connection.close();
}
```

---

## Configuration Reference

### `ConnectDaemonOptions`

| Field          | Type               | Required | Description                                                            |
| :------------- | :----------------- | :------- | :--------------------------------------------------------------------- |
| `apiKey`       | `string`           | **Yes**  | Factory API key for authentication.                                    |
| `machine`      | `SDKMachineConfig` | No       | Machine target. Defaults to local daemon.                              |
| `url`          | `string`           | No       | Direct WebSocket URL. Overrides machine resolution.                    |
| `maxRetries`   | `number`           | No       | Retry budget for connect+authenticate cycle.                           |
| `daemonPort`   | `number`           | No       | WebSocket port override. Default: `37643`.                             |
| `relayBaseUrl` | `string`           | No       | Relay URL for computer connections. Default: `wss://relay.factory.ai`. |

### `SDKMachineConfig`

| Variant     | Fields                             | Description                   |
| :---------- | :--------------------------------- | :---------------------------- |
| `Local`     | `{ type: MachineType.Local }`      | Local daemon on this machine. |
| `Ephemeral` | `{ type, sandboxId, workspaceId }` | e2b sandbox.                  |
| `Computer`  | `{ type, computerId }`             | Remote computer via relay.    |

### `DaemonSessionOptions`

| Field                     | Type                     | Description                                    |
| :------------------------ | :----------------------- | :--------------------------------------------- |
| `cwd`                     | `string`                 | Working directory for the session.             |
| `modelId`                 | `string`                 | LLM model identifier.                          |
| `autonomyLevel`           | `AutonomyLevel`          | `Off` \| `Low` \| `Medium` \| `High`.          |
| `interactionMode`         | `DroidInteractionMode`   | `Auto` \| `Spec` \| `AGI`.                     |
| `reasoningEffort`         | `ReasoningEffort`        | `Off` \| `Low` \| `Medium` \| `High` \| `Max`. |
| `specModeModelId`         | `string`                 | Override model for spec mode.                  |
| `specModeReasoningEffort` | `ReasoningEffort`        | Override reasoning effort for spec mode.       |
| `mcpServers`              | `DroidMcpServerConfig[]` | MCP server configurations.                     |
| `enabledToolIds`          | `string[]`               | Tool allowlist.                                |
| `disabledToolIds`         | `string[]`               | Tool denylist.                                 |
| `tags`                    | `SessionTag[]`           | Session tags for categorization.               |
| `permissionHandler`       | `PermissionHandler`      | Tool confirmation callback.                    |
| `askUserHandler`          | `AskUserHandler`         | Structured user-input callback.                |
| `sessionSource`           | `SessionSource`          | Attribution metadata.                          |

### `DaemonResumeOptions`

| Field               | Type                     | Description                     |
| :------------------ | :----------------------- | :------------------------------ |
| `permissionHandler` | `PermissionHandler`      | Tool confirmation callback.     |
| `askUserHandler`    | `AskUserHandler`         | Structured user-input callback. |
| `mcpServers`        | `DroidMcpServerConfig[]` | MCP servers to attach.          |

### `SendOptions`

| Field          | Type                  | Description                            |
| :------------- | :-------------------- | :------------------------------------- |
| `images`       | `Base64ImageSource[]` | Base64-encoded image attachments.      |
| `files`        | `DocumentSource[]`    | Document/file attachments.             |
| `outputFormat` | `OutputFormat`        | Structured output JSON schema request. |

### Key Classes

| Class                | Description                                                                |
| :------------------- | :------------------------------------------------------------------------- |
| `DaemonConnection`   | Manages the WebSocket connection. Creates/resumes sessions.                |
| `DaemonSession`      | A single session. Provides `stream()`, `send()`, `interrupt()`, `close()`. |
| `DaemonClient`       | Low-level RPC client. Used internally by `DaemonSession`.                  |
| `WebSocketTransport` | WebSocket transport with retry and reconnection.                           |
