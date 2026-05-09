# Example: multi-turn session

Use `createSession()` when you want conversation state to persist across turns.

## What this example shows

- creating a persistent session
- starting turns with `session.send()` and streaming them with `turn.stream()`
- closing the session cleanly

## Key snippet: create the session

```ts
const session = await createSession({ cwd: process.cwd() });
```

Create the session once and reuse it across prompts.

## Key snippet: stream a turn

```ts
import { DroidMessageType } from '@factory/droid-sdk';

for await (const msg of (
  await session.send('List the TypeScript files in this project')
).stream()) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

Use `turn.stream()` when you want incremental output.

## Key snippet: collect streamed text

```ts
let text = '';
for await (const msg of (
  await session.send('Summarize the project in one sentence')
).stream()) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    text += msg.text;
  }
}
console.log(text);
```

Use `run()` for one-shot aggregated output; use `session.send()` plus `turn.stream()` for persistent sessions.

## Full script

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });

  console.log(`Session created: ${session.sessionId}\n`);

  try {
    for await (const msg of (
      await session.send('List the TypeScript files in this project')
    ).stream()) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        process.stdout.write(msg.text);
      }
    }

    console.log('\n');

    let summary = '';
    for await (const msg of (
      await session.send('Summarize the project in one sentence')
    ).stream()) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        summary += msg.text;
      }
    }
    console.log(summary);
  } finally {
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
