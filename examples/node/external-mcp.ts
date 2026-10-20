/**
 * External MCP server example.
 *
 * Connects an HTTP MCP server to one Node session and lists its tools.
 * Set MCP_SERVER_TOKEN if the endpoint needs a bearer token.
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
  const tools = await session.listMcpTools();
  const externalTools = tools.filter((item) => item.serverName === 'external');

  if (externalTools.length === 0) {
    throw new Error(
      'No external tools found. Check MCP_SERVER_URL and authentication.'
    );
  }

  for (const tool of externalTools) {
    console.log(tool.name);
  }
} finally {
  await session.close();
}
