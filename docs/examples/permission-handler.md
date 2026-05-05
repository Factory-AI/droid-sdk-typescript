# Example: permission handler

Use a `permissionHandler` when your app needs to inspect or approve tool calls.

## What this example shows

- receiving tool confirmation requests
- inspecting `params.toolUses`
- approving each request with `ToolConfirmationOutcome.ProceedOnce`

## Key snippet: define the handler

```ts
function permissionHandler(
  allowedFilePath: string,
  params: RequestPermissionRequestParams
): ToolConfirmationOutcome {
  const onlyAllowedCreate = params.toolUses.every(
    (item) =>
      item.details.type === ToolConfirmationType.Create &&
      item.details.filePath === allowedFilePath
  );

  return onlyAllowedCreate
    ? ToolConfirmationOutcome.ProceedOnce
    : ToolConfirmationOutcome.Cancel;
}
```

- `params.toolUses` describes the pending tool calls
- `ProceedOnce` approves the current request only

## Key snippet: pass the handler to `query()`

```ts
const stream = query({
  prompt: `Create a file called ${outputPath} with the text 'Hello, World!'`,
  cwd: process.cwd(),
  permissionHandler: (params) => permissionHandler(outputPath, params),
});
```

## Full script

```ts
import {
  DroidMessageType,
  query,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  type RequestPermissionRequestParams,
} from '@factory/droid-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function permissionHandler(
  allowedFilePath: string,
  params: RequestPermissionRequestParams
): ToolConfirmationOutcome {
  for (const item of params.toolUses) {
    console.log(`\n[Permission] Tool: ${item.toolUse.name}`);
    console.log(`Type: ${item.confirmationType}`);
  }

  const onlyAllowedCreate = params.toolUses.every(
    (item) =>
      item.details.type === ToolConfirmationType.Create &&
      item.details.filePath === allowedFilePath
  );

  return onlyAllowedCreate
    ? ToolConfirmationOutcome.ProceedOnce
    : ToolConfirmationOutcome.Cancel;
}

async function main(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-permission-'));
  const outputPath = join(tempDir, 'hello.txt');

  try {
    const stream = query({
      prompt: `Create a file called ${outputPath} with the text 'Hello, World!'`,
      cwd: process.cwd(),
      permissionHandler: (params) => permissionHandler(outputPath, params),
    });

    for await (const msg of stream) {
      if (msg.type === DroidMessageType.AssistantTextDelta) {
        process.stdout.write(msg.text);
      }
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
