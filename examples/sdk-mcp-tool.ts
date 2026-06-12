/**
 * SDK-defined MCP tool example.
 *
 * Demonstrates `createSdkMcpServer()` and `tool()`: registers an
 * in-process MCP tool, asks the model to call it, and prints the tool
 * call, tool result, and final assistant answer. The permission
 * handler approves the MCP tool call and logs anything else it sees.
 *
 * Usage:
 *   npx tsx examples/sdk-mcp-tool.ts
 *
 * Requirements: droid CLI installed and logged in. FACTORY_API_KEY is
 * optional; stored CLI credentials are used when it is unset. Set
 * DROID_EXEC_PATH to point at a specific droid executable.
 */

import {
  DroidMessageType,
  ToolConfirmationOutcome,
  createSession,
  createSdkMcpServer,
  tool,
} from '@factory/droid-sdk';
import { z } from 'zod';

const execPath = process.env['DROID_EXEC_PATH'] ?? 'droid';

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
  apiKey: process.env.FACTORY_API_KEY!,
  execPath,
  mcpServers: [sdkTools],
  cwd: process.cwd(),
  permissionHandler(params) {
    for (const item of params.toolUses) {
      console.log(`[Permission] ${item.toolUse.name} -> proceed_once`);
    }
    return ToolConfirmationOutcome.ProceedOnce;
  },
});

try {
  for await (const msg of session.stream(
    'Use the favorite_number tool for Ada and tell me the answer.'
  )) {
    switch (msg.type) {
      case DroidMessageType.ToolCall:
        console.log(`[Tool Call] ${msg.toolUse.name}`);
        break;

      case DroidMessageType.ToolResult:
        console.log(
          `[Tool Result] ${msg.toolName}: ${
            msg.isError ? 'Error' : JSON.stringify(msg.content)
          }`
        );
        break;

      case DroidMessageType.Assistant:
        if (msg.text.trim()) {
          console.log(`[Assistant] ${msg.text.trim()}`);
        }
        break;

      case DroidMessageType.Result:
        console.log('--- Turn complete ---');
        break;
    }
  }
} finally {
  await session.close();
}
