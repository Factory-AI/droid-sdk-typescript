# Example: spec mode approval flow

Use spec mode when you want Droid to propose a plan first and only implement after approval.

## What this example shows

- starting a session in `DroidInteractionMode.Spec`
- detecting an `ExitSpecMode` confirmation request
- choosing whether implementation stays in the same session or moves to a new one

## Key snippet: start in spec mode

```ts
const session = await createSession({
  cwd: process.cwd(),
  interactionMode: DroidInteractionMode.Spec,
  specModeReasoningEffort: ReasoningEffort.High,
  permissionHandler(params) {
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

for await (const msg of session.stream(prompt)) {
  // Handle streamed messages.
}
```

## Key snippet: detect the spec approval request

```ts
const exitSpec = params.toolUses.find(
  (t) => t.confirmationType === ToolConfirmationType.ExitSpecMode
);
```

Choose the outcome you want:

- `ToolConfirmationOutcome.ProceedOnce` keeps implementation in the same session
- `ToolConfirmationOutcome.ProceedNewSessionHigh` hands implementation to a new session

## Full script

```ts
import {
  DroidMessageType,
  DroidInteractionMode,
  createSession,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-spec-'));
  const outputPath = join(tempDir, 'hello-from-droid.txt');
  const prompt =
    `Plan how to create a small ${outputPath} file containing the text ` +
    '"Hello from Droid". Keep the plan short and concrete.';

  try {
    const session = await createSession({
      cwd: process.cwd(),
      interactionMode: DroidInteractionMode.Spec,
      specModeReasoningEffort: ReasoningEffort.High,
      permissionHandler(params) {
        const exitSpec = params.toolUses.find(
          (item) => item.details.type === ToolConfirmationType.ExitSpecMode
        );

        if (exitSpec) {
          return ToolConfirmationOutcome.ProceedOnce;
        }

        const onlyAllowedCreate = params.toolUses.every(
          (item) =>
            item.details.type === ToolConfirmationType.Create &&
            item.details.filePath === outputPath
        );

        return onlyAllowedCreate
          ? ToolConfirmationOutcome.ProceedOnce
          : ToolConfirmationOutcome.Cancel;
      },
    });

    try {
      for await (const msg of session.stream(prompt)) {
        if (msg.type === DroidMessageType.AssistantTextDelta) {
          process.stdout.write(msg.text);
        }
      }
    } finally {
      await session.close();
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
