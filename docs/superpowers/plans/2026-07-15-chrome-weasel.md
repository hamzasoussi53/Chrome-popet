# chrome-weasel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server (`chrome-weasel`) that gives AI agents full control over Chrome — open/close tabs, list tabs, read page content, click elements, and fill forms.

**Architecture:** Node.js MCP server (stdio transport for OpenCode) + WebSocket server (for Chrome extension). The extension connects to the WebSocket server and executes Chrome API calls. No native messaging needed.

**Tech Stack:** TypeScript (MCP server), JavaScript (extension), Chrome Extension Manifest V3, WebSocket (`ws`)

---

## File Structure

```
chrome-weasel/
├── package.json
├── tsconfig.json
├── bin/
│   └── chrome-weasel.js
├── src/
│   ├── types.ts
│   ├── websocket-bridge.ts
│   └── mcp-server.ts
├── extension/
│   ├── manifest.json
│   └── service-worker.js
└── README.md
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: directories `bin/`, `src/`, `extension/`

- [ ] **Step 1: Create directory structure**

Run:
```bash
cd /Users/soussihamza/GitHub/Chrome-popet
mkdir -p bin src extension
```

- [ ] **Step 2: Create `package.json`**

Create file `package.json`:
```json
{
  "name": "chrome-weasel",
  "version": "1.0.0",
  "description": "MCP server for full Chrome browser control via AI agents",
  "main": "dist/mcp-server.js",
  "bin": {
    "chrome-weasel": "bin/chrome-weasel.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/ws": "^8.5.10",
    "typescript": "^5.3.0"
  },
  "keywords": ["mcp", "chrome", "browser", "ai", "automation"],
  "license": "MIT",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

Create file `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Install dependencies**

Run:
```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json package-lock.json
git commit -m "chore: project scaffolding with ws dependency"
```

---

## Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

Create file `src/types.ts`:
```typescript
export interface Tab {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export interface BridgeMessage {
  type: string;
  payload: any;
  id: string;
}

export interface BridgeResponse {
  type: string;
  payload: any;
  id: string;
  error?: string;
}

export interface ClickElementInput {
  tabId: number;
  selector: string;
  by?: 'css' | 'xpath' | 'text';
}

export interface FillFormInput {
  tabId: number;
  selector: string;
  value: string;
  by?: 'css' | 'xpath' | 'text';
}

export interface ReadPageInput {
  tabId: number;
  format: 'html' | 'text';
}

export interface OpenTabInput {
  url: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types"
```

---

## Task 3: WebSocket Bridge Server

**Files:**
- Create: `src/websocket-bridge.ts`

- [ ] **Step 1: Create `src/websocket-bridge.ts`**

Create file `src/websocket-bridge.ts`:
```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { BridgeMessage, BridgeResponse } from './types.js';

export class WebSocketBridge {
  private wss: WebSocketServer;
  private extension: WebSocket | null = null;
  private pending: Map<string, { resolve: Function; reject: Function }> = new Map();
  public port: number;

  constructor(port: number = 9876) {
    this.port = port;
    this.wss = new WebSocketServer({ port: this.port });
    this.wss.on('connection', (ws) => {
      console.error(`[chrome-weasel] Extension connected on port ${this.port}`);
      this.extension = ws;

      ws.on('message', (data) => {
        try {
          const response: BridgeResponse = JSON.parse(data.toString());
          const pending = this.pending.get(response.id);
          if (pending) {
            this.pending.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error));
            } else {
              pending.resolve(response.payload);
            }
          }
        } catch (e) {
          console.error('[chrome-weasel] Invalid message from extension:', e);
        }
      });

      ws.on('close', () => {
        console.error('[chrome-weasel] Extension disconnected');
        this.extension = null;
      });

      ws.on('error', (err) => {
        console.error('[chrome-weasel] Extension WebSocket error:', err);
        this.extension = null;
      });
    });

    this.wss.on('error', (err) => {
      console.error('[chrome-weasel] WebSocket server error:', err);
    });
  }

  async send(message: BridgeMessage): Promise<any> {
    if (!this.extension) {
      throw new Error('Extension not connected. Make sure the chrome-weasel extension is loaded in Chrome.');
    }

    return new Promise((resolve, reject) => {
      this.pending.set(message.id, { resolve, reject });

      const timeout = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`Timeout waiting for extension response to ${message.type}`));
      }, 30000);

      const originalResolve = resolve;
      this.pending.set(message.id, {
        resolve: (val: any) => {
          clearTimeout(timeout);
          originalResolve(val);
        },
        reject: (err: any) => {
          clearTimeout(timeout);
          reject(err);
        }
      });

      this.extension!.send(JSON.stringify(message));
    });
  }

  close(): void {
    this.wss.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/websocket-bridge.ts
git commit -m "feat: add WebSocket bridge server for extension communication"
```

---

## Task 4: MCP Server

**Files:**
- Create: `src/mcp-server.ts`

- [ ] **Step 1: Create `src/mcp-server.ts`**

Create file `src/mcp-server.ts`:
```typescript
import { WebSocketBridge } from './websocket-bridge.js';

class MCPServer {
  private bridge: WebSocketBridge;

  constructor() {
    this.bridge = new WebSocketBridge(9876);
  }

  async start(): Promise<void> {
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
          } catch (e) {
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
      }
    ];
  }

  private async handleMessage(msg: any): Promise<void> {
    try {
      let result: any;

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
      id: Date.now().toString()
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
```

- [ ] **Step 2: Commit**

```bash
git add src/mcp-server.ts
git commit -m "feat: add MCP server with all 7 tools and WebSocket bridge"
```

---

## Task 5: Chrome Extension — Manifest & Service Worker

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/service-worker.js`

- [ ] **Step 1: Create `extension/manifest.json`**

Create file `extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "chrome-weasel",
  "version": "1.0.0",
  "description": "MCP server bridge for Chrome browser control",
  "permissions": [
    "tabs",
    "scripting",
    "activeTab"
  ],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "service-worker.js"
  }
}
```

- [ ] **Step 2: Create `extension/service-worker.js`**

Create file `extension/service-worker.js`:
```javascript
const WS_PORT = 9876;
let ws = null;
let reconnectTimer = null;

function connect() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(`ws://localhost:${WS_PORT}`);

  ws.onopen = () => {
    console.log('[chrome-weasel] Connected to MCP server');
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = async (event) => {
    try {
      const msg = JSON.parse(event.data);
      const result = await handleToolCall(msg);
      ws.send(JSON.stringify(result));
    } catch (error) {
      console.error('[chrome-weasel] Error handling message:', error);
    }
  };

  ws.onclose = () => {
    console.log('[chrome-weasel] Disconnected, retrying...');
    ws = null;
    if (!reconnectTimer) {
      reconnectTimer = setInterval(connect, 3000);
    }
  };

  ws.onerror = () => {
    ws = null;
  };
}

async function handleToolCall(msg) {
  try {
    let result;

    switch (msg.type) {
      case 'tool:list_tabs':
        result = await listTabs();
        break;
      case 'tool:open_tab':
        result = await openTab(msg.payload.url);
        break;
      case 'tool:close_tab':
        result = await closeTab(msg.payload.tabId);
        break;
      case 'tool:focus_tab':
        result = await focusTab(msg.payload.tabId);
        break;
      case 'tool:read_page':
        result = await readPage(msg.payload.tabId, msg.payload.format);
        break;
      case 'tool:click_element':
        result = await clickElement(msg.payload.tabId, msg.payload.selector, msg.payload.by);
        break;
      case 'tool:fill_form':
        result = await fillForm(msg.payload.tabId, msg.payload.selector, msg.payload.value, msg.payload.by);
        break;
      default:
        throw new Error(`Unknown tool: ${msg.type}`);
    }

    return { type: 'response', payload: result, id: msg.id };
  } catch (error) {
    return { type: 'response', payload: null, id: msg.id, error: error.message };
  }
}

async function listTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map(t => ({
    id: t.id,
    title: t.title,
    url: t.url,
    active: t.active
  }));
}

async function openTab(url) {
  const tab = await chrome.tabs.create({ url });
  return { id: tab.id, title: tab.title, url: tab.url };
}

async function closeTab(tabId) {
  await chrome.tabs.remove(tabId);
  return { success: true };
}

async function focusTab(tabId) {
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { success: true };
}

async function readPage(tabId, format) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (fmt) => {
      if (fmt === 'html') {
        return document.documentElement.outerHTML;
      }
      return document.body.innerText;
    },
    args: [format]
  });
  return results[0].result;
}

async function clickElement(tabId, selector, by) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, method) => {
      let element;
      if (method === 'xpath') {
        const result = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
      } else if (method === 'text') {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent.trim() === sel) {
            element = el;
            break;
          }
        }
      } else {
        element = document.querySelector(sel);
      }
      if (!element) throw new Error(`Element not found: ${sel}`);
      element.click();
      return { success: true };
    },
    args: [selector, by || 'css']
  });
  return results[0].result;
}

async function fillForm(tabId, selector, value, by) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, val, method) => {
      let element;
      if (method === 'xpath') {
        const result = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
      } else if (method === 'text') {
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent.trim() === sel) {
            element = el;
            break;
          }
        }
      } else {
        element = document.querySelector(sel);
      }
      if (!element) throw new Error(`Element not found: ${sel}`);
      element.focus();
      element.value = val;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    },
    args: [selector, value, by || 'css']
  });
  return results[0].result;
}

// Start connection
connect();
```

- [ ] **Step 3: Commit**

```bash
git add extension/manifest.json extension/service-worker.js
git commit -m "feat: add Chrome extension with WebSocket client and all tools"
```

---

## Task 6: CLI Entry Point

**Files:**
- Create: `bin/chrome-weasel.js`

- [ ] **Step 1: Create `bin/chrome-weasel.js`**

Create file `bin/chrome-weasel.js`:
```javascript
#!/usr/bin/env node

// chrome-weasel MCP Server
// Starts the MCP server (stdio for OpenCode) + WebSocket server (for extension)

console.error('[chrome-weasel] Starting MCP server on stdio, WebSocket on port 9876');
require('../dist/mcp-server.js');
```

- [ ] **Step 2: Make it executable**

Run:
```bash
chmod +x bin/chrome-weasel.js
```

- [ ] **Step 3: Build the TypeScript**

Run:
```bash
npm run build
```

Expected: TypeScript compiles without errors, `dist/mcp-server.js` and `dist/websocket-bridge.js` created

- [ ] **Step 4: Commit**

```bash
git add bin/chrome-weasel.js
git commit -m "feat: add CLI entry point"
```

---

## Task 7: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

Create file `README.md`:
```markdown
# chrome-weasel 🦦

MCP server for full Chrome browser control. Lets AI agents open/close tabs, read page content, click elements, and fill forms.

## Installation

```bash
npm install -g chrome-weasel
```

## Setup

### 1. Load the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer Mode** (top right)
3. Click **"Load unpacked"**
4. Select the `extension/` folder from this repo

### 2. Configure OpenCode

Add to your OpenCode MCP config:

```json
{
  "mcpServers": {
    "chrome-weasel": {
      "command": "chrome-weasel"
    }
  }
}
```

### 3. Start Using It

Make sure Chrome is running with the extension loaded, then ask your AI agent:

> *"Open a new tab and go to github.com"*
> *"List all my open tabs"*
> *"Read the content of the current tab"*
> *"Fill in the email field with test@example.com and click submit"*

## Available Tools

| Tool | Description |
|------|-------------|
| `list_tabs` | List all open Chrome tabs |
| `open_tab` | Open a new tab with a URL |
| `close_tab` | Close a tab by ID |
| `focus_tab` | Focus a tab by ID |
| `read_page` | Read page content (HTML or text) |
| `click_element` | Click an element by CSS/XPath/text |
| `fill_form` | Fill a form field with a value |

## How It Works

```
OpenCode → chrome-weasel (stdio MCP) → WebSocket → Chrome Extension → Chrome APIs
```

The MCP server starts a WebSocket server on port 9876. The Chrome extension connects to it and executes browser operations.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```
