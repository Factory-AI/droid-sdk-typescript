import { z } from 'zod';
import { createSdkMcpServer, tool } from '../../src/index.js';

async function main() {
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
  const config = await server.start();
  const configUrl = (config as { url: string }).url;
  console.log('MCP server at:', configUrl);

  // Test WITHOUT Accept header (this is likely what the daemon sends)
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

  console.log('\n--- Test WITHOUT Accept header ---');
  const res1 = await fetch(configUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: initPayload,
  });
  console.log('Status:', res1.status);
  const body1 = await res1.text();
  console.log('Response:', body1.slice(0, 500));

  console.log('\n--- Test WITH Accept header ---');
  const res2 = await fetch(configUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: initPayload,
  });
  console.log('Status:', res2.status);
  const body2 = await res2.text();
  console.log('Response:', body2.slice(0, 500));

  // Now test tools/list with proper headers
  console.log('\n--- Tools list WITH Accept header ---');
  const listPayload = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/list',
    params: {},
    id: 2,
  });
  const res3 = await fetch(configUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: listPayload,
  });
  console.log('Status:', res3.status);
  const body3 = await res3.text();
  console.log('Tools response:', body3);

  await server.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
