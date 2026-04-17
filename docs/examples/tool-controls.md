# Example: tool controls

Use this when you want to programmatically shape which built-in exec tools are available.

## What this example shows

- setting initial tool overrides
- inspecting the current tool catalog with `listTools()`
- updating tool overrides later with `updateSettings()`

## Key snippet: set tool overrides at session creation

```ts
const session = await createSession({
  cwd: process.cwd(),
  enabledToolIds: ['Read', 'Glob', 'Grep'],
  disabledToolIds: ['Execute'],
});
```

## Key snippet: inspect tool state

```ts
const result = await session.listTools();
console.log(result.tools);
```

## Key snippet: update tool state later

```ts
await session.updateSettings({
  disabledToolIds: ['Read', 'Execute'],
});
```

## Full script

```ts
import { createSession, type ExecToolInfo } from '@factory/droid-sdk';

function printToolState(label: string, tool: ExecToolInfo | undefined): void {
  if (!tool) {
    console.log(`${label}: not present in tool catalog`);
    return;
  }

  console.log(
    `${label}: defaultAllowed=${tool.defaultAllowed}, currentlyAllowed=${tool.currentlyAllowed}`
  );
}

async function main(): Promise<void> {
  const session = await createSession({
    cwd: process.cwd(),
    enabledToolIds: ['Read', 'Glob', 'Grep'],
    disabledToolIds: ['Execute'],
  });

  try {
    const initial = await session.listTools();
    const initialRead = initial.tools.find((tool) => tool.llmId === 'Read');
    const initialExecute = initial.tools.find(
      (tool) => tool.llmId === 'Execute'
    );

    printToolState('Read', initialRead);
    printToolState('Execute', initialExecute);

    await session.updateSettings({
      disabledToolIds: ['Read', 'Execute'],
    });

    const updated = await session.listTools();
    const updatedRead = updated.tools.find((tool) => tool.llmId === 'Read');
    const updatedExecute = updated.tools.find(
      (tool) => tool.llmId === 'Execute'
    );

    printToolState('Read', updatedRead);
    printToolState('Execute', updatedExecute);
  } finally {
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
