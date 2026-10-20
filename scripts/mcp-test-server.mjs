/**
 * Minimal streamable-HTTP MCP server for the example harness.
 *
 * Answers JSON-RPC over POST with plain JSON responses (no SSE, no session
 * IDs), which the streamable-HTTP transport permits. It exposes two tools and
 * rejects requests without the expected bearer token, so a run proves that
 * `external-mcp.ts` sends `MCP_SERVER_TOKEN`.
 *
 * Usage:
 *   node scripts/mcp-test-server.mjs [port] [token]
 */

import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

export const MCP_TEST_TOOLS = [
  {
    name: 'harness_echo',
    description: 'Echoes the given text.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'harness_add',
    description: 'Adds two numbers.',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
  },
];

function handleRpc(message) {
  const { id, method, params } = message;
  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? '2025-03-26',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'droid-sdk-harness', version: '1.0.0' },
        },
      };
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: MCP_TEST_TOOLS } };
    case 'tools/call': {
      const args = params?.arguments ?? {};
      const text =
        params?.name === 'harness_add'
          ? String(Number(args.a) + Number(args.b))
          : String(args.text ?? '');
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text }] },
      };
    }
    default:
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

export async function startMcpTestServer({ port = 0, token } = {}) {
  const stats = { requests: 0, authorized: 0, unauthorized: 0, methods: [] };

  const server = createServer((req, res) => {
    stats.requests++;
    if (token && req.headers.authorization !== `Bearer ${token}`) {
      stats.unauthorized++;
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
    stats.authorized++;

    if (req.method !== 'POST') {
      // No server-initiated SSE stream and no sessions to delete.
      res.writeHead(405, { allow: 'POST' });
      res.end();
      return;
    }

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: null,
            error: { code: -32700, message: 'Parse error' },
          })
        );
        return;
      }

      const messages = Array.isArray(payload) ? payload : [payload];
      const responses = [];
      for (const message of messages) {
        if (typeof message?.method === 'string')
          stats.methods.push(message.method);
        // Notifications and client responses carry no reply.
        if (message?.id === undefined || message?.id === null) continue;
        if (typeof message.method !== 'string') continue;
        responses.push(handleRpc(message));
      }

      if (responses.length === 0) {
        res.writeHead(202);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(Array.isArray(payload) ? responses : responses[0])
      );
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/mcp`;

  return {
    url,
    stats,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2] ?? 0);
  const token = process.argv[3];
  const { url } = await startMcpTestServer({ port, token });
  console.log(`MCP test server listening on ${url}`);
}
