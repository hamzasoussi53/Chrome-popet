import { WebSocketBridge } from './websocket-bridge.js';

class MCPServer {
  private bridge: WebSocketBridge;
  private initialized = false;
  private msgId = 0;

  constructor() {
    const port = parseInt(process.env.CHROME_WEASEL_WS_PORT || '9876', 10);
    this.bridge = new WebSocketBridge(port);
  }

  async start(): Promise<void> {
    process.stdin.setEncoding('utf-8');
    let buffer = '';

    // Graceful shutdown
    const shutdown = () => {
      this.bridge.close();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          try {
            this.handleMessage(JSON.parse(line));
          } catch (e) {
            // Ignore malformed JSON
          }
        }
      }
    });

    process.stdin.on('end', () => {
      shutdown();
    });
  }

  private getTools(): any[] {
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
      },
      {
        name: 'reload_extension',
        description: 'Reload the chrome-weasel extension (calls chrome.runtime.reload()). Use this after updating service-worker.js.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'chat_agent_interact',
        description: 'Send a message to an AI chat agent (e.g., ChatGPT) and wait for the response to finish generating',
        inputSchema: {
          type: 'object',
          properties: {
            tabId: { type: 'number' },
            message: { type: 'string' },
            promptSelector: { type: 'string' },
            sendSelector: { type: 'string' },
            responseSelector: { type: 'string' },
            timeout: { type: 'number' }
          },
          required: ['tabId', 'message']
        }
      }
    ];
  }

  private async handleMessage(msg: any): Promise<void> {
    try {
      let result: any;

      switch (msg.method) {
        case 'initialize':
          this.initialized = true;
          result = {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'chrome-weasel', version: '1.0.0' }
          };
          break;

        case 'notifications/initialized':
          // Acknowledged — no response needed for notifications
          return;

        case 'tools/list':
          if (!this.initialized) throw new Error('Server not initialized yet');
          result = { tools: this.getTools() };
          break;

        case 'tools/call':
          if (!this.initialized) throw new Error('Server not initialized yet');
          result = await this.executeTool(msg.params);
          break;

        default:
          throw new Error(`Unknown method: ${msg.method}`);
      }

      this.sendResponse({ jsonrpc: '2.0', result, id: msg.id });
    } catch (error: any) {
      this.sendResponse({
        jsonrpc: '2.0',
        error: { code: -1, message: error.message },
        id: msg.id
      });
    }
  }

  private async executeTool(params: any): Promise<any> {
    const { name, arguments: args } = params;
    const response = await this.bridge.send({
      type: `tool:${name}`,
      payload: args || {},
      id: (++this.msgId).toString()
    });
    return response;
  }

  private sendResponse(response: any): void {
    const json = JSON.stringify(response);
    process.stdout.write(json + '\n');
  }
}

const server = new MCPServer();
server.start();
