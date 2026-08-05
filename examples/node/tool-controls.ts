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

  for (const tool of tools) {
    if (['Read', 'Grep', 'Execute'].includes(tool.id)) {
      console.log(`${tool.id}: ${String(tool.allowed)}`);
    }
  }
} finally {
  await session.close();
}
