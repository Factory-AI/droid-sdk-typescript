/**
 * Permission handler example.
 *
 * Usage:
 *   npx tsx examples/node/permission-handler.ts
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AutonomyLevel,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  run,
} from '@factory/droid-sdk/node';

const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-permission-'));
const outputPath = join(tempDir, 'hello.txt');

try {
  let handledPermission = false;
  const result = await run(
    `Create ${outputPath} with the text "Hello, World!"`,
    {
      autonomyLevel: AutonomyLevel.Off,
      permissionHandler({ toolUses, options }) {
        handledPermission = true;
        const onlyCreatesExpectedFile =
          toolUses.length > 0 &&
          toolUses.every(
            (item) =>
              item.details.type === ToolConfirmationType.Create &&
              item.details.filePath === outputPath
          );

        const desired = onlyCreatesExpectedFile
          ? ToolConfirmationOutcome.ProceedOnce
          : ToolConfirmationOutcome.Cancel;

        const offered = options.find((option) => option.value === desired);
        if (!offered) throw new Error(`Outcome not offered: ${desired}`);

        return desired;
      },
    }
  );

  if (!result.success) {
    throw new Error(result.error?.message ?? 'The turn was interrupted.');
  }
  if (!handledPermission) {
    throw new Error('The turn finished without requesting permission.');
  }

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
