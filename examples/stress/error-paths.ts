import assert from 'node:assert/strict';

import {
  ConnectionError,
  DroidMessageType,
  OutputFormatType,
  createSession,
} from '@factory/droid-sdk';
import type { DroidClientTransport } from '@factory/droid-sdk';

import {
  assertDefaultStreamShape,
  collectStream,
  createStressSession,
  isDirectRun,
  runStressCase,
} from './_harness.js';

export async function main(): Promise<void> {
  await runStressCase('turn-level structured output error', async () => {
    const session = await createStressSession();
    try {
      const collected = await collectStream(
        'error-paths-structured-output',
        session,
        'Return any object. This schema intentionally cannot be satisfied.',
        {
          outputFormat: {
            type: OutputFormatType.JsonSchema,
            schema: {
              type: 'object',
              properties: {
                impossible: { type: 'string', enum: [] },
              },
              required: ['impossible'],
              additionalProperties: false,
            },
          },
        }
      );

      assertDefaultStreamShape(collected);
      assert.equal(collected.result.type, DroidMessageType.Result);
      assert.equal(
        collected.result.isError,
        true,
        'expected turn-level error to be captured on result'
      );
      assert.ok(
        collected.result.error ||
          collected.result.structuredOutputError ||
          collected.result.subtype === 'error_structured_output',
        'expected result to include error details or structured output subtype'
      );
    } finally {
      await session.close();
    }
  });

  await runStressCase('startup failure throws typed error', async () => {
    await assert.rejects(
      () =>
        createSession({
          transport: new FailingStartupTransport(),
        }),
      (error: unknown) => error instanceof ConnectionError
    );
  });
}

class FailingStartupTransport implements DroidClientTransport {
  readonly isConnected = false;

  send(): void {
    throw new ConnectionError('Synthetic startup transport failure');
  }

  onMessage(): void {}

  onError(): void {}

  async close(): Promise<void> {}
}

if (isDirectRun(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
