const WS_PORT = 9876;
let ws = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(`ws://localhost:${WS_PORT}`);

  ws.onopen = () => {
    console.log('[chrome-weasel] Connected to MCP server');
    chrome.alarms.clear('weasel-reconnect');
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
    chrome.alarms.create('weasel-reconnect', { delayInMinutes: 0.05 });
  };

  ws.onerror = () => {
    ws = null;
  };
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'weasel-reconnect') {
    connect();
  }
});

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
      case 'tool:reload_extension':
        result = await reloadExtension();
        break;
      case 'tool:chat_agent_interact':
        result = await handleChatInteract(msg.payload.tabId, msg.payload);
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

function requireTabId(tabId) {
  if (typeof tabId !== 'number' || tabId < 0 || !Number.isInteger(tabId)) {
    throw new Error(`Invalid tabId: ${tabId}. Must be a positive integer.`);
  }
}

async function closeTab(tabId) {
  requireTabId(tabId);
  await chrome.tabs.remove(tabId);
  return { success: true };
}

async function focusTab(tabId) {
  requireTabId(tabId);
  const tab = await chrome.tabs.update(tabId, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return { success: true };
}

async function readPage(tabId, format) {
  requireTabId(tabId);
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
  requireTabId(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, method) => {
      let element;
      if (method === 'xpath') {
        const result = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
      } else if (method === 'text') {
        const trimmed = sel.trim();
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent.trim() === trimmed) {
            element = el;
            break;
          }
        }
      } else {
        element = document.querySelector(sel);
      }
      if (!element) throw new Error('Element not found: ' + sel);
      element.click();
      return { success: true };
    },
    args: [selector, by || 'css']
  });
  return results[0].result;
}

async function fillForm(tabId, selector, value, by) {
  requireTabId(tabId);
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel, val, method) => {
      let element;
      if (method === 'xpath') {
        const result = document.evaluate(sel, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        element = result.singleNodeValue;
      } else if (method === 'text') {
        const trimmed = sel.trim();
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          if (el.textContent.trim() === trimmed) {
            element = el;
            break;
          }
        }
      } else {
        element = document.querySelector(sel);
      }
      if (!element) throw new Error('Element not found: ' + sel);
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        element.focus();
        element.value = val;
      } else {
        element.focus();
        element.textContent = val;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return { success: true };
    },
    args: [selector, value, by || 'css']
  });
  return results[0].result;
}

async function reloadExtension() {
  chrome.runtime.reload();
  return { success: true };
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function evaluateOnPage(tabId, fn, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: fn,
    args: args || []
  });
  return results[0].result;
}

async function handleChatInteract(tabId, opts) {
  requireTabId(tabId);

  const timeout = opts.timeout || 120000;

  // Detect platform from URL
  const hostname = await evaluateOnPage(tabId, () => window.location.hostname);

  const isClaude = hostname.includes('claude.ai');
  const isChatGPT = hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com');

  const promptSelector = opts.promptSelector || (isClaude ? '[data-testid="chat-input"]' : '#prompt-textarea');
  const sendSelector = opts.sendSelector || (isClaude ? 'button[aria-label="Send message"]' : '#composer-submit-button');
  const responseSelector = opts.responseSelector || (isClaude ? '.font-claude-response' : '[data-message-author-role="assistant"]');

  // Record current assistant message count + last message text before sending
  const before = await evaluateOnPage(tabId, (sel) => {
    const msgs = document.querySelectorAll(sel);
    const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
    return {
      count: msgs.length,
      lastText: last ? (last.innerText || last.textContent || '') : ''
    };
  }, [responseSelector]);

  // 1. Fill the prompt
  await fillForm(tabId, promptSelector, opts.message, 'css');
  await delay(500);

  // 2. Send — explicitly click send button when one is defined
  if (sendSelector) {
    await clickElement(tabId, sendSelector, 'css');
  } else {
    // Fallback: dispatch Enter key
    await evaluateOnPage(tabId, (sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error('Input not found: ' + sel);
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', bubbles: true }));
      return { success: true };
    }, [promptSelector]);
  }

  // 3. Poll for a new response
  const start = Date.now();
  let newText = '';
  let stableCount = 0;

  while (Date.now() - start < timeout) {
    await delay(1500);

    const state = await evaluateOnPage(tabId, (sel, prevCount, prevLastText) => {
      const msgs = document.querySelectorAll(sel);
      const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      const text = last ? (last.innerText || last.textContent || '') : '';
      return { count: msgs.length, text, changed: msgs.length > prevCount || text !== prevLastText };
    }, [responseSelector, before.count, before.lastText]);

    if (!state.changed) continue;

    newText = state.text;

    while (Date.now() - start < timeout) {
      await delay(1500);

      const currentText = await evaluateOnPage(tabId, (sel) => {
        const msgs = document.querySelectorAll(sel);
        const last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        return last ? (last.innerText || last.textContent || '') : '';
      }, [responseSelector]);

      if (!currentText) continue;

      if (currentText === newText) {
        stableCount++;
        if (stableCount >= 2) {
          return { response: currentText, success: true };
        }
      } else {
        stableCount = 0;
        newText = currentText;
      }
    }
  }

  return {
    response: newText || '',
    success: false,
    error: 'Timeout waiting for chat response'
  };
}

// Start connection
connect();
