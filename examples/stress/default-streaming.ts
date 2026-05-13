import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AutonomyLevel, DroidMessageType } from '@factory/droid-sdk';

import {
  assertAssistantOutput,
  assertDefaultStreamShape,
  assertToolPairing,
  collectStream,
  createStressSession,
  isDirectRun,
  runStressCase,
  withTempDir,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('default streaming text', async () => {
    const session = await createStressSession();
    try {
      const collected = await collectStream(
        'default-streaming-text',
        session,
        [
          'Reply with one short sentence.',
          'Include the exact phrase "default streaming stress".',
        ].join(' ')
      );

      assertDefaultStreamShape(collected);
      assertAssistantOutput(collected);
    } finally {
      await session.close();
    }
  });

  await runStressCase('default streaming tool use', async () => {
    await withTempDir('default-streaming', async (dir) => {
      const file = join(dir, 'input.txt');
      await writeFile(file, 'default stream tool fixture\n');

      const session = await createStressSession({
        autonomyLevel: AutonomyLevel.Medium,
      });
      try {
        const collected = await collectStream(
          'default-streaming-tool-use',
          session,
          [
            `Read the file at ${file}.`,
            'Then reply with exactly: default stream read complete',
          ].join('\n')
        );

        assertDefaultStreamShape(collected);
        assertAssistantOutput(collected);
        assert.ok(
          collected.counts[DroidMessageType.ToolCall] ?? 0,
          'expected default stream to emit a tool_call'
        );
        assert.ok(
          collected.counts[DroidMessageType.ToolResult] ?? 0,
          'expected default stream to emit a tool_result'
        );
        assertToolPairing(collected.events, collected.name);
      } finally {
        await session.close();
      }
    });
  });
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
