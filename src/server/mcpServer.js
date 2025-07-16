import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { tools } from './mcpToolsConfig.js';
import { createRequestHandlers } from './mcpRequestHandlers.js';
import { SERVER_NAME, PACKAGE_VERSION } from '../utils/constants.js';

export function createMcpServer(decompilerService) {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: PACKAGE_VERSION,
      description: 'MCP server for decompiling Java class files',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Set up tools list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  // Set up tool call handler
  const requestHandlers = createRequestHandlers(decompilerService);

  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name: tool, arguments: args } = request.params;

    const handler = requestHandlers[tool];
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Error: Unknown tool ${tool}` }],
      };
    }

    return await handler(args);
  });

  return server;
}

export async function startServer(server) {
  try {
    console.error(`
---------------------------------------------
MCP Java Decompiler Server v${PACKAGE_VERSION}
---------------------------------------------
Model Context Protocol (MCP) server that
decompiles Java bytecode into readable source
---------------------------------------------
`);

    console.error('Starting in stdio mode...');
    console.error('Use this mode when connecting through an MCP client');

    const transport = new StdioServerTransport();

    await server.connect(transport);

    console.error('MCP Java Decompiler server running on stdio');

    process.on('SIGINT', () => {
      console.error('\nShutting down MCP Java Decompiler server...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.error('\nShutting down MCP Java Decompiler server...');
      process.exit(0);
    });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}
