import { z } from 'zod';
import {
  createSession,
  createSdkMcpServer,
  DroidMessageType,
  tool,
  ToolConfirmationOutcome,
} from '../../src/index.js';

async function main() {
  const server = createSdkMcpServer({
    name: 'my-tools',
    tools: [
      tool(
        'lookup',
        'Look up a user by name',
        { name: z.string() },
        ({ name }) => `${name} is user #42.`
      ),
    ],
  });

  console.log('=== EXEC MODE MCP TOOL TEST ===\n');
  console.log('Creating exec-mode session with MCP server...');

  const session = await createSession({
    cwd: process.cwd(),
    execPath: 'droid-dev',
    mcpServers: [server],
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });

  console.log('Session created, streaming...\n');

  let toolCalled = false;
  let toolResult = '';
  let assistantText = '';

  for await (const msg of session.stream(
    'Use the lookup tool to look up Alice. You MUST call the lookup tool.'
  )) {
    if (msg.type === DroidMessageType.ToolCall) {
      console.log(
        '[ToolCall]',
        msg.toolUse.name,
        JSON.stringify(msg.toolUse.input)
      );
      toolCalled = true;
    }
    if (msg.type === DroidMessageType.ToolResult) {
      console.log('[ToolResult]', msg.content.slice(0, 200));
      toolResult =
        typeof msg.content === 'string'
          ? msg.content
          : JSON.stringify(msg.content);
    }
    if (msg.type === DroidMessageType.Assistant) {
      console.log('[Assistant]', msg.text.slice(0, 300));
      assistantText += msg.text;
    }
    if (msg.type === DroidMessageType.Result) {
      console.log('[Result] done');
    }
  }

  await session.close();

  console.log('\n=== RESULTS ===');
  console.log(`Tool called: ${toolCalled}`);
  console.log(
    `Tool result contains 'user #42': ${toolResult.includes('user #42')}`
  );
  console.log(
    `Assistant mentioned Alice: ${assistantText.toLowerCase().includes('alice')}`
  );

  if (!toolCalled) {
    console.log('\nFAILED: lookup tool was NOT called');
    process.exit(1);
  }
  console.log('\nPASSED: lookup tool was called successfully');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
