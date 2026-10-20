# Migration Guide

## Migrating from 0.9.x to 0.10.0

### 1. Upgrade the package

```bash
npm install @factory/droid-sdk@^0.10.0
```

Applications that use only `run()`, `createSession()`, `resumeSession()`, or
`connectToDaemon()` with built-in transports need no transport changes.

Version 0.10.0 fails at import on Node.js 18 with
`globalThis.crypto.getRandomValues is not available`. Upgrade to Node.js 20 or
later, or start Node.js 18 with `--experimental-global-webcrypto`.

### 2. Update custom Node transports

- `DroidClientOptions.transport` and the `transport` session option now require
  a `DroidClientTransport`. Its `send` and `onMessage` methods exchange
  `JsonRpcMessage` objects instead of strings.
- `ProcessTransport` owns its stdio JSON codec. Direct callers of its `send` and
  `onMessage` methods must pass and receive objects.
- To keep an existing `StringFramedDroidClientTransport`, wrap it with
  `withJsonRpcCodec()` from `@factory/droid-sdk/node`. Do not wrap a transport
  that already exchanges objects.

```ts
import { createSession, withJsonRpcCodec } from '@factory/droid-sdk/node';

const session = await createSession({
  transport: withJsonRpcCodec(stringTransport),
});
```

### 3. Update daemon client transports

- Replace `DaemonClient.onMessage` with `DaemonClient.onTransportMessage`, and
  remove `JSON.parse` from those handlers.
- Custom `DaemonClientTransport.send` implementations and `message` listeners
  now exchange `JsonRpcMessage` objects. Encode and decode messages inside
  transports that cross a serialized boundary.

The wire format between the SDK, the CLI, and the daemon does not change.

### 4. Handle Script permission requests

Current CLI releases can batch several tool calls into one permission request
with `ToolConfirmationType.Script`. Inspect each entry in `details.calls` and
approve the request only when every call is allowed:

```ts
const confirmations = request.toolUses.flatMap((use) =>
  use.details.type === ToolConfirmationType.Script
    ? use.details.calls.map((call) => call.confirmation)
    : [use.details]
);
```

A handler that checks only the top-level `details.type` cancels these requests.

### 5. Verify the migration

```bash
npm run typecheck
npm run lint
npm run format:check
npx tsx examples/node/list-sessions.ts
```

## Migrating from 0.6.0 to 0.7.0

### 1. Upgrade the package

```bash
npm install @factory/droid-sdk@^0.7.0
```

### 2. Use the Node entrypoint for local Droid sessions

The package root is now browser-safe. APIs that spawn the Droid CLI, access the
filesystem, or create local sessions moved to `@factory/droid-sdk/node`.

Before:

<!-- snippet-skip -->

```ts
import { DroidMessageType, createSession, run } from '@factory/droid-sdk';
```

After:

```ts
import { DroidMessageType, createSession, run } from '@factory/droid-sdk/node';
```

The Node entrypoint re-exports the browser-safe root surface, so Node
applications can use one import path for the complete SDK.

Keep importing daemon WebSocket clients, schemas, and protocol types from the
root when the code must run in a browser:

```ts
import {
  ClientUiSurface,
  MachineType,
  createWebSocketDaemonClient,
} from '@factory/droid-sdk';
```

Do not import `@factory/droid-sdk/node` into browser bundles.

### 3. Update example paths

Node examples moved from `examples/*.ts` to `examples/node/*.ts`. Browser
daemon examples live under `examples/browser/`.

```bash
npx tsx examples/node/run.ts
npx tsx examples/node/session-stream.ts
```

Browser examples must be bundled with `platform: 'browser'` and loaded from a
page. They do not rely on Node globals such as `process`.

### 4. Update low-level client integrations

Applications using only `run()`, `createSession()`, or `resumeSession()` usually
need only the import-path change. Applications that construct `DroidClient`,
`ProcessTransport`, or a custom transport must also migrate the following:

- RPC methods now return complete JSON-RPC response envelopes. Read successful
  payloads from `response.result`.
- Custom transports implement `StringFramedDroidClientTransport` and exchange
  newline-delimited JSON-RPC strings instead of object-framed messages.
- Rename `DroidClientOptions.defaultTimeout` to `requestTimeout`.
- Rename `ProcessTransport` option `execPath` to `droidExecPath`.
- Rename `ProcessTransport` option `execArgs` to `droidExecExtraArgs`.
- Remove uses of the retired `gracePeriod` and `spawnRetry` transport options.
- Direct `DroidClient` permission and ask-user handlers now receive complete
  request events. High-level session handlers continue to receive request
  parameters.
- Treat failed writes as `ProtocolError`. Unexpected subprocess exits now
  propagate `ProcessExitError` directly.
- Expect incoming session notifications to be validated as complete
  notification envelopes.

The following exports were removed:

- `ProtocolEngine`
- `dispatchNotification`
- `DroidClientTransport`
- `TransportMessage`
- `MessageCallback`
- `ErrorCallback`
- `PermissionHandler`
- `AskUserHandler`
- `NotificationCallback`
- `NotificationFilter`
- `NotificationListener`

Use `DroidClient`, the current handler types, and
`StringFramedDroidClientTransport` instead.

### 5. Verify the migration

```bash
npm run typecheck
npm run lint
npm run format:check
```

For a runtime check that does not create an agent session:

```bash
npx tsx examples/node/list-sessions.ts
```
