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
  ToolConfirmationType,
  createSession,
  createSdkMcpServer,
  tool,
} from '@factory/droid-sdk/node';
import { z } from 'zod';

let toolCalled = false;
const sdkTools = createSdkMcpServer({
  name: 'sdk-tools',
  tools: [
    tool(
      'favorite_number',
      'Returns a favorite number for a person',
      { name: z.string() },
      ({ name }) => {
        toolCalled = true;
        return `${name}'s favorite number is 42.`;
      }
    ),
  ],
});

const session = await createSession({
  mcpServers: [sdkTools],
  // Without a handler every permission request resolves to Cancel, so a tool
  // that needs approval never runs. This handler approves only
  // favorite_number. A tool with the `readOnlyHint: true` annotation skips the
  // prompt at Low autonomy or above.
  permissionHandler({ toolUses, options }) {
    // A Script request batches tool calls; see permission-handler.ts.
    const confirmations = toolUses.flatMap(({ details }) =>
      details.type === ToolConfirmationType.Script
        ? details.calls.map((call) => call.confirmation)
        : [details]
    );
    const onlyFavoriteNumber =
      confirmations.length > 0 &&
      confirmations.every(
        (details) =>
          details.type === ToolConfirmationType.McpTool &&
          (details.actualToolName ?? details.toolName).endsWith(
            'favorite_number'
          )
      );
    const outcome = onlyFavoriteNumber
      ? ToolConfirmationOutcome.ProceedOnce
      : ToolConfirmationOutcome.Cancel;
    if (!options.some((option) => option.value === outcome)) {
      throw new Error(`Outcome not offered: ${outcome}`);
    }
    return outcome;
  },
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
    if (msg.type === DroidMessageType.Result && !msg.success) {
      throw new Error(msg.error?.message ?? `Turn ended: ${msg.subtype}`);
    }
  }
  if (!toolCalled) {
    throw new Error('The turn finished without calling favorite_number.');
  }
} finally {
  await session.close();
}
