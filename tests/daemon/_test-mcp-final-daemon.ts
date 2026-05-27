import { z } from 'zod';
import { _resetDaemonStateForTesting } from '../../src/daemon/local.js';
import {
  connectDaemon,
  createSdkMcpServer,
  DroidMessageType,
  tool,
  ToolConfirmationOutcome,
} from '../../src/index.js';

async function main() {
  _resetDaemonStateForTesting();

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

  console.log('=== DAEMON MODE MCP TEST (bare droid-dev) ===\n');

  const connection = await connectDaemon();
  const session = await connection.createSession({
    cwd: process.cwd(),
    mcpServers: [server],
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });

  console.log(`Session: ${session.sessionId}\n`);

  let toolCalled = false;
  let toolResult = '';
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
    }
    if (msg.type === DroidMessageType.Result) console.log('[Result] done');
  }

  await session.close();
  await connection.close();

  console.log('\n=== RESULTS ===');
  console.log(`Tool called: ${toolCalled}`);
  console.log(
    `Tool result contains 'user #42': ${toolResult.includes('user #42')}`
  );

  if (!toolCalled) {
    console.log('\nFAILED');
    process.exit(1);
  }
  console.log('\nPASSED');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
