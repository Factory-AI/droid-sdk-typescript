/**
 * Abort a running turn with AbortController.
 *
 * Demonstrates passing an `abortSignal` to `session.stream()` and
 * stopping a turn after a timeout.
 *
 * Usage:
 *   npx tsx examples/abort-session-stream.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset.
 */

import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
});
const controller = new AbortController();
const timeout = setTimeout(
  () => controller.abort(new Error('Stopped by AbortController')),
  1000
);

try {
  for await (const _msg of session.stream(
    'Write a long explanation of how compilers work.',
    {
      abortSignal: controller.signal,
    }
  )) {
    void _msg;
  }
} catch (error) {
  console.log(error instanceof Error ? error.message : String(error));
} finally {
  clearTimeout(timeout);
  await session.close();
}
