# Example: multi-turn session

Use `createSession()` when you want conversation state to persist across turns.

## What this example shows

- creating a persistent session
- streaming one turn with `session.stream()`
- collecting a later turn with `session.send()`
- closing the session cleanly

## Key snippet: create the session

```ts
const session = await createSession({ cwd: process.cwd() });
```

Create the session once and reuse it across prompts.

## Key snippet: stream a turn

```ts
import { DroidMessageType } from '@factory/droid-sdk';

for await (const msg of session.stream(
  'List the TypeScript files in this project'
)) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

Use `stream()` when you want incremental output.

## Key snippet: collect a full response

```ts
const result = await session.send('Summarize the project in one sentence');
console.log(result.text);
```

Use `send()` when you want the SDK to aggregate the turn for you.

## Full script

```ts
import { createSession, DroidMessageType } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });

  console.log(`Session created: ${session.sessionId}\n`);

  try {
    for await (const msg of session.stream(
      'List the TypeScript files in this project'
    )) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        process.stdout.write(msg.text);
      }
    }

    console.log('\n');

    const result = await session.send('Summarize the project in one sentence');
    console.log(result.text);
  } finally {
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
