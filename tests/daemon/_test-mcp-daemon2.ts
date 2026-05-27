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
        ({ name }) => name + ' is user #42.'
      ),
    ],
  });

  console.log('Connecting...');
  const conn = await connectDaemon();
  console.log('Creating session...');
  const session = await conn.createSession({
    cwd: process.cwd(),
    mcpServers: [server],
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });
  console.log('Session:', session.sessionId);

  for await (const msg of session.stream(
    'Use the lookup tool to look up Alice. You MUST call the lookup tool.'
  )) {
    if (msg.type === DroidMessageType.ToolCall)
      console.log(
        '[ToolCall]',
        msg.toolUse.name,
        JSON.stringify(msg.toolUse.input)
      );
    if (msg.type === DroidMessageType.ToolResult)
      console.log('[ToolResult]', msg.content?.slice(0, 200));
    if (msg.type === DroidMessageType.Assistant)
      console.log('[Assistant]', msg.text?.slice(0, 200));
    if (msg.type === DroidMessageType.Result) console.log('[Result] done');
  }

  await session.close();
  await conn.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
