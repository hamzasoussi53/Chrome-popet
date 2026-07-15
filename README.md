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
