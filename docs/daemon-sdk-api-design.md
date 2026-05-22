# Daemon SDK — API Design

> API design for daemon mode in `@factory/droid-sdk`. This is a sibling to the existing exec-based `run()` / `createSession()` API — it does not replace or modify them.

## Design Principles

1. **Zero impact on existing API** — `run()`, `createSession()`, `resumeSession()` remain unchanged.
2. **Same session contract** — `DaemonSession` shares the core `stream()` / `interrupt()` / `close()` interface with `DroidSession`, so session-level code is portable.
3. **Two usage modes** — interactive (long-lived connection, streaming, permissions) and headless (fire-and-forget, no streaming). Both are first-class.
4. **Auth matches the context** — local usage reads stored credentials invisibly (like exec mode). Server-side usage accepts an explicit `apiKey`.
5. **Daemon lifecycle is managed** — for local usage, the SDK spawns/discovers the daemon. The user never sees WebSocket URLs or ports.

---

## Connecting

### Local daemon (scripts, desktop integrations, CLI tools)

```ts
import { connectDaemon } from '@factory/droid-sdk';

const daemon = await connectDaemon();
```

The SDK spawns `droid daemon` on a random port (or discovers an already-running one), reads stored credentials from `~/.factory/auth.v2.*` (same store as `droid auth login`), and authenticates the WebSocket connection.

No config needed. Same prerequisites as exec mode: `droid` CLI installed, user logged in.

### Remote daemon (connecting to a registered computer)

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId: 'my-desktop-machine' },
});
```

The SDK resolves the relay URL from the computer ID, handles relay authentication, and authenticates the daemon connection — all transparently.

### Ephemeral sandbox (server-side / headless)

For backend services (Slack bots, Linear integrations, CI pipelines, REST APIs) that connect to daemons running on ephemeral sandboxes:

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  apiKey: factoryApiKey,
});
```

### Types

The SDK reuses `MachineType` from `@factory/common/daemon` and defines a simplified `SDKMachineConfig` that only includes the fields a caller needs to provide. Internal fields like `daemonWsUrl`, `providerType`, and `isManaged` are resolved by the SDK.

```ts
import { MachineType } from '@factory/common/daemon';

type SDKMachineConfig =
  | { type: MachineType.Ephemeral; sandboxId: string; workspaceId: string }
  | { type: MachineType.Computer; computerId: string };
```

Similarly, `sessionSource` uses the existing `SessionSource` discriminated union and `SessionPlatform` enum from `@factory/common/session`.

### Options

```ts
interface ConnectDaemonOptions {
  /** Machine to connect to. Omit for local daemon. */
  machine?: SDKMachineConfig;

  /** Direct WebSocket URL. Overrides machine-based URL resolution. */
  url?: string;

  /** Factory API key or WorkOS token for authentication. */
  apiKey?: string;
  token?: string;

  /** Connection retry budget. */
  maxRetries?: number;

  /** Path to `droid` CLI. Default: "droid". Only used for local daemon. */
  execPath?: string;

  /** Reconnection config. Sensible defaults applied. Set false to disable. */
  reconnect?:
    | false
    | {
        maxAttempts?: number;
        intervalMs?: number;
        backoffFactor?: number;
        maxDelayMs?: number;
      };
}
```

When `machine` is provided, the SDK resolves the WebSocket URL internally:

- `MachineType.Ephemeral` → `wss://{port}-{sandboxId}.e2b.app`
- `MachineType.Computer` → `wss://relay.factory.ai/v0/computer/{computerId}/client`

When `url` is provided, it overrides machine-based resolution. When neither is provided, the SDK spawns/discovers a local daemon.

| Scenario               | `machine`                                                 | `apiKey`   | Behavior                                             |
| :--------------------- | :-------------------------------------------------------- | :--------- | :--------------------------------------------------- |
| Local                  | —                                                         | —          | Spawn/discover local daemon, read stored credentials |
| Remote computer        | `{ type: MachineType.Computer, computerId }`              | —          | Resolve relay URL, read stored credentials           |
| Server-side (sandbox)  | `{ type: MachineType.Ephemeral, sandboxId, workspaceId }` | `'fk-...'` | Resolve sandbox URL, authenticate with API key       |
| Server-side (computer) | `{ type: MachineType.Computer, computerId }`              | `'fk-...'` | Resolve relay URL, authenticate with API key         |
| Direct URL (override)  | —                                                         | `'fk-...'` | Connect to `url`, authenticate with API key          |

---

## DaemonConnection

`connectDaemon()` returns a `DaemonConnection` — the entry point for all daemon operations.

```ts
interface DaemonConnection {
  /** Create a new session. */
  createSession(options?: DaemonSessionOptions): Promise<DaemonSession>;

  /** Resume an existing session by ID. */
  resumeSession(
    sessionId: string,
    options?: DaemonResumeOptions
  ): Promise<DaemonSession>;

  /** One-shot: create session, send prompt, return result, close session. */
  run(prompt: string, options?: DaemonRunOptions): Promise<DroidResult>;

  /** List sessions currently loaded in the daemon's memory. */
  listOpenedSessions(): Promise<OpenedSessionInfo[]>;

  /** List sessions saved on disk. Supports pagination. */
  listAvailableSessions(
    options?: ListAvailableSessionsOptions
  ): Promise<AvailableSessionsResult>;

  /** Interrupt a session by ID. */
  interruptSession(sessionId: string): Promise<void>;

  /** Connection lifecycle events. */
  on(event: 'connected', listener: () => void): this;
  on(event: 'disconnected', listener: (reason: string) => void): this;
  on(event: 'reconnecting', listener: (attempt: number) => void): this;

  /** Disconnect from the daemon. Does not kill the daemon process. */
  close(): Promise<void>;
}
```

---

## Session Options

```ts
interface DaemonSessionOptions {
  cwd?: string;
  modelId?: string;
  autonomyLevel?: AutonomyLevel;
  interactionMode?: DroidInteractionMode;
  reasoningEffort?: ReasoningEffort;
  specModeModelId?: string;
  specModeReasoningEffort?: ReasoningEffort;
  mcpServers?: DroidMcpServerConfig[];
  enabledToolIds?: string[];
  disabledToolIds?: string[];
  tags?: SessionTag[];
  permissionHandler?: PermissionHandler;
  askUserHandler?: AskUserHandler;

  /** Title for the session. */
  title?: string;

  /** Where this session was created from. Used for attribution. */
  sessionSource?: SessionSource;
}
```

Same core fields as exec mode's `CreateSessionOptions`, minus subprocess-specific options (`execPath`, `execArgs`, `env`, `transport`). Adds `title` and `sessionSource` for server-side attribution.

---

## Interactive Usage (Desktop, Web, CLI tools)

### One-shot run

```ts
const daemon = await connectDaemon();

const result = await daemon.run('What is 2 + 2?', { cwd: '/my/project' });
console.log(result.text);

await daemon.close();
```

Returns the same `DroidResult` as exec mode's `run()`.

### Multi-turn session with streaming

```ts
const daemon = await connectDaemon();
const session = await daemon.createSession({ cwd: '/my/project' });

for await (const msg of session.stream('Remember the word "mango".')) {
  // consume first turn
}

for await (const msg of session.stream('What word did I say?')) {
  if (msg.type === DroidMessageType.Assistant) {
    console.log(msg.text);
  }
}

await session.close();
await daemon.close();
```

### Resume session

```ts
const daemon = await connectDaemon();
const session = await daemon.resumeSession('existing-session-id');

for await (const msg of session.stream('Continue where we left off.')) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}

await session.close();
await daemon.close();
```

### Multiple sessions (one connection)

```ts
const daemon = await connectDaemon();

const frontend = await daemon.createSession({ cwd: '/apps/web' });
const backend = await daemon.createSession({ cwd: '/apps/api' });

const [a, b] = await Promise.all([
  collectStream(frontend.stream('Fix the failing React test')),
  collectStream(backend.stream('Add validation to the user endpoint')),
]);

await frontend.close();
await backend.close();
await daemon.close();
```

### Permission handler

```ts
const session = await daemon.createSession({
  cwd: '/my/project',
  permissionHandler(params) {
    const safe = params.toolUses.every(
      (t) => t.details.type === ToolConfirmationType.Create
    );
    return safe
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
  },
});
```

### Ask-user handler

```ts
const session = await daemon.createSession({
  cwd: '/my/project',
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

### SDK-backed MCP tools

```ts
const myTools = createSdkMcpServer({
  name: 'my-tools',
  tools: [
    tool(
      'lookup',
      'Look up a user',
      { name: z.string() },
      ({ name }) => `${name} is user #42.`
    ),
  ],
});

const session = await daemon.createSession({
  cwd: '/my/project',
  mcpServers: [myTools],
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});
```

---

## Headless Usage (Slack, Linear, CI, Automations)

The headless pattern is: connect, create session, send message, disconnect. The daemon runs the session autonomously. Responses flow through a separate channel (HTTP callbacks, webhooks, etc.) — the SDK consumer does not need to stream them.

### Fire-and-forget with `session.send()`

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  apiKey: factoryApiKey,
});

const session = await daemon.createSession({
  cwd: '/home/user/repo',
  autonomyLevel: AutonomyLevel.High,
  title: 'Slack delegation — fix tests',
  sessionSource: {
    platform: SessionPlatform.Slack,
    delegationSessionId: threadTs,
    teamId,
    channel,
  },
});

// Send the prompt and return immediately. No streaming.
await session.send('Fix the failing tests and open a PR.');

// Disconnect — the daemon keeps working on the session.
await daemon.close();
```

`session.send()` sends a user message and returns when the daemon acknowledges receipt. It does not wait for the turn to complete or stream any events.

### Follow-up message to an existing session

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  apiKey: factoryApiKey,
});

// Resume loads the session into the daemon's memory.
const session = await daemon.resumeSession(existingSessionId);

await session.send('Also add input validation to the user endpoint.');

await daemon.close();
```

### Interrupt a running session

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});

await daemon.interruptSession(sessionId);

await daemon.close();
```

### Slack delegation example (complete)

```ts
import {
  connectDaemon,
  AutonomyLevel,
  DroidInteractionMode,
  MachineType,
  SessionPlatform,
} from '@factory/droid-sdk';

async function handleSlackDelegation(params: {
  sandboxId: string;
  workspaceId: string;
  apiKey: string;
  cwd: string;
  prompt: string;
  threadTs: string;
  teamId: string;
  channel: string;
}) {
  const daemon = await connectDaemon({
    machine: {
      type: MachineType.Ephemeral,
      sandboxId: params.sandboxId,
      workspaceId: params.workspaceId,
    },
    apiKey: params.apiKey,
    reconnect: false,
  });

  try {
    const session = await daemon.createSession({
      cwd: params.cwd,
      interactionMode: DroidInteractionMode.Auto,
      autonomyLevel: AutonomyLevel.High,
      title: `Slack delegation`,
      sessionSource: {
        platform: SessionPlatform.Slack,
        delegationSessionId: params.threadTs,
        teamId: params.teamId,
        channel: params.channel,
      },
    });

    await session.send(params.prompt);
  } finally {
    await daemon.close();
  }
}
```

### Linear delegation example (complete)

```ts
async function handleLinearDelegation(params: {
  computerId: string;
  apiKey: string;
  cwd: string;
  prompt: string;
  agentSessionId: string;
  issueUrl: string;
  issueIdentifier: string;
}) {
  const daemon = await connectDaemon({
    machine: { type: MachineType.Computer, computerId: params.computerId },
    apiKey: params.apiKey,
    reconnect: false,
  });

  try {
    const session = await daemon.createSession({
      cwd: params.cwd,
      interactionMode: DroidInteractionMode.Auto,
      autonomyLevel: AutonomyLevel.High,
      title: `Linear — ${params.issueIdentifier}`,
      sessionSource: {
        platform: SessionPlatform.Linear,
        delegationSessionId: params.agentSessionId,
        issueUrl: params.issueUrl,
        issueIdentifier: params.issueIdentifier,
      },
    });

    await session.send(params.prompt);
  } finally {
    await daemon.close();
  }
}
```

### Backend REST API example

```ts
async function createSessionViaApi(params: {
  computerId: string;
  apiKey: string;
  cwd: string;
  prompt: string;
}) {
  const daemon = await connectDaemon({
    machine: { type: MachineType.Computer, computerId: params.computerId },
    apiKey: params.apiKey,
    reconnect: false,
  });

  try {
    const session = await daemon.createSession({
      cwd: params.cwd,
      autonomyLevel: AutonomyLevel.High,
    });

    await session.send(params.prompt);

    return { sessionId: session.sessionId };
  } finally {
    await daemon.close();
  }
}
```

---

## DaemonSession

```ts
interface DaemonSession {
  /** The session ID. */
  readonly sessionId: string;

  /** Send a prompt and stream message events until the turn completes. */
  stream(
    prompt: string,
    options?: MessageOptions
  ): AsyncGenerator<DroidStreamEvent>;

  /**
   * Send a prompt without streaming. Returns when the daemon acknowledges
   * receipt. The daemon continues working on the turn autonomously.
   */
  send(prompt: string, options?: SendOptions): Promise<void>;

  /** Interrupt the current turn. */
  interrupt(): Promise<void>;

  /** Close this session. Does not close the daemon connection. */
  close(): Promise<void>;

  /** Update session settings (model, autonomy, tools, etc.). */
  updateSettings(params: UpdateSettingsParams): Promise<void>;

  /** Enter spec mode. */
  enterSpecMode(params?: EnterSpecModeParams): Promise<void>;

  /** Fork this session. */
  forkSession(): Promise<{ newSessionId: string }>;

  /** Compact session history. */
  compactSession(params?: CompactParams): Promise<CompactResult>;

  /** Rename this session. */
  renameSession(params: { title: string }): Promise<void>;

  /** Get context window usage. */
  getContextStats(): Promise<ContextStats>;

  /** Rewind to a specific message. */
  getRewindInfo(params: { messageId: string }): Promise<RewindInfo>;
  executeRewind(params: ExecuteRewindParams): Promise<RewindResult>;

  /** List available skills. */
  listSkills(): Promise<ListSkillsResult>;

  /** List available tools. */
  listTools(): Promise<ListToolsResult>;

  /** MCP server management. */
  addMcpServer(params: AddMcpServerParams): Promise<void>;
  removeMcpServer(params: { name: string }): Promise<void>;
  toggleMcpServer(params: ToggleMcpServerParams): Promise<void>;
  listMcpServers(): Promise<ListMcpServersResult>;
  listMcpTools(): Promise<ListMcpToolsResult>;
  authenticateMcpServer(params: AuthMcpParams): Promise<void>;

  /** Subscribe to raw session notifications. */
  onNotification(
    callback: NotificationCallback,
    filter?: NotificationFilter
  ): () => void;

  /** Session lifecycle events. */
  on(event: 'inactive', listener: (reason: string) => void): this;
  on(event: 'closed', listener: () => void): this;
}
```

### `send()` vs `stream()`

|              | `stream()`                         | `send()`                                                  |
| ------------ | ---------------------------------- | --------------------------------------------------------- |
| Returns      | `AsyncGenerator<DroidStreamEvent>` | `Promise<void>`                                           |
| Blocks until | Turn completes                     | Daemon acknowledges receipt                               |
| Use when     | You need to observe the response   | Fire-and-forget (responses arrive via a separate channel) |
| Used by      | Desktop, Web, CLI, scripts         | Slack, Linear, CI, automations, REST API                  |

### `SendOptions`

```ts
interface SendOptions {
  /** Base64-encoded image attachments. */
  images?: Base64ImageSource[];

  /** Document/file attachments. */
  files?: DocumentSource[];

  /** Structured output request. */
  outputFormat?: OutputFormat;

  /** Message attribution source. */
  userMessageSource?: string;
}
```

---

## Streaming

Same `DroidStreamEvent` union and `DroidMessageType` discriminator as exec mode:

```ts
for await (const msg of session.stream('Explain recursion.')) {
  switch (msg.type) {
    case DroidMessageType.Assistant:
      console.log(msg.text);
      break;
    case DroidMessageType.ToolCall:
      console.log(`[Tool] ${msg.toolUse.name}`);
      break;
    case DroidMessageType.Result:
      console.log(`Done in ${msg.durationMs}ms`);
      break;
  }
}

// Token-level deltas
for await (const msg of session.stream('Explain recursion.', {
  includePartialMessages: true,
})) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

---

## Structured Output

```ts
const result = await daemon.run('Pick a number between 1 and 42.', {
  cwd: '/my/project',
  outputFormat: {
    type: OutputFormatType.JsonSchema,
    schema: {
      type: 'object',
      properties: { number: { type: 'number' } },
      required: ['number'],
    },
  },
});

console.log(result.structuredOutput?.number);
```

---

## Listing Sessions

### Opened sessions (in daemon memory)

```ts
const opened = await daemon.listOpenedSessions();

for (const s of opened) {
  console.log(`${s.sessionId} — ${s.workingState} — ${s.cwd}`);
}
```

### Available sessions (on disk, paginated)

```ts
const { sessions, hasMore } = await daemon.listAvailableSessions({
  limit: 20,
});

for (const s of sessions) {
  console.log(
    `${s.sessionId}: ${s.title ?? '(untitled)'} — ${s.messageCount} msgs`
  );
}
```

---

## Session Lifecycle Events

Daemon sessions can be closed externally (inactivity timeout, daemon restart, another client taking over):

```ts
session.on('inactive', (reason) => {
  console.log(`Session went inactive: ${reason}`);
  // Call daemon.resumeSession(session.sessionId) to reload it.
});

session.on('closed', () => {
  console.log('Session was closed by the daemon or another client.');
});
```

---

## Connection Events

```ts
daemon.on('disconnected', (reason) => {
  console.log(`Lost connection: ${reason}`);
});

daemon.on('reconnecting', (attempt) => {
  console.log(`Reconnecting (attempt ${attempt})...`);
});

daemon.on('connected', () => {
  console.log('Reconnected.');
});
```

Reconnection is automatic with exponential backoff (disable with `reconnect: false`). Sessions survive reconnection — the daemon keeps them alive server-side.

---

## Comparison: Exec vs Daemon

|                      | Exec mode                          | Daemon mode                              |
| -------------------- | ---------------------------------- | ---------------------------------------- |
| **Import**           | `run`, `createSession`             | `connectDaemon`                          |
| **Process model**    | One `droid exec` child per session | One daemon, many sessions                |
| **Connection**       | stdio                              | WebSocket                                |
| **Startup cost**     | Per session                        | Once (daemon spawn)                      |
| **Multi-session**    | Multiple subprocesses              | One connection                           |
| **Reconnect**        | Respawn process + `resumeSession`  | Automatic, sessions survive              |
| **Remote access**    | Not supported                      | Via relay (`computerId`) or direct URL   |
| **Fire-and-forget**  | Not supported                      | `session.send()`                         |
| **Server-side auth** | Not supported                      | `apiKey` option                          |
| **Session type**     | `DroidSession`                     | `DaemonSession`                          |
| **Stream events**    | Same `DroidStreamEvent`            | Same `DroidStreamEvent`                  |
| **Result type**      | `DroidResult`                      | `DroidResult`                            |
| **MCP tools**        | `createSdkMcpServer`               | `createSdkMcpServer`                     |
| **Local auth**       | Automatic (CLI handles it)         | Automatic (SDK reads stored credentials) |

### When to use which

- **Exec mode**: Simple scripts, one-shot tasks, CI jobs where you want process isolation.
- **Daemon mode**: Multi-session apps, long-running services, desktop/web integrations, remote computer access, server-side delegation (Slack, Linear, REST APIs).

---

## Complete Example: Interactive Multi-session Coordinator

```ts
import {
  connectDaemon,
  DroidMessageType,
  AutonomyLevel,
  ToolConfirmationOutcome,
} from '@factory/droid-sdk';

const daemon = await connectDaemon();

const api = await daemon.createSession({
  cwd: '/myapp/packages/api',
  autonomyLevel: AutonomyLevel.High,
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});

const web = await daemon.createSession({
  cwd: '/myapp/packages/web',
  autonomyLevel: AutonomyLevel.High,
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});

async function collectResult(session, prompt) {
  let text = '';
  for await (const msg of session.stream(prompt)) {
    if (msg.type === DroidMessageType.Assistant) text += msg.text;
  }
  return text;
}

const [apiResult, webResult] = await Promise.all([
  collectResult(api, 'Add rate limiting to /users.'),
  collectResult(web, 'Add a loading spinner to the user list.'),
]);

console.log('API:', apiResult);
console.log('Web:', webResult);

await api.close();
await web.close();
await daemon.close();
```

## Complete Example: Headless Delegation Service

```ts
import {
  connectDaemon,
  AutonomyLevel,
  DroidInteractionMode,
  type SDKMachineConfig,
  type SessionSource,
} from '@factory/droid-sdk';

// Called from a webhook handler (Slack, Linear, etc.)
async function delegateTask(params: {
  machine: SDKMachineConfig;
  apiKey: string;
  cwd: string;
  prompt: string;
  source: SessionSource;
}) {
  const daemon = await connectDaemon({
    machine: params.machine,
    apiKey: params.apiKey,
    reconnect: false,
  });

  try {
    const session = await daemon.createSession({
      cwd: params.cwd,
      interactionMode: DroidInteractionMode.Auto,
      autonomyLevel: AutonomyLevel.High,
      sessionSource: params.source,
    });

    await session.send(params.prompt);
    return session.sessionId;
  } finally {
    await daemon.close();
  }
}
```

---

## Appendix: Consumer-by-consumer Migration Breakdown

This section maps every daemon consumer in `factory-mono-alpha` to the proposed SDK API, showing the exact before/after code and identifying gaps.

### `ConnectDaemonOptions` with `SDKMachineConfig`

Uses the same types defined in the main body above (`SDKMachineConfig` with `MachineType` enum from `@factory/common/daemon`). See the [Types](#types) and [Options](#options) sections for the full interface definition.

---

### 1. Slack Integration

#### New workspace session

**Before:**

```ts
const { value: factoryApiKey } = await createFactoryApiKey({
  name: `slack-delegation-${Date.now()}`, userId, firestoreOrgId, expiresAt: ...
});
const authCredential = { apiKey: factoryApiKey };
const sandboxId = await createSandboxForWorkspace({ workspaceId, userId, firestoreOrgId });
const daemonClient = await createConnectedDaemonClient({
  machineConfig: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  authCredential, firestoreOrgId, userId, maxRetries,
});
await createSessionInternal({ firestoreOrgId, userId, authCredential, daemonClient,
  machineConfig: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  title, sessionLocation: SessionCreatedLocation.SlackThreadDelegation,
  sessionSource: { platform: SessionPlatform.Slack, delegationSessionId: threadTs,
    teamId, channel, threadTs, userId: slackUserId },
  sessionSettings: { interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High, model },
});
await addMessageInternal({ sessionId, daemonClient, authCredential,
  text: enrichedPrompt, platformSource });
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  apiKey: factoryApiKey,
  maxRetries: SLACK_DELEGATION_MAX_RETRIES,
});
try {
  const session = await daemon.createSession({
    cwd: repoRootPath,
    interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High,
    modelId: model,
    title: sessionTitle,
    sessionSource: {
      platform: SessionPlatform.Slack,
      delegationSessionId: threadTs,
      teamId,
      channel,
      threadTs,
    },
  });
  await session.send(enrichedPrompt);
} finally {
  await daemon.close();
}
```

#### New computer session

**Before:**

```ts
const { computer, daemonClient, daemonWsUrl, authCredential, isManaged } =
  await connectToComputerDaemon({ firestoreOrgId, computerId, userId, maxRetries });
await createSessionInternal({ ...,
  machineConfig: { type: MachineType.Computer, computerId, daemonWsUrl,
    providerType: computer.provider.type, isManaged }, ... });
await addMessageInternal({ sessionId, daemonClient, authCredential, text: enrichedPrompt });
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
  maxRetries,
});
try {
  const session = await daemon.createSession({
    cwd: '~',
    interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High,
    title: sessionTitle,
    sessionSource: {
      platform: SessionPlatform.Slack,
      delegationSessionId: threadTs,
      teamId,
      channel,
      threadTs,
    },
  });
  await session.send(enrichedPrompt);
} finally {
  await daemon.close();
}
```

#### Follow-up to workspace session

**Before:**

```ts
const provider = getCdeProvider(workspace);
const isRunning = await provider.isRunning(sandboxId);
if (!isRunning) { /* resume or recreate sandbox */ }
const daemonClient = await createConnectedDaemonClient({
  machineConfig: { type: MachineType.Ephemeral, sandboxId, workspaceId }, ...
});
await addMessageInternal({ sessionId, daemonClient, authCredential,
  text: message, loadSessionFirst: true });
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.resumeSession(sessionId);
  await session.send(message);
} finally {
  await daemon.close();
}
```

#### Follow-up to computer session

**Before:**

```ts
const { daemonClient, authCredential } = await connectToComputerDaemon({
  firestoreOrgId,
  computerId,
  userId,
});
await addMessageInternal({
  sessionId,
  daemonClient,
  authCredential,
  text: message,
  loadSessionFirst: true,
});
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.resumeSession(sessionId);
  await session.send(message);
} finally {
  await daemon.close();
}
```

#### Stop computer session

**Before:**

```ts
const { daemonClient } = await connectToComputerDaemon({
  firestoreOrgId,
  computerId,
  userId,
});
await daemonClient.interruptSession({ sessionId: session.id });
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  await daemon.interruptSession(sessionId);
} finally {
  await daemon.close();
}
```

#### AskUser direct response

**Before:**

```ts
const { daemonClient } = await connectToComputerDaemon({ ... });
const loadResult = await daemonClient.loadSession({ sessionId, token });
const pending = loadResult.pendingAskUserRequests?.find(
  r => r.toolCallId === toolCallId
);
daemonClient.sendAskUserResponse(pending.requestId, {
  sessionId, cancelled: false, answers
});
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.resumeSession(sessionId);
  const pending = await session.getPendingAskUserRequests();
  const match = pending.find((r) => r.toolCallId === toolCallId);
  await session.respondToAskUser(match.requestId, {
    cancelled: false,
    answers,
  });
} finally {
  await daemon.close();
}
```

**Verdict: Full replacement (6/6 workflows).** Requires `getPendingAskUserRequests()` and `respondToAskUser()` on `DaemonSession`.

---

### 2. Linear Integration

#### New workspace session

**Before:** Identical pattern to Slack workspace — `createConnectedDaemonClient` → `createSessionInternal` → `addMessageInternal` → `disconnect`.

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Ephemeral, sandboxId, workspaceId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.createSession({
    cwd: repoRootPath,
    interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High,
    title: `Linear — ${issueIdentifier}: ${issueTitle}`,
    sessionSource: {
      platform: SessionPlatform.Linear,
      delegationSessionId: agentSessionId,
      agentSessionId,
      issueUrl,
      issueIdentifier,
      organizationId,
    },
  });
  await session.send(enrichedPrompt);
} finally {
  await daemon.close();
}
```

#### New computer session

**Before:** Delegates to shared `createHeadlessComputerSession`.

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.createSession({
    cwd: '~',
    interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High,
    title: `Linear — ${issueIdentifier}`,
    sessionSource: {
      platform: SessionPlatform.Linear,
      delegationSessionId: agentSessionId,
      issueUrl,
      issueIdentifier,
    },
  });
  await session.send(enrichedPrompt);
} finally {
  await daemon.close();
}
```

#### Follow-up message

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.resumeSession(sessionId);
  await session.send(followUpPrompt);
} finally {
  await daemon.close();
}
```

#### Stop computer session

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  await daemon.interruptSession(sessionId);
} finally {
  await daemon.close();
}
```

#### Stop workspace session

N/A — kills process directly via sandbox shell command (`kill -SIGTERM`), not a daemon call. Stays outside the SDK.

**Verdict: Full replacement** for all daemon-backed workflows.

---

### 3. Backend REST API (v0)

| Endpoint                          | Current                                               | SDK                              | Gap?                               |
| :-------------------------------- | :---------------------------------------------------- | :------------------------------- | :--------------------------------- |
| `POST /sessions`                  | `connectToComputerDaemon` → `createSessionInternal`   | `daemon.createSession()`         | No                                 |
| `GET /sessions`                   | `connectToComputerDaemon` → `listAvailableSessions`   | `daemon.listAvailableSessions()` | No                                 |
| `GET /sessions/:id`               | `connectToComputerDaemon` → `loadSession` → read data | `daemon.resumeSession()`         | **Partial** — need raw load result |
| `DELETE /sessions/:id`            | `connectToComputerDaemon` → `archiveSession`          | Not in SDK                       | **Gap**                            |
| `PATCH /sessions/:id`             | `loadSession` → `updateSessionSettings`               | `session.updateSettings()`       | No                                 |
| `GET /sessions/:id/messages`      | `getSessionMessages`                                  | Not in SDK                       | **Gap**                            |
| `POST /sessions/:id/messages`     | `loadSession` → `addUserMessage`                      | `session.send()`                 | No                                 |
| `GET /sessions/:id/messages/:mid` | `getSessionMessages` (scan)                           | Not in SDK                       | **Gap**                            |
| `POST /sessions/:id/interrupt`    | `loadSession` → `interruptSession`                    | `daemon.interruptSession()`      | No                                 |

All REST API endpoints connect to computers only. Example with SDK:

```ts
// POST /sessions — create
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey,
});
try {
  const session = await daemon.createSession({
    cwd,
    sessionSettings,
    sessionSource: {
      platform: SessionPlatform.SessionsApi,
      delegationSessionId: computerId,
    },
  });
  return { sessionId: session.sessionId };
} finally {
  await daemon.close();
}

// POST /sessions/:id/messages — send message
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey,
});
try {
  const session = await daemon.resumeSession(sessionId);
  await session.send(text, { images, files });
  return { messageId, status: 'pending' };
} finally {
  await daemon.close();
}

// POST /sessions/:id/interrupt
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey,
});
try {
  await daemon.interruptSession(sessionId);
} finally {
  await daemon.close();
}
```

**Verdict: Partial replacement (5/9 endpoints).** Gaps are `archiveSession` and `getSessionMessages` — CRUD utilities that could be added to `DaemonConnection`.

---

### 4. Automation Workflows

**Before:**

```ts
const { daemonClient, authCredential, isManaged } = await connectToComputerDaemon({
  firestoreOrgId, computerId, userId
});
await createSessionInternal({ ...,
  machineConfig: { type: MachineType.Computer, computerId, daemonWsUrl,
    providerType, isManaged },
  sessionSource: { platform: SessionPlatform.Automation, automationId, computerId },
  tags: automationTags, enabledToolIds: [],
  sessionSettings: { interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High },
});
await addMessageInternal({ sessionId, daemonClient, authCredential,
  text: automationPrompt });
daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.createSession({
    cwd: '~',
    interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High,
    title: `Automation: ${automationName}`,
    sessionSource: {
      platform: SessionPlatform.Automation,
      automationId,
      computerId,
    },
    tags: automationTags,
    enabledToolIds: [],
  });
  await session.send(automationPrompt);
} finally {
  await daemon.close();
}
```

**Verdict: Full replacement.** No gaps.

---

### 5. Computer Provisioning (install-deps)

**Before:**

```ts
const connection = await connectToComputerDaemon({
  firestoreOrgId, computerId, userId, workosOrgId
});
await createSessionInternal({ ...,
  machineConfig: { type: MachineType.Computer, ... },
  sessionLocation: SessionCreatedLocation.ComputerSetup,
  sessionSource: { platform: SessionPlatform.Api, delegationSessionId: computerId },
});
await addMessageInternal({ sessionId, daemonClient, authCredential,
  text: INSTALL_DEPS_PROMPT });
connection.daemonClient.disconnect();
```

**After:**

```ts
const daemon = await connectDaemon({
  machine: { type: MachineType.Computer, computerId },
  apiKey: factoryApiKey,
});
try {
  const session = await daemon.createSession({
    cwd: '~',
    interactionMode: DroidInteractionMode.Auto,
    autonomyLevel: AutonomyLevel.High,
    sessionSource: {
      platform: SessionPlatform.Api,
      delegationSessionId: computerId,
    },
  });
  await session.send(INSTALL_DEPS_PROMPT);
  return session.sessionId;
} finally {
  await daemon.close();
}
```

**Verdict: Full replacement.** No gaps.

---

### 6. Desktop/Web Frontend

**Not a replacement target.** The frontend uses `DaemonSessionController` with 32+ methods, 30+ event subscriptions, multi-session state management across multiple machines, permission buffering/replay, optimistic UI updates, terminal multiplexing, and git operations. The SDK is a simplified programmatic layer — the frontend would continue using `DaemonSessionController` directly.

---

### 7. CLI TUI

**Not a replacement target.** The TUI uses `InProcessDaemonClient` (no WebSocket — daemon logic runs in the CLI process), `TuiDaemonAdapter` with 40+ methods, worker/squad session spawning, mission orchestration, and loop control. The SDK doesn't cover these specialized features, and the in-process transport model is fundamentally different.

---

### Summary

| Consumer                  | Can SDK replace?           | Gaps                                                       |
| :------------------------ | :------------------------- | :--------------------------------------------------------- |
| **Slack**                 | Yes (6/6 workflows)        | Needs `getPendingAskUserRequests()` + `respondToAskUser()` |
| **Linear**                | Yes (all daemon workflows) | None (sandbox kill stays outside SDK)                      |
| **Automation workflows**  | Yes (fully)                | None                                                       |
| **Computer provisioning** | Yes (fully)                | None                                                       |
| **Backend REST API**      | Partial (5/9 endpoints)    | Needs `archiveSession`, `getSessionMessages`               |
| **Desktop/Web**           | No                         | Not a target — continues using `DaemonSessionController`   |
| **CLI TUI**               | No                         | Not a target — continues using `TuiDaemonAdapter`          |
