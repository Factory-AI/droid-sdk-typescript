/**
 * Daemon: multiple concurrent sessions.
 *
 * Connects to a local daemon, creates two sessions in separate temporary
 * directories, and runs them concurrently over a single WebSocket connection.
 *
 * Usage:
 *   npx tsx examples/daemon-multi-session.ts
 *
 * Requirements: droid CLI installed, plus a real FACTORY_API_KEY.
 * Daemon authentication has no stored-credential fallback, so this
 * example skips itself when the env var is unset.
 */

import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  connectDaemon,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  type ToolConfirmationDetails,
} from '@factory/droid-sdk';

function canWriteFile(
  filePath: string,
  details: ToolConfirmationDetails
): boolean {
  switch (details.type) {
    case ToolConfirmationType.Create:
    case ToolConfirmationType.Edit:
    case ToolConfirmationType.ApplyPatch:
      return details.filePath === filePath;
    default:
      return false;
  }
}

async function main(): Promise<void> {
  if (!process.env.FACTORY_API_KEY) {
    console.log(
      'FACTORY_API_KEY is not set. Daemon authentication requires a real ' +
        'API key (stored CLI credentials are not used). Skipping.'
    );
    return;
  }

  console.log('Connecting to local daemon...\n');
  const daemon = await connectDaemon({ apiKey: process.env.FACTORY_API_KEY });
  console.log('Connected!\n');
  const tempDir = await mkdtemp(join(tmpdir(), 'droid-sdk-daemon-'));
  const frontendDir = join(tempDir, 'frontend');
  const backendDir = join(tempDir, 'backend');
  const frontendFile = join(frontendDir, 'hello.md');
  const backendFile = join(backendDir, 'notes.md');
  await Promise.all([
    mkdir(frontendDir, { recursive: true }),
    mkdir(backendDir, { recursive: true }),
  ]);

  try {
    const frontend = await daemon.createSession({
      cwd: frontendDir,
      permissionHandler(params) {
        return params.toolUses.every((item) =>
          canWriteFile(frontendFile, item.details)
        )
          ? ToolConfirmationOutcome.ProceedOnce
          : ToolConfirmationOutcome.Cancel;
      },
    });
    const backend = await daemon.createSession({
      cwd: backendDir,
      permissionHandler(params) {
        return params.toolUses.every((item) =>
          canWriteFile(backendFile, item.details)
        )
          ? ToolConfirmationOutcome.ProceedOnce
          : ToolConfirmationOutcome.Cancel;
      },
    });

    console.log('Two sessions created. Running concurrently...\n');

    await Promise.all([
      (async () => {
        try {
          for await (const msg of frontend.stream(
            'Create a file called hello.md with a short greeting message. Just a few lines.'
          )) {
            if (msg.type === DroidMessageType.Assistant) {
              process.stdout.write(`[frontend] ${msg.text}\n`);
            } else if (msg.type === DroidMessageType.ToolCall) {
              console.log(`[frontend] [tool] ${msg.toolUse.name}`);
            } else if (msg.type === DroidMessageType.Result) {
              console.log(`[frontend] Done in ${msg.durationMs}ms`);
            }
          }
        } finally {
          await frontend.close();
        }
      })(),
      (async () => {
        try {
          for await (const msg of backend.stream(
            'Create a file called notes.md with 3 random fun facts. Keep it short.'
          )) {
            if (msg.type === DroidMessageType.Assistant) {
              process.stdout.write(`[backend] ${msg.text}\n`);
            } else if (msg.type === DroidMessageType.ToolCall) {
              console.log(`[backend] [tool] ${msg.toolUse.name}`);
            } else if (msg.type === DroidMessageType.Result) {
              console.log(`[backend] Done in ${msg.durationMs}ms`);
            }
          }
        } finally {
          await backend.close();
        }
      })(),
    ]);
  } finally {
    await daemon.close();
    try {
      const [greeting, notes] = await Promise.all([
        readFile(frontendFile, 'utf8'),
        readFile(backendFile, 'utf8'),
      ]);
      console.log(`\n=== hello.md ===\n${greeting.trim()}`);
      console.log(`\n=== notes.md ===\n${notes.trim()}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
