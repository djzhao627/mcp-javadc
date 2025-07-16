#!/usr/bin/env node

import { DecompilerService } from './src/services/DecompilerService.js';
import { createMcpServer, startServer } from './src/server/mcpServer.js';

async function main() {
  try {
    // Initialize the decompiler service
    const decompilerService = new DecompilerService();

    // Create and configure the MCP server
    const server = createMcpServer(decompilerService);

    // Start the server
    await startServer(server);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
