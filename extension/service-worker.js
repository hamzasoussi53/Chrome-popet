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
