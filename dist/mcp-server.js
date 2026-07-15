"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const websocket_bridge_js_1 = require("./websocket-bridge.js");
class MCPServer {
    bridge;
    constructor() {
        this.bridge = new websocket_bridge_js_1.WebSocketBridge(9876);
    }
    async start() {
        process.stdin.setEncoding('utf-8');
        let buffer = '';
        process.stdin.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        this.handleMessage(JSON.parse(line));
                    }
                    catch (e) {
                        // Ignore malformed JSON
                    }
                }
            }
        });
        process.stdin.on('end', () => {
            this.bridge.close();
            process.exit(0);
        });
    }
    getTools() {
        return [
            {
                name: 'list_tabs',
                description: 'List all open Chrome tabs',
                inputSchema: { type: 'object', properties: {} }
            },
            {
                name: 'open_tab',
                description: 'Open a new tab with a URL',
                inputSchema: {
                    type: 'object',
                    properties: { url: { type: 'string' } },
                    required: ['url']
                }
            },
            {
                name: 'close_tab',
                description: 'Close a tab by ID',
                inputSchema: {
                    type: 'object',
                    properties: { tabId: { type: 'number' } },
                    required: ['tabId']
                }
            },
            {
                name: 'focus_tab',
                description: 'Focus a tab by ID',
                inputSchema: {
                    type: 'object',
                    properties: { tabId: { type: 'number' } },
                    required: ['tabId']
                }
            },
            {
                name: 'read_page',
                description: 'Read page content as HTML or text',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tabId: { type: 'number' },
                        format: { type: 'string', enum: ['html', 'text'] }
                    },
                    required: ['tabId', 'format']
                }
            },
            {
                name: 'click_element',
                description: 'Click an element by CSS selector, XPath, or text content',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tabId: { type: 'number' },
                        selector: { type: 'string' },
                        by: { type: 'string', enum: ['css', 'xpath', 'text'] }
                    },
                    required: ['tabId', 'selector']
                }
            },
            {
                name: 'fill_form',
                description: 'Fill a form field with a value',
                inputSchema: {
                    type: 'object',
                    properties: {
                        tabId: { type: 'number' },
                        selector: { type: 'string' },
                        value: { type: 'string' },
                        by: { type: 'string', enum: ['css', 'xpath', 'text'] }
                    },
                    required: ['tabId', 'selector', 'value']
                }
            }
        ];
    }
    async handleMessage(msg) {
        try {
            let result;
            switch (msg.method) {
                case 'tools/list':
                    result = { tools: this.getTools() };
                    break;
                case 'tools/call':
                    result = await this.executeTool(msg.params);
                    break;
                case 'initialize':
                    result = {
                        protocolVersion: '2024-11-05',
                        capabilities: { tools: {} },
                        serverInfo: { name: 'chrome-weasel', version: '1.0.0' }
                    };
                    break;
                default:
                    throw new Error(`Unknown method: ${msg.method}`);
            }
            this.sendResponse({ jsonrpc: '2.0', result, id: msg.id });
        }
        catch (error) {
            this.sendResponse({
                jsonrpc: '2.0',
                error: { code: -1, message: error.message },
                id: msg.id
            });
        }
    }
    async executeTool(params) {
        const { name, arguments: args } = params;
        const response = await this.bridge.send({
            type: `tool:${name}`,
            payload: args || {},
            id: Date.now().toString()
        });
        return response;
    }
    sendResponse(response) {
        const json = JSON.stringify(response);
        process.stdout.write(json + '\n');
    }
}
const server = new MCPServer();
server.start();
