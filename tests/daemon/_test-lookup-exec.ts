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

  console.log('Creating exec-mode session with MCP server...');

  const session = await createSession({
    cwd: process.cwd(),
    mcpServers: [server],
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });

  console.log('Session created, streaming...');

  for await (const msg of session.stream(
    'Use the lookup tool to look up Alice.'
  )) {
    if (msg.type === DroidMessageType.ToolCall)
      console.log(
        '[ToolCall]',
        msg.toolUse.name,
        JSON.stringify(msg.toolUse.input)
      );
    if (msg.type === DroidMessageType.ToolResult)
      console.log('[ToolResult]', msg.content.slice(0, 200));
    if (msg.type === DroidMessageType.Assistant)
      console.log('[Assistant]', msg.text.slice(0, 300));
    if (msg.type === DroidMessageType.Result) console.log('[Result] done');
  }

  await session.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
