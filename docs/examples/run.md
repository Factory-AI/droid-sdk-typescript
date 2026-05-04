# Example: one-shot run

Use this when you want a single prompt and only need the final aggregated
result.

## What this example shows

- sending a one-shot request with `run()`
- reading the final assistant text
- inspecting collected messages and token usage

## Key snippet

```ts
const result = await run('What files are in the current directory?', {
  cwd: process.cwd(),
});

console.log(result.text);
```

`run()` creates a temporary session, sends the prompt, returns a
`DroidResult`, and closes the session automatically.

## Full script

```ts
import { run } from '@factory/droid-sdk';

async function main(): Promise<void> {
  const text = process.argv.slice(2).join(' ') || 'What is 2 + 2?';

  const result = await run(text, {
    cwd: process.cwd(),
  });

  console.log(result.text);
  console.log(`Messages received: ${result.messages.length}`);

  if (result.tokenUsage) {
    console.log(
      `Tokens — input: ${result.tokenUsage.inputTokens}, ` +
        `output: ${result.tokenUsage.outputTokens}`
    );
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
```
