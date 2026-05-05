# Example: initialization metadata

Use this when you need the raw initialization payload, early session IDs, or model/settings metadata.

## What this example shows

- reading `query().sessionId` and `query().initResult`
- waiting for `query().initialized`
- reading `session.initResult` from `createSession()` and `resumeSession()`

## Key snippet: inspect a query before and after initialization

```ts
const stream = query({
  prompt: 'Reply with "ready" and nothing else.',
  cwd: process.cwd(),
});

console.log(stream.sessionId);
console.log(stream.initResult);

const initialized = await stream.initialized;
console.log(initialized.sessionId);
console.log(initialized.settings.modelId);
```

Before initialization completes, `sessionId` and `initResult` are `null`.

## Key snippet: read metadata from sessions

```ts
const session = await createSession({ cwd: process.cwd() });
const resumed = await resumeSession(session.sessionId, { cwd: process.cwd() });

console.log(session.initResult.settings.modelId);
console.log(resumed.initResult.cwd);
```

## Full script

```ts
import { createSession, query, resumeSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const stream = query({
    prompt: 'Reply with "ready" and nothing else.',
    cwd: process.cwd(),
  });

  console.log(stream.sessionId);
  console.log(stream.initResult);

  const initialized = await stream.initialized;
  console.log(initialized.sessionId);
  console.log(initialized.settings.modelId);

  stream.abort();

  const session = await createSession({ cwd: process.cwd() });
  let resumed: Awaited<ReturnType<typeof resumeSession>> | null = null;

  try {
    resumed = await resumeSession(session.sessionId, {
      cwd: process.cwd(),
    });

    console.log(session.initResult.settings.modelId);
    console.log(resumed.initResult.cwd);
  } finally {
    await resumed?.close();
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
