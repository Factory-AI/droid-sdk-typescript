/**
 * Tool controls example.
 *
 * Demonstrates:
 * - configuring enabled and disabled tool IDs at session creation
 * - inspecting the current tool catalog with `listTools()`
 * - updating tool overrides with `updateSettings()`
 *
 * Usage:
 *   npx tsx examples/tool-controls.ts
 */

import { createSession } from '@factory/droid-sdk';
import type { ExecToolInfo } from '@factory/droid-sdk';

function printToolState(label: string, tool: ExecToolInfo | undefined): void {
  if (!tool) {
    console.log(`${label}: not present in tool catalog`);
    return;
  }

  console.log(
    `${label}: defaultAllowed=${tool.defaultAllowed}, currentlyAllowed=${tool.currentlyAllowed}`
  );
}

async function main(): Promise<void> {
  const session = await createSession({
    cwd: process.cwd(),
    enabledToolIds: ['Read', 'Glob', 'Grep'],
    disabledToolIds: ['Execute'],
  });

  try {
    console.log(`Session created: ${session.sessionId}\n`);

    const initial = await session.listTools();
    const initialRead = initial.tools.find((tool) => tool.llmId === 'Read');
    const initialExecute = initial.tools.find(
      (tool) => tool.llmId === 'Execute'
    );

    console.log('=== Initial tool state ===');
    printToolState('Read', initialRead);
    printToolState('Execute', initialExecute);

    await session.updateSettings({
      disabledToolIds: ['Read', 'Execute'],
    });

    const updated = await session.listTools();
    const updatedRead = updated.tools.find((tool) => tool.llmId === 'Read');
    const updatedExecute = updated.tools.find(
      (tool) => tool.llmId === 'Execute'
    );

    console.log('\n=== Updated tool state ===');
    printToolState('Read', updatedRead);
    printToolState('Execute', updatedExecute);
  } finally {
    await session.close();
    console.log('\nSession closed.');
  }
}

main().catch((err: unknown) => {
  console.error('Error:', err);
  process.exit(1);
});
