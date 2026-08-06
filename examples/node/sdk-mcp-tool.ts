/**
 * SDK MCP tool example.
 *
 * Defines an in-process tool with `createSdkMcpServer` + `tool` and exposes it
 * to Droid, then asks Droid to call it.
 *
 * Usage:
 *   npx tsx examples/node/sdk-mcp-tool.ts
 */

import {
  DroidMessageType,
  ToolConfirmationOutcome,
  createSession,
  createSdkMcpServer,
  tool,
} from '@factory/droid-sdk/node';
import { z } from 'zod';

const sdkTools = createSdkMcpServer({
  name: 'sdk-tools',
  tools: [
    tool(
      'favorite_number',
      'Returns a favorite number for a person',
      { name: z.string() },
      ({ name }) => `${name}'s favorite number is 42.`
    ),
  ],
});

const session = await createSession({
  mcpServers: [sdkTools],
  // Not the focus of this example, but required: without a handler every
  // permission request resolves to Cancel, so a tool needing approval would
  // never run.
  permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
});

try {
  for await (const msg of session.stream(
    'Use the favorite_number tool for Ada and tell me the answer.'
  )) {
    if (msg.type === DroidMessageType.ToolCall) {
      console.log(`[tool call] ${msg.name}`);
    }
    if (msg.type === DroidMessageType.Assistant) {
      console.log(msg.text);
    }
  }
} finally {
  await session.close();
}
