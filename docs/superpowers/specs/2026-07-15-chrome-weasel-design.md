# chrome-weasel Design Spec

## Overview
`chrome-weasel` is an MCP server that gives AI agents (via OpenCode) full control over a Chrome browser — open/close tabs, read page content, click elements, and fill forms. It uses a Chrome Extension + Native Messaging Host architecture.

## Architecture

```
OpenCode (MCP Client)
    │  stdio transport (spawns chrome-weasel)
    ▼
chrome-weasel (Node.js MCP Server — npm package)
    │  Native Messaging (JSON over stdin/stdout)
    ▼
Chrome Extension (headless Service Worker)
    │  chrome.tabs / chrome.scripting / chrome.debugger APIs
    ▼
Target Web Page (Content Scripts injected)
```

## Components

### 1. `chrome-weasel` npm package
- **Name:** `chrome-weasel`
- **Installation:** `npm install -g chrome-weasel`
- **Transport:** stdio MCP (OpenCode spawns it as a subprocess)
- **Role:** MCP server that defines tools and relays commands to the extension via native messaging
- **Postinstall:** Auto-registers the native messaging host manifest

### 2. Chrome Extension (headless)
- **Manifest v3**, no UI/popup
- Service Worker handles native messaging from the MCP server
- Uses `chrome.tabs`, `chrome.scripting`, `chrome.debugger` APIs
- Injects content scripts for DOM access (click, fill, read)

### 3. Native Messaging Host
- JSON manifest registered in OS-specific location
- Bridges Node.js MCP server ↔ Chrome Extension

### MCP Tools (v1)

| Tool | Input | Output |
|------|-------|--------|
| `list_tabs` | — | `[{id, title, url, active}]` |
| `open_tab` | `url` | Tab info |
| `close_tab` | `tabId` | Success |
| `focus_tab` | `tabId` | Success |
| `read_page` | `tabId`, `format: "html"|"text"` | Page content |
| `click_element` | `tabId`, `selector`, `by: "css"|"xpath"|"text"` | Success |
| `fill_form` | `tabId`, `selector`, `value` | Success |

### Project Structure

```
chrome-weasel/
├── package.json
├── bin/
│   └── chrome-weasel          # CLI entry (MCP server)
├── src/
│   ├── mcp-server.ts          # MCP stdio server + tool definitions
│   ├── native-messaging.ts    # Extension communication
│   └── types.ts
├── extension/
│   ├── manifest.json          # Manifest v3
│   ├── service-worker.js      # Background worker
│   ├── content-script.js      # DOM interaction
│   └── native-manifest.json   # Native messaging host registration
├── scripts/
│   └── install.js             # Postinstall: register native host
└── README.md
```

### Installation Flow

1. `npm install -g chrome-weasel` → postinstall script registers native messaging host
2. User loads the extension from `chrome://extensions` (developer mode)
3. User adds `chrome-weasel` to OpenCode's MCP config
4. Done — OpenCode can now control Chrome

Let me write this to the design doc.

<｜DSML｜tool_calls>
<｜DSML｜invoke name="bash">
<｜DSML｜parameter name="command" string="true">cat > /Users/soussihamza/GitHub/Chrome-popet/docs/superpowers/specs/2026-07-15-chrome-weasel-design.md << 'DESIGN_EOF'
# chrome-weasel Design Spec

## Overview
`chrome-weasel` is an MCP server that gives AI agents (via OpenCode) full control over a Chrome browser — open/close tabs, list tabs, read page content, click elements, and fill forms. It uses a Chrome Extension + Native Messaging Host architecture.

## Package
- **Name:** `chrome-weasel`
- **Installation:** `npm install -g chrome-weasel`
- **Transport:** stdio (OpenCode spawns it as an MCP subprocess)
- **Extension UI:** Headless (no popup, no badge)

## Architecture

```
OpenCode (MCP Client)
    │  stdio transport (JSON-RPC over MCP)
    ▼
chrome-weasel (Node.js MCP Server)
    │  Native Messaging (JSON over stdin/stdout)
    ▼
Chrome Extension (Service Worker, headless)
    │  chrome.tabs / chrome.scripting / chrome.debugger APIs
    ▼
Target Web Page (Content Scripts injected)
```

## Components

### 1. chrome-weasel (npm package)
- **Install:** `npm install -g chrome-weasel`
- **Entry:** `bin/chrome-weasel` — stdio MCP server
- **Role:** Translates MCP tool calls into native messaging commands
- **Postinstall:** Auto-registers the native messaging host manifest

### 2. Chrome Extension
- **Manifest v3**, headless (no popup, no badge)
- Service Worker handles native messaging from the MCP server
- Uses `chrome.tabs`, `chrome.scripting`, `chrome.debugger` APIs
- Injects content scripts for DOM access

### 3. Native Messaging Host
- JSON manifest registered in OS-specific location
- Bridges Node.js MCP server ↔ Chrome Extension

## MCP Tools (v1)

| Tool | Input | Output |
|------|-------|--------|
| `list_tabs` | — | `[{id, title, url, active}]` |
| `open_tab` | `url` | Tab info |
| `close_tab` | `tabId` | Success |
| `focus_tab` | `tabId` | Success |
| `read_page` | `tabId`, `format: "html"|"text"` | Page content |
| `click_element` | `tabId`, `selector`, `by: "css"|"xpath"|"text"` | Success |
| `fill_form` | `tabId`, `selector`, `value` | Success |

## Data Flow

1. OpenCode spawns `chrome-weasel` via stdio MCP transport
2. User talks to OpenCode in natural language
3. OpenCode decides which MCP tools to call
4. `chrome-weasel` (Node.js) translates MCP calls → native messaging JSON
5. Chrome Extension receives native messages → executes Chrome API calls
6. Content scripts interact with page DOM (read, click, fill)
7. Results flow back: Extension → Native Messaging → MCP Server → OpenCode

## Permissions

- `tabs` — tab management
- `scripting` — content script injection
- `nativeMessaging` — bridge to MCP server
- `host_permissions` — `<all_urls>` for full page access

## Installation Flow

1. `npm install -g chrome-weasel` → postinstall registers native messaging host
2. Load extension from `chrome://extensions` (developer mode)
3. Add to OpenCode's MCP config:
   ```json
   {
     "mcpServers": {
       "chrome-weasel": {
         "command": "chrome-weasel"
       }
     }
   }
   ```
4. Done — OpenCode can now control Chrome

## Security

- Native messaging is sandboxed — only the registered extension can communicate
- Content scripts run in isolated worlds
- No special Chrome launch flags needed
- Extension permissions: `tabs`, `scripting`, `nativeMessaging`, `<all_urls>`
