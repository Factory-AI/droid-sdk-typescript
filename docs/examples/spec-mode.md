# Example: spec mode approval flow

Use spec mode when you want Droid to propose a plan first and only implement after approval.

## What this example shows

- starting a query in `DroidInteractionMode.Spec`
- detecting an `ExitSpecMode` confirmation request
- choosing whether implementation stays in the same session or moves to a new one

## Key snippet: start in spec mode

```ts
const stream = query({
  prompt: PROMPT,
  cwd: process.cwd(),
  interactionMode: DroidInteractionMode.Spec,
  specModeReasoningEffort: ReasoningEffort.High,
  permissionHandler(params) {
    return ToolConfirmationOutcome.ProceedOnce;
  },
});
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
  query,
  DroidInteractionMode,
  ReasoningEffort,
  ToolConfirmationOutcome,
  ToolConfirmationType,
} from '@factory/droid-sdk';

const PROMPT =
  'Plan how to create a small hello-from-droid.txt file in the current directory containing the text "Hello from Droid". Keep the plan short and concrete.';

async function main(): Promise<void> {
  const stream = query({
    prompt: PROMPT,
    cwd: process.cwd(),
    interactionMode: DroidInteractionMode.Spec,
    specModeReasoningEffort: ReasoningEffort.High,
    permissionHandler(params) {
      const exitSpec = params.toolUses.find(
        (t) => t.confirmationType === ToolConfirmationType.ExitSpecMode
      );

      if (exitSpec) {
        return ToolConfirmationOutcome.ProceedOnce;
      }

      return ToolConfirmationOutcome.ProceedOnce;
    },
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
