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

  // Start the MCP server manually to inspect
  const config = await server.start();
  console.log('MCP server config:', JSON.stringify(config, null, 2));

  // Test the MCP server directly with a tools/list request
  const testUrl = (config as { url: string }).url;
  console.log('\nTesting MCP server at:', testUrl);

  const initPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
    id: 1,
  });

  const initRes = await fetch(testUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: initPayload,
  });
  console.log('Initialize response status:', initRes.status);
  const initBody = await initRes.text();
  console.log('Initialize response:', initBody.slice(0, 500));

  // Now list tools
  const listPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2,
  });

  const listRes = await fetch(testUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: listPayload,
  });
  console.log('\nTools/list response status:', listRes.status);
  const listBody = await listRes.text();
  console.log('Tools/list response:', listBody.slice(0, 500));

  // Now actually test through daemon
  console.log('\n--- Now testing through daemon ---');

  // Close the manually started server since connectDaemon/createSession will start its own
  await server.close();

  // Recreate the server
  const server2 = createSdkMcpServer({
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

  console.log('Connecting to daemon...');
  const conn = await connectDaemon();
  console.log('Connected. Creating session...');
  const session = await conn.createSession({
    cwd: process.cwd(),
    mcpServers: [server2],
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
