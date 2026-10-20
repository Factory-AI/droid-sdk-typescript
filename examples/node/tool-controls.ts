/**
 * Tool controls example.
 *
 * Disables tools at session creation, then inspects availability.
 *
 * Usage:
 *   npx tsx examples/node/tool-controls.ts
 */

import { createSession } from '@factory/droid-sdk/node';

const session = await createSession({
  disabledToolIds: ['Execute'],
});

try {
  const tools = await session.listTools();
  const allowed = (id: string) => tools.find((tool) => tool.id === id)?.allowed;

  for (const id of ['Read', 'Grep', 'Execute']) {
    console.log(`${id}: ${String(allowed(id))}`);
  }

  if (allowed('Execute') !== false) {
    throw new Error('Execute is still allowed after disabling it.');
  }
  if (allowed('Read') !== true) {
    throw new Error('Read must stay allowed: only Execute was disabled.');
  }
} finally {
  await session.close();
}
