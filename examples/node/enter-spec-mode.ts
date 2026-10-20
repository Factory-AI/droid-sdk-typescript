/**
 * Enter spec mode on a live session.
 *
 * The other spec-mode examples start the session in spec mode. This one starts
 * in Auto mode and switches mid-session with `enterSpecMode()`, which is what a
 * host app does when the user toggles spec mode on an open conversation.
 *
 * The permission handler prints the proposed plan (`ExitSpecMode`), approves
 * it and the write to the output file, and cancels any other tool call.
 *
 * Usage:
 *   npx tsx examples/node/enter-spec-mode.ts
 */

import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type ClientPermissionHandler,
  type ToolConfirmationDetails,
  DroidInteractionMode,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
} from '@factory/droid-sdk/node';

// Resolve symlinks (for example /var -> /private/var on macOS) so the path in
// the prompt is the same path that the permission request reports.
const tempDir = await realpath(
  await mkdtemp(join(tmpdir(), 'droid-sdk-enter-spec-'))
);
const outputPath = join(tempDir, 'hello.txt');

/** True when a tool call only writes the file that the prompt asks for. */
function writesOnlyOutputFile(details: ToolConfirmationDetails): boolean {
  switch (details.type) {
    case ToolConfirmationType.Create:
    case ToolConfirmationType.Edit:
      return details.filePath === outputPath;
    case ToolConfirmationType.ApplyPatch:
      return (details.files ?? [details]).every(
        (file) => file.filePath === outputPath
      );
    default:
      return false;
  }
}

const handlePermissionRequest: ClientPermissionHandler = ({
  toolUses,
  options,
}) => {
  // A Script request batches tool calls; see permission-handler.ts.
  const confirmations = toolUses.flatMap((toolUse) =>
    toolUse.details.type === ToolConfirmationType.Script
      ? toolUse.details.calls.map((call) => call.confirmation)
      : [toolUse.details]
  );
  for (const details of confirmations) {
    if (details.type === ToolConfirmationType.ExitSpecMode) {
      console.log(details.plan);
    }
  }

  // Approve the plan and the write to outputPath. Cancel everything else.
  const expected =
    confirmations.length > 0 &&
    confirmations.every(
      (details) =>
        details.type === ToolConfirmationType.ExitSpecMode ||
        writesOnlyOutputFile(details)
    );
  const outcome = expected
    ? ToolConfirmationOutcome.ProceedOnce
    : ToolConfirmationOutcome.Cancel;
  if (!options.some((option) => option.value === outcome)) {
    throw new Error(`Outcome not offered: ${outcome}`);
  }
  return outcome;
};

try {
  const session = await createSession({
    cwd: tempDir,
    interactionMode: DroidInteractionMode.Auto,
    permissionHandler: handlePermissionRequest,
  });

  try {
    await session.enterSpecMode();

    // The handler cancels shell commands, so the prompt asks for a file tool.
    for await (const message of session.stream(
      `Create ${outputPath} containing "hello". Write it with a file editing tool, not a shell command.`
    )) {
      if (message.type === DroidMessageType.Result && !message.success) {
        throw new Error(
          message.error?.message ?? `Turn ended: ${message.subtype}`
        );
      }
    }
  } finally {
    await session.close();
  }

  console.log(await readFile(outputPath, 'utf8'));
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
