import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSdkMcpServer, startSdkMcpServers, tool } from '../src/mcp.js';
import { McpServerType } from '../src/schemas/index.js';

describe('SDK MCP helpers', () => {
  it('serves SDK tools over a loopback MCP HTTP server', async () => {
    const sdkServer = createSdkMcpServer({
      name: 'test-sdk-tools',
      tools: [
        tool(
          'greet',
          'Greets a person',
          { name: z.string() },
          async ({ name }) => `Hello, ${name}!`
        ),
      ],
    });

    const { mcpServers, cleanup } = await startSdkMcpServers([sdkServer]);
    const client = new Client({ name: 'test-client', version: '1.0.0' });

    try {
      expect(mcpServers).toHaveLength(1);
      expect(mcpServers?.[0]).toMatchObject({
        type: McpServerType.Http,
        name: 'test-sdk-tools',
      });

      const serverConfig = mcpServers?.[0];
      if (
        !serverConfig ||
        !('type' in serverConfig) ||
        serverConfig.type !== McpServerType.Http
      ) {
        throw new Error('Expected HTTP MCP server config');
      }
      const url = serverConfig.url;
      expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);

      await client.connect(new StreamableHTTPClientTransport(new URL(url)));

      const tools = await client.listTools();
      expect(tools.tools.map((listedTool) => listedTool.name)).toContain(
        'greet'
      );

      const result = await client.callTool({
        name: 'greet',
        arguments: { name: 'Ada' },
      });
      expect(result.content).toEqual([{ type: 'text', text: 'Hello, Ada!' }]);
    } finally {
      await client.close();
      await cleanup();
    }
  });
});
