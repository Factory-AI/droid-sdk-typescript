/**
 * Abort a running turn with AbortController.
 *
 * Passing an `abortSignal` to `session.stream()` makes the stream throw when
 * the signal fires. See interrupt-session.ts for the server-side equivalent.
 *
 * Usage:
 *   npx tsx examples/node/abort-session-stream.ts
 */

import { createSession } from '@factory/droid-sdk/node';

const session = await createSession();
const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(new Error('Stopped by AbortController')),
  1000
);

try {
  for await (const _msg of session.stream(
    'Write a long explanation of how compilers work.',
    { abortSignal: controller.signal }
  )) {
    // Consume the stream until the abort signal cuts it short.
  }
} catch (error) {
  console.log(error instanceof Error ? error.message : String(error));
} finally {
  clearTimeout(timeout);
  await session.close();
}
