import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { AutonomyLevel, DroidMessageType } from '@factory/droid-sdk';

import {
  assertAssistantOutput,
  assertDefaultStreamShape,
  assertPartialStreamShape,
  assertToolPairing,
  collectPartialStream,
  collectStream,
  createStressSession,
  isDirectRun,
  runStressCase,
  withTempDir,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('tool use preservation', async () => {
    await withTempDir('tool-use', async (dir) => {
      const defaultFile = join(dir, 'default.txt');
      const partialFile = join(dir, 'partial.txt');
      await writeFile(defaultFile, 'default tool use fixture\n');
      await writeFile(partialFile, 'partial tool use fixture\n');

      const defaultSession = await createStressSession({
        autonomyLevel: AutonomyLevel.Medium,
      });
      const partialSession = await createStressSession({
        autonomyLevel: AutonomyLevel.Medium,
      });

      try {
        const defaultCollected = await collectStream(
          'tool-use-default',
          defaultSession,
          toolPrompt(defaultFile, 'default')
        );
        const partialCollected = await collectPartialStream(
          'tool-use-partial',
          partialSession,
          toolPrompt(partialFile, 'partial')
        );

        assertDefaultStreamShape(defaultCollected);
        assertPartialStreamShape(partialCollected);
        assertAssistantOutput(defaultCollected);
        assertAssistantOutput(partialCollected);
        assertToolPairing(defaultCollected.events, defaultCollected.name);
        assertToolPairing(partialCollected.events, partialCollected.name);

        assert.ok(
          defaultCollected.counts[DroidMessageType.ToolCall] ?? 0,
          'default stream must expose completed tool calls'
        );
        assert.ok(
          defaultCollected.counts[DroidMessageType.ToolResult] ?? 0,
          'default stream must expose tool results'
        );
        assert.ok(
          partialCollected.counts[DroidMessageType.ToolCall] ?? 0,
          'partial stream must include completed tool calls'
        );
        assert.ok(
          partialCollected.counts[DroidMessageType.ToolCallDelta] ?? 0,
          'partial stream must include tool_call_delta'
        );
        assert.ok(
          partialCollected.result.messages.some(
            (message) => message.type === DroidMessageType.ToolCall
          ),
          'result.messages must preserve tool_call'
        );
        assert.ok(
          partialCollected.result.messages.some(
            (message) => message.type === DroidMessageType.ToolResult
          ),
          'result.messages must preserve tool_result'
        );
      } finally {
        await Promise.all([defaultSession.close(), partialSession.close()]);
      }
    });
  });
}

function toolPrompt(file: string, mode: string): string {
  return [
    `Use a file-reading tool to read ${file}.`,
    `Then respond with exactly: ${mode} tool use stress complete`,
  ].join('\n');
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
