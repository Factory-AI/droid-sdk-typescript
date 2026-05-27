import { z } from 'zod';
import { buildInitParams } from '../../src/helpers.js';
import {
  connectDaemon,
  createSdkMcpServer,
  DroidMessageType,
  tool,
  ToolConfirmationOutcome,
} from '../../src/index.js';
import { startSdkMcpServers } from '../../src/mcp.js';

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

  // Debug: manually start the MCP server and inspect what gets sent
  const started = await startSdkMcpServers([server]);
  console.log(
    'Started MCP servers:',
    JSON.stringify(started.mcpServers, null, 2)
  );

  const initParams = buildInitParams({
    cwd: process.cwd(),
    mcpServers: started.mcpServers,
  });
  console.log(
    'Init params mcpServers:',
    JSON.stringify(initParams.mcpServers, null, 2)
  );

  // Now test the actual tool via HTTP to make sure it works
  const mcpConfig = started.mcpServers![0] as { url: string };
  const mcpUrl = mcpConfig.url;
  console.log('MCP URL:', mcpUrl);

  // Send tools/list request
  const listResp = await fetch(mcpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: '1',
    }),
  });
  const listBody = await listResp.text();
  console.log('tools/list response:', listBody);

  // Send tools/call request
  const callResp = await fetch(mcpUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tools/call',
      id: '2',
      params: { name: 'lookup', arguments: { name: 'Alice' } },
    }),
  });
  const callBody = await callResp.text();
  console.log('tools/call response:', callBody);

  // Now test via daemon
  const connection = await connectDaemon();
  const session = await connection.createSession({
    cwd: process.cwd(),
    mcpServers: [server],
    permissionHandler: () => ToolConfirmationOutcome.ProceedOnce,
  });

  console.log('\nSession created:', session.sessionId);

  for await (const msg of session.stream(
    "Use the lookup tool to look up Alice. The tool is called 'lookup' and takes a 'name' parameter."
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

  await started.cleanup();
  await session.close();
  await connection.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
