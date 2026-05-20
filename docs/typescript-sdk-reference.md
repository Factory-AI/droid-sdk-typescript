# Droid SDK reference - TypeScript

> Public API reference for `@factory/droid-sdk`, the TypeScript SDK for the Factory Droid CLI.

## Documentation Index

Use these pages together:

- API reference: `docs/typescript-sdk-reference.md`
- Example walkthroughs: `docs/examples/`
- Source exports: [`src/index.ts`](../src/index.ts)
- Runnable repo examples: [`examples/`](../examples)

## Installation

```bash
npm install @factory/droid-sdk
```

## Requirements

- Node.js `18+`
- The `droid` CLI installed and available on your `PATH`

## What this SDK provides

The SDK wraps `droid exec` as a subprocess and exposes two main prompt patterns:

- `run()` for one-shot prompt/response flows that return an aggregated result
- `createSession()` / `resumeSession()` with `session.stream()` for streamed multi-turn sessions

It also includes:

- streaming message events
- structured output with JSON Schema
- permission and ask-user handlers
- SDK-backed in-process MCP tools
- MCP server management
- spec mode controls
- tool allow/deny controls
- session utilities such as rename, fork, compact, and rewind
- local session discovery with `listSessions()`
- low-level access via `ProcessTransport`, `ProtocolEngine`, and `DroidClient`

## Example walkthroughs

For copy-pasteable walkthroughs and complete scripts, see:

- [One-shot run](./examples/run.md)
- [Session streaming](./examples/session-stream.md)
- [Multi-turn session](./examples/multi-turn-session.md)
- [Permission handler](./examples/permission-handler.md)
- [Initialization metadata](./examples/init-metadata.md)
- [Spec mode approval flow](./examples/spec-mode.md)
- [Tool controls](./examples/tool-controls.md)
- [List saved sessions](./examples/list-sessions.md)

## Functions

### `run()`

Creates a session, sends one message, consumes the turn, closes the session, and returns an aggregated `DroidResult`.

```ts
function run(prompt: string, options?: RunOptions): Promise<DroidResult>;
```

`RunOptions` combines `CreateSessionOptions` and `MessageOptions`, so it accepts session setup fields such as `cwd`, `execPath`, `modelId`, `mcpServers`, handlers, and tool overrides, plus message fields such as `images`, `files`, `outputFormat`, and `abortSignal`.

### `createSession()`

Creates a persistent `DroidSession` for multi-turn conversations.

```ts
function createSession(options?: CreateSessionOptions): Promise<DroidSession>;
```

### `resumeSession()`

Reconnects to an existing session by ID. The resumed session always runs in the
working directory persisted with the session; `ResumeSessionOptions` does not
accept `cwd`. To run in a different directory, create a new session or fork the
existing one.

```ts
function resumeSession(
  sessionId: string,
  options?: ResumeSessionOptions
): Promise<DroidSession>;
```

### `listSessions()`

Discovers saved sessions directly from `~/.factory/sessions/` without spawning `droid`.

```ts
function listSessions(
  options?: ListSessionsOptions
): Promise<SessionMetadata[]>;
```

#### `ListSessionsOptions`

| Field             | Type      | Description                                                       |
| :---------------- | :-------- | :---------------------------------------------------------------- |
| `cwd`             | `string`  | Scope results to a project directory. Defaults to `process.cwd()` |
| `fetchOutsideCWD` | `boolean` | Return sessions across all projects                               |
| `numSessions`     | `number`  | Maximum number of sessions to return                              |
| `sessionsDir`     | `string`  | Override the session storage root                                 |

#### Returned `SessionMetadata`

Common fields include:

- `id`
- `title`
- `sessionTitle`
- `owner`
- `messageCount`
- `modifiedTime`
- `createdTime`
- `isFavorite`
- `cwd`
- `decompSessionType`
- `decompMissionId`

Archived sessions are excluded automatically, and results are sorted by `modifiedTime` descending.

### `createSdkMcpServer()` and `tool()`

Creates an SDK-managed, in-process MCP server that can be passed in `mcpServers` at session creation.

```ts
function createSdkMcpServer(options: SdkMcpServerOptions): SdkMcpServer;

function tool(
  name: string,
  description: string,
  handler: DroidTool['handler']
): DroidTool;

function tool<InputShape extends Record<string, z.ZodTypeAny>>(
  name: string,
  description: string,
  inputSchema: InputShape,
  handler: (
    input: z.infer<z.ZodObject<InputShape>>
  ) => DroidToolResult | Promise<DroidToolResult>
): DroidTool;
```

`tool()` accepts either an untyped handler or a Zod object shape for typed input validation. Tool handlers can return plain text or a Model Context Protocol `CallToolResult`.

## `DroidSession`

Returned by `createSession()` and `resumeSession()`.

### Core methods

| Method                     | Description                                        |
| :------------------------- | :------------------------------------------------- |
| `stream(prompt, options?)` | Yields `DroidMessage` events until `turn_complete` |
| `interrupt()`              | Gracefully interrupts the current turn             |
| `close()`                  | Closes the underlying connection                   |
| `updateSettings(params)`   | Updates model/session settings                     |
| `enterSpecMode(params?)`   | Switches the current session into spec mode        |

### Session utilities

| Method                    | Description                                            |
| :------------------------ | :----------------------------------------------------- |
| `forkSession()`           | Creates a new server-side session from the current one |
| `renameSession(params)`   | Renames the current session                            |
| `compactSession(params?)` | Requests server-side compaction                        |
| `getContextStats()`       | Reads current context window utilization               |
| `getRewindInfo(params)`   | Fetches rewind metadata                                |
| `executeRewind(params)`   | Executes a rewind                                      |

### MCP and discovery helpers

| Method                              | Description                                              |
| :---------------------------------- | :------------------------------------------------------- |
| `addMcpServer(params)`              | Adds an MCP server                                       |
| `removeMcpServer(params)`           | Removes an MCP server                                    |
| `toggleMcpServer(params)`           | Enables or disables a server                             |
| `listMcpServers()`                  | Lists configured MCP servers                             |
| `listMcpTools()`                    | Lists tools exposed by connected MCP servers             |
| `authenticateMcpServer(params)`     | Starts MCP OAuth/authentication flow                     |
| `listSkills()`                      | Lists available skills                                   |
| `listTools(params?)`                | Lists the exec tool catalog and current allow/deny state |
| `onNotification(callback, filter?)` | Subscribes to raw session notifications                  |

### Properties

| Property     | Type                                           | Description                 |
| :----------- | :--------------------------------------------- | :-------------------------- |
| `sessionId`  | `string`                                       | Active session ID           |
| `initResult` | `InitializeSessionResult \| LoadSessionResult` | Raw initialize/load payload |

### Message attachments

`session.stream(prompt, options?)` accepts `MessageOptions`:

| Field          | Type                  | Description                                      |
| :------------- | :-------------------- | :----------------------------------------------- |
| `images`       | `Base64ImageSource[]` | Inline image attachments                         |
| `files`        | `DocumentSource[]`    | Inline file/document attachments                 |
| `outputFormat` | `OutputFormat`        | Structured output request                        |
| `abortSignal`  | `AbortSignal`         | External cancellation signal for the active turn |

`run()` accepts the same message options.

### Structured output

Structured output is requested with `OutputFormatType.JsonSchema`:

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

Structured output is parsed into `DroidResult.structuredOutput` when the turn returns valid JSON matching the requested object shape.

### `DroidResult`

Returned by `run()`:

| Field              | Type                       | Description                                      |
| :----------------- | :------------------------- | :----------------------------------------------- |
| `sessionId`        | `string`                   | Session that produced the result                 |
| `text`             | `string`                   | Concatenated assistant text                      |
| `messages`         | `DroidMessage[]`           | All stream messages from the turn                |
| `tokenUsage`       | `TokenUsageUpdate \| null` | Final token usage if available                   |
| `durationMs`       | `number`                   | Wall-clock duration spent consuming the turn     |
| `turnCount`        | `number`                   | Number of completed turns observed in the stream |
| `error`            | `ErrorEvent \| null`       | First Droid error event, if any                  |
| `structuredOutput` | `JsonObject \| null`       | Parsed structured JSON object, if requested      |
| `success`          | `boolean`                  | `true` when no Droid error event was emitted     |

## Stream message model

All streamed events are part of the `DroidMessage` union and are discriminated by `type`.

### Common message types

| Type                    | Description                                 |
| :---------------------- | :------------------------------------------ |
| `assistant_text_delta`  | Assistant text token                        |
| `thinking_text_delta`   | Thinking/reasoning token                    |
| `tool_use`              | Tool invocation                             |
| `tool_result`           | Tool result                                 |
| `tool_progress`         | Tool progress update                        |
| `working_state_changed` | Agent state transition                      |
| `token_usage_update`    | Token counter update                        |
| `create_message`        | Full assistant message                      |
| `permission_resolved`   | Permission outcome                          |
| `settings_updated`      | Session settings changed                    |
| `session_title_updated` | Session title changed                       |
| `mcp_status_changed`    | MCP status changed                          |
| `mcp_auth_required`     | MCP authentication required                 |
| `mcp_auth_completed`    | MCP authentication completed                |
| `error`                 | Error from the process                      |
| `turn_complete`         | End-of-turn sentinel synthesized by the SDK |

### Mission and AGI messages

When running in `DroidInteractionMode.AGI`, the stream can also emit:

- `mission_state_changed`
- `mission_features_changed`
- `mission_progress_entry`
- `mission_heartbeat`
- `mission_worker_started`
- `mission_worker_completed`

## Configuration and enums

High-value exported enums include:

- `DroidInteractionMode`
- `AutonomyLevel`
- `ReasoningEffort`
- `OutputFormatType`
- `ToolConfirmationOutcome`
- `ToolConfirmationType`
- `SessionNotificationType`
- `DroidWorkingState`
- `McpServerType`
- `McpServerStatus`
- `McpAuthOutcome`
- `MissionState`
- `FeatureStatus`
- `SettingsLevel`
- `SkillLocation`

### Common `CreateSessionOptions`

`CreateSessionOptions` supports the main runtime controls:

| Field                           | Description                                        |
| :------------------------------ | :------------------------------------------------- |
| `cwd`                           | Working directory                                  |
| `machineId`                     | Machine identifier passed during initialization    |
| `modelId`                       | Default model                                      |
| `autonomyLevel`                 | Command autonomy level                             |
| `interactionMode`               | `Auto`, `Spec`, or `AGI`                           |
| `reasoningEffort`               | LLM reasoning depth                                |
| `specModeModelId`               | Spec-mode model override                           |
| `specModeReasoningEffort`       | Spec-mode reasoning override                       |
| `mcpServers`                    | Initial MCP server configs                         |
| `enabledToolIds`                | Explicit tool allowlist                            |
| `disabledToolIds`               | Explicit tool denylist                             |
| `tags`                          | Session tags; the SDK also appends its own SDK tag |
| `permissionHandler`             | Tool confirmation callback                         |
| `askUserHandler`                | Structured user-input callback                     |
| `transport`                     | Custom transport override                          |
| `execPath` / `execArgs` / `env` | Subprocess configuration                           |
| `abortSignal`                   | External cancellation signal                       |

## Permission and ask-user handling

The high-level APIs support:

- `permissionHandler` for tool approval decisions
- `askUserHandler` for structured clarification flows

For spec mode, approval flows also support fresh-session outcomes such as `ToolConfirmationOutcome.ProceedNewSessionHigh`.

## MCP support

The SDK supports:

- SDK-backed in-process MCP servers with `createSdkMcpServer()` and `tool()`
- configuring MCP servers at session startup
- adding/removing/toggling servers during a session
- listing MCP servers and tools
- starting authentication flows with `authenticateMcpServer()`
- receiving `mcp_auth_required` and `mcp_auth_completed` stream events

Advanced auth controls such as cancelling or clearing MCP auth are available on the low-level `DroidClient`.

## Low-level APIs

Most users should use `run()` and `DroidSession`, but the package also exports lower layers.

### `ProcessTransport`

Spawns `droid exec --input-format stream-jsonrpc --output-format stream-jsonrpc` and implements the transport interface used by the client.

### `ProtocolEngine`

Handles JSON-RPC framing, request/response correlation, notifications, permission requests, and ask-user requests.

### `DroidClient`

Low-level typed JSON-RPC client. Use it when you need direct RPC access beyond `DroidSession`.

Notable client-only capabilities include:

- `killWorkerSession()`
- `cancelMcpAuth()`
- `clearMcpAuth()`
- `submitMcpAuthCode()`
- `listMcpRegistry()`
- `toggleMcpTool()`
- `submitBugReport()`

## Runtime validation and schemas

The package exports its Zod schema surface from `src/schemas/index.ts`, including:

- request and response schemas
- notification schemas
- enum schemas and constants
- message/content schemas
- mission schemas
- MCP schemas

This makes it possible to validate protocol payloads at runtime in advanced integrations.

## Errors

The SDK exports these custom errors:

| Error                  | Description                               |
| :--------------------- | :---------------------------------------- |
| `ConnectionError`      | Failed to connect to the Droid subprocess |
| `ProtocolError`        | JSON-RPC or protocol-level failure        |
| `SessionError`         | Base session error                        |
| `SessionNotFoundError` | Requested session does not exist          |
| `TimeoutError`         | RPC timed out                             |
| `ProcessExitError`     | The subprocess exited unexpectedly        |

## Feature coverage in this document

This reference intentionally documents only features confirmed in the current SDK implementation and recent shipped commits, including:

- one-shot `run()`
- structured output
- SDK-backed MCP tools
- spec mode controls
- tool controls
- initialization metadata
- session forking
- filesystem-based session discovery
- rename, compact, rewind, and MCP/session management APIs
