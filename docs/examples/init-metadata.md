# Example: initialization metadata

Use this when you need the raw initialization payload, session IDs, or model/settings metadata.

## What this example shows

- reading `session.initResult` from `createSession()` and `resumeSession()`

## Key snippet: read metadata from sessions

```ts
const session = await createSession({ cwd: process.cwd() });
const resumed = await resumeSession(session.sessionId, { cwd: process.cwd() });

console.log(session.initResult.settings.modelId);
console.log(resumed.initResult.cwd);
```

## Full script

```ts
import { createSession, resumeSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const session = await createSession({ cwd: process.cwd() });
  let resumed: Awaited<ReturnType<typeof resumeSession>> | null = null;

  try {
    resumed = await resumeSession(session.sessionId, {
      cwd: process.cwd(),
    });

    console.log(session.sessionId);
    console.log(session.initResult.settings.modelId);
    console.log(resumed.sessionId);
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
