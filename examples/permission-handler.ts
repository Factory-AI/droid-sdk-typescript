/**
 * Permission handler example.
 *
 * Demonstrates using `query()` with a custom `permissionHandler` that
 * logs tool confirmation details and returns `ToolConfirmationOutcome.ProceedOnce`
 * to approve each tool execution individually.
 *
 * Usage:
 *   npx tsx examples/permission-handler.ts
 */

import {
  query,
  ToolConfirmationOutcome,
  type RequestPermissionRequestParams,
} from '../src/index.js';

function permissionHandler(
  params: RequestPermissionRequestParams
): ToolConfirmationOutcome {
  for (const item of params.toolUses) {
    console.log(`\n[Permission] Tool: ${item.toolUse.name}`);
    console.log(`  Type: ${item.confirmationType}`);
    console.log(`  Input: ${JSON.stringify(item.toolUse.input, null, 2)}`);
  }

  console.log(`  → Approving with ProceedOnce\n`);
  return ToolConfirmationOutcome.ProceedOnce;
}

async function main(): Promise<void> {
  const prompt =
    process.argv[2] ??
    "Create a file called hello.txt with the text 'Hello, World!'";

  console.log(`Sending prompt: "${prompt}"\n`);

  const stream = query({
    prompt,
    cwd: process.cwd(),
    permissionHandler,
  });

  for await (const msg of stream) {
    switch (msg.type) {
      case 'assistant_text_delta':
        process.stdout.write(msg.text);
        break;

      case 'tool_use':
        console.log(`\n[Tool Use] ${msg.toolName}`);
        break;

      case 'tool_result':
        console.log(`[Tool Result] ${msg.isError ? 'Error' : 'Success'}`);
        break;

      case 'turn_complete':
        console.log('\n\n--- Turn complete ---');
        if (msg.tokenUsage) {
          console.log(
            `Tokens — input: ${msg.tokenUsage.inputTokens}, ` +
              `output: ${msg.tokenUsage.outputTokens}`
          );
        }
        break;
    }
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
