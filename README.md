# @factory/droid-sdk

The Factory TypeScript SDK lets applications run Droid, continue conversations,
stream work, control tools, and connect to a running Droid daemon.

## Installation

```bash
npm install @factory/droid-sdk
```

The SDK requires Node.js 18 or later.

## Entrypoints

| Import                    | Runtime         | Purpose                                                                                   |
| ------------------------- | --------------- | ----------------------------------------------------------------------------------------- |
| `@factory/droid-sdk/node` | Node            | Start Droid subprocesses, run prompts, manage local sessions, and define SDK MCP tools    |
| `@factory/droid-sdk`      | Browser or Node | Connect to an existing Droid daemon and use browser-safe schemas, types, and REST helpers |

By default, Node session APIs start the `droid` CLI from `PATH` and read
`FACTORY_API_KEY`. A custom executable, API key, or transport can be supplied
through session options.

## Quick start

```ts
import { run } from '@factory/droid-sdk/node';

const result = await run('Summarize this repository.');

if (!result.success) {
  throw new Error(result.error?.message ?? 'The run did not complete.');
}

console.log(result.text);
```

Use `createSession()` for multi-turn Node conversations. Use
`connectToDaemon()` from the root entrypoint to manage sessions through an
existing daemon.

## Documentation

The [TypeScript SDK reference](./docs/typescript-sdk-reference.md) is the
single user-facing guide to:

- Node and daemon runtimes
- Runs, sessions, streaming, attachments, and structured output
- Permissions, AskUser, tools, skills, MCP, and hooks
- Session replacement and cleanup behavior
- Browser and daemon integration
- Observability, REST helpers, advanced resources, and the public API

Runnable examples are available under [`examples/node`](./examples/node) and
[`examples/browser`](./examples/browser).

Run Node examples with `npx tsx examples/node/<file>.ts`. To connect a Node
application to a running daemon with an API key, run
`FACTORY_API_KEY=... npx tsx examples/node/daemon-session.ts`.
To start a mission with orchestrator and worker progress, run
`npx tsx examples/node/mission.ts`.

For browser examples, start a local daemon and run
`npm run serve:browser-example`, then open `http://127.0.0.1:8420/`. The
launcher accepts the daemon URL, API key, and working directory as page inputs
instead of requiring source edits or environment-injected credentials.

## Browser security

The daemon client currently authenticates with a Factory API key. Browser
integration is intended for trusted local tools. Do not ship a Factory API key
in a public website, commit it to source control, or put it in a URL.

## License

Apache 2.0
