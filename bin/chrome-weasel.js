#!/usr/bin/env node

// chrome-weasel MCP Server
// Starts the MCP server (stdio for OpenCode) + WebSocket server (for extension)

console.error('[chrome-weasel] Starting MCP server on stdio, WebSocket on port 9876');
require('../dist/mcp-server.js');
