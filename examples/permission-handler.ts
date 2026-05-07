/**
 * Permission handler example.
 *
 * Demonstrates using `query()` with a custom `permissionHandler` that
 * logs tool confirmation details, approves only one expected file creation,
 * and cancels any unexpected tool request.
 *
 * Usage:
 *   npx tsx examples/permission-handler.ts
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DroidMessageType,
  query,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  type RequestPermissionRequestParams,
} from '@factory/droid-sdk';

function permissionHandler(
  allowedFilePath: string,
  params: RequestPermissionRequestParams
): ToolConfirmationOutcome {
  for (const item of params.toolUses) {
    console.log(`\n[Permission] Tool: ${item.toolUse.name}`);
    console.log(`  Type: ${item.confirmationType}`);
    console.log(`  Input: ${JSON.stringify(item.toolUse.input, null, 2)}`);
  }

  const onlyAllowedCreate = params.toolUses.every(
    (item) =>
      item.details.type === ToolConfirmationType.Create &&
      item.details.filePath === allowedFilePath
  );

  if (!onlyAllowedCreate) {
    console.log('  → Cancelling unexpected tool request\n');
    return ToolConfirmationOutcome.Cancel;
  }

  console.log('  → Approving expected file creation with ProceedOnce\n');
  return ToolConfirmationOutcome.ProceedOnce;
}

async function main(): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-permission-'));
  const outputPath = join(tempDir, 'hello.txt');
  const prompt =
    process.argv[2] ??
    `Create a file called ${outputPath} with the text 'Hello, World!'`;

  try {
    console.log(`Sending prompt: "${prompt}"\n`);

    const stream = query({
      prompt,
      cwd: process.cwd(),
      permissionHandler: (params) => permissionHandler(outputPath, params),
    });

    for await (const msg of stream) {
      switch (msg.type) {
        case DroidMessageType.AssistantTextDelta:
          process.stdout.write(msg.text);
          break;

        case DroidMessageType.ToolUse:
          console.log(`\n[Tool Use] ${msg.toolName}`);
          break;

        case DroidMessageType.ToolResult:
          console.log(`[Tool Result] ${msg.isError ? 'Error' : 'Success'}`);
          break;

        case DroidMessageType.TurnComplete:
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
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
