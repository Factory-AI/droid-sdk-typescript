/**
 * Permission handler example.
 *
 * Demonstrates approving or canceling tool calls with a
 * `permissionHandler`: only file creation at the expected temp path is
 * allowed.
 *
 * Usage:
 *   npx tsx examples/permission-handler.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ToolConfirmationOutcome,
  ToolConfirmationType,
  run,
} from '@factory/droid-sdk';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-permission-'));
const outputPath = join(tempDir, 'hello.txt');

try {
  await run(`Create ${outputPath} with the text "Hello, World!"`, {
    apiKey: process.env.FACTORY_API_KEY!,
    cwd: process.cwd(),
    permissionHandler(params) {
      const onlyCreatesExpectedFile = params.toolUses.every(
        (item) =>
          item.details.type === ToolConfirmationType.Create &&
          item.details.filePath === outputPath
      );

      return onlyCreatesExpectedFile
        ? ToolConfirmationOutcome.ProceedOnce
        : ToolConfirmationOutcome.Cancel;
    },
  });

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
