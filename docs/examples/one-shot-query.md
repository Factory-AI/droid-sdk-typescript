# Example: one-shot query

Use this when you want a single prompt and want to stream output as it arrives.

## What this example shows

- starting a one-shot request with `query()`
- streaming assistant text incrementally
- observing tool activity and turn completion

## Key snippet: create the stream

```ts
const stream = query({
  prompt: 'List all TypeScript files in this project',
  cwd: process.cwd(),
});
```

- `prompt` is the first user message
- `cwd` is the directory Droid should operate in

## Key snippet: consume streamed messages

```ts
import { DroidMessageType } from '@factory/droid-sdk';

for await (const msg of stream) {
  if (msg.type === DroidMessageType.AssistantTextDelta) {
    process.stdout.write(msg.text);
  }
}
```

- `assistant_text_delta` gives you streaming text output
- you can also handle `tool_use`, `tool_result`, and `turn_complete`

## Full script

```ts
import { DroidMessageType, query } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const prompt = process.argv[2] ?? 'What files are in the current directory?';

  const stream = query({
    prompt,
    cwd: process.cwd(),
  });

  for await (const msg of stream) {
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
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
