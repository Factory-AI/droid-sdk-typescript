/**
 * Abort a running turn with AbortController.
 *
 * Usage:
 *   npx tsx examples/abort-session-stream.ts
 */

import { createSession } from '@factory/droid-sdk';

const session = await createSession({ cwd: process.cwd() });
const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(new Error('Stopped by AbortController')),
  1000
);

try {
  for await (const _msg of (
    await session.send('Write a long explanation of how compilers work.', {
      abortSignal: controller.signal,
    })
  ).stream()) {
    void _msg;
  }
} catch (error) {
  console.log(error instanceof Error ? error.message : String(error));
} finally {
  clearTimeout(timeout);
  await session.close();
}
