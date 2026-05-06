import { once } from 'node:events';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import type { McpServerConfig } from './schemas/client.js';
import { JSONRPC_VERSION } from './schemas/constants.js';
import { JsonRpcErrorCode, McpServerType } from './schemas/enums.js';

type ToolInputShape = Record<string, z.ZodTypeAny>;

export type DroidToolResult = string | CallToolResult;

export interface DroidTool {
  name: string;
  description?: string;
  inputSchema?: ToolInputShape;
  handler: (
    input: Record<string, unknown>
  ) => DroidToolResult | Promise<DroidToolResult>;
}

export interface SdkMcpServerOptions {
  name: string;
  version?: string;
  tools: DroidTool[];
}

export type DroidMcpServerConfig = McpServerConfig | SdkMcpServer;

export function tool<InputShape extends ToolInputShape>(
  name: string,
  description: string,
  inputSchema: InputShape,
  handler: (
    input: z.infer<z.ZodObject<InputShape>>
  ) => DroidToolResult | Promise<DroidToolResult>
): DroidTool;
export function tool(
  name: string,
  description: string,
  handler: DroidTool['handler']
): DroidTool;
export function tool<InputShape extends ToolInputShape>(
  name: string,
  description: string,
  inputSchemaOrHandler:
    | InputShape
    | ((
        input: Record<string, unknown>
      ) => DroidToolResult | Promise<DroidToolResult>),
  handler?: (
    input: z.infer<z.ZodObject<InputShape>>
  ) => DroidToolResult | Promise<DroidToolResult>
): DroidTool {
  if (typeof inputSchemaOrHandler === 'function') {
    const actualHandler = inputSchemaOrHandler;
    return {
      name,
      description,
      handler: (input) => actualHandler(input),
    };
  }

  if (!handler) {
    throw new Error(`Missing handler for SDK MCP tool "${name}"`);
  }

  const inputObjectSchema = z.object(inputSchemaOrHandler);

  return {
    name,
    description,
    inputSchema: inputSchemaOrHandler,
    handler: (input) => handler(inputObjectSchema.parse(input)),
  };
}

function isSdkMcpServer(server: DroidMcpServerConfig): server is SdkMcpServer {
  return server instanceof SdkMcpServer;
}

function toCallToolResult(result: DroidToolResult): CallToolResult {
  if (typeof result === 'string') {
    return {
      content: [{ type: 'text', text: result }],
    };
  }

  return result;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function writeJsonError(
  res: ServerResponse,
  statusCode: number,
  message: string
): void {
  if (res.headersSent) {
    return;
  }

  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      jsonrpc: JSONRPC_VERSION,
      error: { code: JsonRpcErrorCode.INTERNAL_ERROR, message },
      id: null,
    })
  );
}

export class SdkMcpServer {
  readonly name: string;
  readonly version: string;
  readonly tools: DroidTool[];

  private _httpServer: http.Server | null = null;
  private _url: string | null = null;

  constructor(options: SdkMcpServerOptions) {
    this.name = options.name;
    this.version = options.version ?? '1.0.0';
    this.tools = options.tools;
  }

  get config(): McpServerConfig | null {
    if (!this._url) {
      return null;
    }

    return {
      type: McpServerType.Http,
      name: this.name,
      url: this._url,
      headers: [],
    };
  }

  async start(): Promise<McpServerConfig> {
    if (this.config) {
      return this.config;
    }

    this._httpServer = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this._httpServer.listen(0, '127.0.0.1');
    await once(this._httpServer, 'listening');

    const address = this._httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Unable to determine SDK MCP server address');
    }

    this._url = `http://127.0.0.1:${address.port}/mcp`;
    const config = this.config;
    if (!config) {
      throw new Error('Unable to start SDK MCP server');
    }
    return config;
  }

  async close(): Promise<void> {
    const server = this._httpServer;
    this._httpServer = null;
    this._url = null;

    if (!server) {
      return;
    }

    server.closeAllConnections?.();
    server.close();
    await once(server, 'close');
  }

  private createMcpServer(): McpServer {
    const server = new McpServer({
      name: this.name,
      version: this.version,
    });

    for (const sdkTool of this.tools) {
      server.registerTool(
        sdkTool.name,
        {
          description: sdkTool.description,
          ...(sdkTool.inputSchema && {
            inputSchema: sdkTool.inputSchema,
          }),
        },
        async (input: Record<string, unknown>) =>
          toCallToolResult(await sdkTool.handler(input))
      );
    }

    return server;
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    const server = this.createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    try {
      const body = await readJsonBody(req);
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (error) {
      writeJsonError(
        res,
        500,
        error instanceof Error ? error.message : 'Internal server error'
      );
      await transport.close();
      await server.close();
    }
  }
}

export function createSdkMcpServer(options: SdkMcpServerOptions): SdkMcpServer {
  return new SdkMcpServer(options);
}

export async function startSdkMcpServers(
  servers: DroidMcpServerConfig[] | undefined
): Promise<{ mcpServers?: McpServerConfig[]; cleanup: () => Promise<void> }> {
  if (!servers) {
    return { cleanup: async () => {} };
  }

  const startedServers: SdkMcpServer[] = [];
  const mcpServers: McpServerConfig[] = [];

  try {
    for (const server of servers) {
      if (isSdkMcpServer(server)) {
        mcpServers.push(await server.start());
        startedServers.push(server);
      } else {
        mcpServers.push(server);
      }
    }
  } catch (error) {
    await Promise.all(startedServers.map((server) => server.close()));
    throw error;
  }

  return {
    mcpServers,
    cleanup: async () => {
      await Promise.all(startedServers.map((server) => server.close()));
    },
  };
}
