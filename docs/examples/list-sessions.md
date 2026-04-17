# Example: list saved sessions

Use `listSessions()` when you need recent Droid session history without launching a subprocess.

## What this example shows

- listing recent sessions for the current project
- listing recent sessions across all projects
- formatting returned `SessionMetadata`

## Key snippet: project-scoped listing

```ts
const currentProject = await listSessions({ numSessions: 10 });
```

## Key snippet: cross-project listing

```ts
const allSessions = await listSessions({
  fetchOutsideCWD: true,
  numSessions: 5,
});
```

This helper reads local session files directly and returns `SessionMetadata[]`.

## Full script

```ts
import { listSessions } from '@factory/droid-sdk';

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

async function main(): Promise<void> {
  const currentProject = await listSessions({ numSessions: 10 });

  for (const session of currentProject) {
    const title = session.sessionTitle ?? session.title ?? '(untitled)';
    console.log(
      `[${session.id.slice(0, 8)}] ${formatDate(session.modifiedTime)} ${session.messageCount} msgs — ${title}`
    );
  }

  const allSessions = await listSessions({
    fetchOutsideCWD: true,
    numSessions: 5,
  });

  for (const session of allSessions) {
    const title = session.sessionTitle ?? session.title ?? '(untitled)';
    console.log(
      `[${session.id.slice(0, 8)}] ${formatDate(session.modifiedTime)} — ${title}`
    );
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
