/**
 * External MCP server example.
 *
 * Connects an HTTP MCP server to one Node session, then lists its status and
 * discovered tools.
 *
 * Usage:
 *   MCP_SERVER_URL=https://example.com/mcp \
 *     npx tsx examples/node/external-mcp.ts
 */

import { createSession } from '@factory/droid-sdk/node';

const url = process.env.MCP_SERVER_URL;
if (!url) {
  throw new Error('Set MCP_SERVER_URL to an HTTP MCP endpoint.');
}

const token = process.env.MCP_SERVER_TOKEN;
const session = await createSession({
  mcpServers: [
    {
      name: 'external',
      type: 'http',
      url,
      headers: token
        ? [{ name: 'Authorization', value: `Bearer ${token}` }]
        : [],
    },
  ],
});

try {
  const { servers } = await session.listMcpServers();
  const tools = await session.listMcpTools();
  const server = servers.find((item) => item.name === 'external');

  console.log(`status: ${server?.status ?? 'unknown'}`);

  for (const tool of tools.filter((item) => item.serverName === 'external')) {
    console.log(tool.name);
  }
} finally {
  await session.close();
}
