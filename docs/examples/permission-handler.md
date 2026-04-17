# Example: permission handler

Use a `permissionHandler` when your app needs to inspect or approve tool calls.

## What this example shows

- receiving tool confirmation requests
- inspecting `params.toolUses`
- approving each request with `ToolConfirmationOutcome.ProceedOnce`

## Key snippet: define the handler

```ts
function permissionHandler(
  params: RequestPermissionRequestParams
): ToolConfirmationOutcome {
  for (const item of params.toolUses) {
    console.log(item.toolUse.name, item.confirmationType);
  }
  return ToolConfirmationOutcome.ProceedOnce;
}
```

- `params.toolUses` describes the pending tool calls
- `ProceedOnce` approves the current request only

## Key snippet: pass the handler to `query()`

```ts
const stream = query({
  prompt: "Create a file called hello.txt with the text 'Hello, World!'",
  cwd: process.cwd(),
  permissionHandler,
});
```

## Full script

```ts
import {
  query,
  ToolConfirmationOutcome,
  type RequestPermissionRequestParams,
} from '@factory/droid-sdk';

function permissionHandler(
  params: RequestPermissionRequestParams
): ToolConfirmationOutcome {
  for (const item of params.toolUses) {
    console.log(`\n[Permission] Tool: ${item.toolUse.name}`);
    console.log(`Type: ${item.confirmationType}`);
  }

  return ToolConfirmationOutcome.ProceedOnce;
}

async function main(): Promise<void> {
  const stream = query({
    prompt: "Create a file called hello.txt with the text 'Hello, World!'",
    cwd: process.cwd(),
    permissionHandler,
  });

  for await (const msg of stream) {
    if (msg.type === 'assistant_text_delta') {
      process.stdout.write(msg.text);
    }
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
