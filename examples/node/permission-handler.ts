/**
 * Permission handler example.
 *
 * Turns autonomy off so that every tool call asks for permission, then
 * approves only the calls that create the expected file and cancels the rest.
 *
 * Usage:
 *   npx tsx examples/node/permission-handler.ts
 */

import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  AutonomyLevel,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  run,
} from '@factory/droid-sdk/node';

// Resolve symlinks (for example /var -> /private/var on macOS) so the path in
// the prompt is the same path that the permission request reports.
const tempDir = await realpath(
  await mkdtemp(join(tmpdir(), 'droid-sdk-permission-'))
);
const outputPath = join(tempDir, 'hello.txt');

try {
  let handledPermission = false;
  const result = await run(
    `Create ${outputPath} with the text "Hello, World!"`,
    {
      cwd: tempDir,
      autonomyLevel: AutonomyLevel.Off,
      permissionHandler({ toolUses, options }) {
        handledPermission = true;
        // A Script request batches several tool calls; approve it only when
        // every call in the batch is allowed.
        const confirmations = toolUses.flatMap((item) =>
          item.details.type === ToolConfirmationType.Script
            ? item.details.calls.map((call) => call.confirmation)
            : [item.details]
        );
        // Depending on the model, Droid creates files with Create or ApplyPatch.
        const onlyCreatesExpectedFile =
          confirmations.length > 0 &&
          confirmations.every(
            (details) =>
              (details.type === ToolConfirmationType.Create &&
                details.filePath === outputPath) ||
              (details.type === ToolConfirmationType.ApplyPatch &&
                (details.files ?? [details]).every(
                  (file) => file.filePath === outputPath
                ))
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
