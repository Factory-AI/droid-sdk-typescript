# Example: session streaming

Use this when you want to stream output from a session turn as it arrives.

## What this example shows

- creating a session with `createSession()`
- streaming a turn with `session.stream()`
- streaming assistant text incrementally
- observing tool activity and turn completion

## Key snippet: create the session and stream a turn

```ts
const session = await createSession({ cwd: process.cwd() });

for await (const msg of session.stream(
  'List all TypeScript files in this project'
)) {
  // Handle streamed messages.
}
```

- the stream prompt is the user message for this turn
- `cwd` is the directory Droid should operate in

## Key snippet: consume streamed messages

```ts
import { DroidMessageType } from '@factory/droid-sdk';

for await (const msg of session.stream(prompt)) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

- `assistant_text_delta` gives you streaming text output
- you can also handle `tool_use`, `tool_result`, and `turn_complete`

## Full script

```ts
import { DroidMessageType, createSession } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? 'What files are in the current directory?';

  const session = await createSession({ cwd: process.cwd() });

  try {
    for await (const msg of session.stream(prompt)) {
      switch (msg.type) {
        case DroidMessageType.AssistantTextDelta:
          process.stdout.write(msg.text);
          break;
        case DroidMessageType.ToolUse:
          console.log(`\n[Tool] ${msg.toolName}`);
          break;
        case DroidMessageType.ToolResult:
          console.log(`[Tool Result] ${msg.isError ? 'Error' : 'OK'}`);
          break;
        case DroidMessageType.TurnComplete:
          console.log('\n\n--- Turn complete ---');
          break;
      }
    }
  } finally {
    await session.close();
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
