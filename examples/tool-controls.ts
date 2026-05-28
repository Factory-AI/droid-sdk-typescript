/**
 * Tool controls example.
 *
 * Usage:
 *   npx tsx examples/tool-controls.ts
 */

import { createSession } from '@factory/droid-sdk';

const session = await createSession({
  apiKey: process.env.FACTORY_API_KEY!,
  cwd: process.cwd(),
  enabledToolIds: ['Read', 'Grep'],
  disabledToolIds: ['Execute'],
});

try {
  const before = await session.listTools();
  console.log(
    before.tools
      .filter((tool) => ['Read', 'Execute'].includes(tool.llmId))
      .map((tool) => `${tool.llmId}: ${String(tool.currentlyAllowed)}`)
      .join('\n')
  );

  await session.updateSettings({ disabledToolIds: ['Read', 'Execute'] });

  const after = await session.listTools();
  console.log(
    after.tools
      .filter((tool) => ['Read', 'Execute'].includes(tool.llmId))
      .map((tool) => `${tool.llmId}: ${String(tool.currentlyAllowed)}`)
      .join('\n')
  );
} finally {
  await session.close();
}
