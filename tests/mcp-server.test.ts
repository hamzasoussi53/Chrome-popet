import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';

class MCPClient {
  private proc: ChildProcess;
  private buffer = '';
  private resolvers: Array<(msg: any) => void> = [];

  constructor(proc: ChildProcess) {
    this.proc = proc;
    proc.stdout!.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString();
      this.tryResolve();
    });
  }

  private tryResolve() {
    while (this.resolvers.length > 0) {
      const idx = this.buffer.indexOf('\n');
      if (idx === -1) break;
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      const resolver = this.resolvers.shift()!;
      resolver(JSON.parse(line));
    }
  }

  send(msg: any): void {
    this.proc.stdin!.write(JSON.stringify(msg) + '\n');
  }

  read(): Promise<any> {
    return new Promise((resolve) => {
      this.resolvers.push(resolve);
      this.tryResolve();
    });
  }

  kill(): void {
    this.proc.kill();
  }
}

function createClient(): MCPClient {
  const port = Math.floor(Math.random() * 10000) + 30000;
  const proc = spawn('node', ['dist/mcp-server.js'], {
    env: { ...process.env, CHROME_WEASEL_WS_PORT: String(port) },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return new MCPClient(proc);
}

describe('MCP Server', () => {
  let client: MCPClient;

  beforeEach(() => {
    client = createClient();
  });

  afterEach(() => {
    client.kill();
  });

  it('should respond to initialize', async () => {
    client.send({ method: 'initialize', id: '1' });
    const res = await client.read();
    expect(res.id).toBe('1');
    expect(res.result.protocolVersion).toBe('2024-11-05');
    expect(res.result.capabilities).toEqual({ tools: {} });
    expect(res.result.serverInfo).toEqual({ name: 'chrome-weasel', version: '1.0.0' });
  });

  it('should list all 8 tools after initialization', async () => {
    client.send({ method: 'initialize', id: '1' });
    await client.read();

    client.send({ method: 'tools/list', id: '2' });
    const res = await client.read();
    expect(res.id).toBe('2');
    expect(res.result.tools).toHaveLength(8);
    expect(res.result.tools.map((t: any) => t.name)).toEqual([
      'list_tabs', 'open_tab', 'close_tab', 'focus_tab',
      'read_page', 'click_element', 'fill_form', 'chat_agent_interact',
    ]);
  });

  it('should reject tools/list before initialization', async () => {
    client.send({ method: 'tools/list', id: '1' });
    const res = await client.read();
    expect(res.id).toBe('1');
    expect(res.error.message).toContain('not initialized');
  });

  it('should reject tools/call before initialization', async () => {
    client.send({ method: 'tools/call', params: { name: 'list_tabs', arguments: {} }, id: '1' });
    const res = await client.read();
    expect(res.id).toBe('1');
    expect(res.error.message).toContain('not initialized');
  });

  it('should reject tools/call when extension is not connected', async () => {
    client.send({ method: 'initialize', id: '1' });
    await client.read();

    client.send({ method: 'tools/call', params: { name: 'list_tabs', arguments: {} }, id: '2' });
    const res = await client.read();
    expect(res.id).toBe('2');
    expect(res.error.message).toContain('Extension not connected');
  });

  it('should error on unknown method', async () => {
    client.send({ method: 'foobar', id: '1' });
    const res = await client.read();
    expect(res.id).toBe('1');
    expect(res.error.message).toContain('Unknown method');
  });

  it('should handle notifications/initialized without sending a response', async () => {
    client.send({ method: 'initialize', id: '1' });
    await client.read();

    client.send({ method: 'notifications/initialized' });

    client.send({ method: 'tools/list', id: '2' });
    const res = await client.read();
    expect(res.id).toBe('2');
    expect(res.result.tools).toHaveLength(8);
  });

  it('should use CHROME_WEASEL_WS_PORT env var for WebSocket port', async () => {
    const port = Math.floor(Math.random() * 10000) + 40000;
    const proc = spawn('node', ['dist/mcp-server.js'], {
      env: { ...process.env, CHROME_WEASEL_WS_PORT: String(port) },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const c = new MCPClient(proc);

    c.send({ method: 'initialize', id: '1' });
    const res = await c.read();
    expect(res.result.serverInfo.name).toBe('chrome-weasel');

    proc.kill();
  });

  it('should return jsonrpc 2.0 responses', async () => {
    client.send({ method: 'initialize', id: '1' });
    const res = await client.read();
    expect(res.jsonrpc).toBe('2.0');
  });

  it('should reject chat_agent_interact when extension is not connected', async () => {
    client.send({ method: 'initialize', id: '1' });
    await client.read();

    client.send({
      method: 'tools/call',
      params: { name: 'chat_agent_interact', arguments: { tabId: 123, message: 'hello' } },
      id: '2'
    });
    const res = await client.read();
    expect(res.id).toBe('2');
    expect(res.error.message).toContain('Extension not connected');
  });
});
