import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import { WebSocketBridge } from '../src/websocket-bridge.js';

function waitForClient(bridge: WebSocketBridge): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${bridge.serverPort}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextClientMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
}

describe('WebSocketBridge', () => {
  let bridge: WebSocketBridge;
  let client: WebSocket;

  beforeEach(async () => {
    bridge = new WebSocketBridge(0);
    await new Promise((r) => bridge.once('ready', r));
    client = await waitForClient(bridge);
  });

  afterEach(() => {
    client.close();
    bridge.close();
  });

  it('should send a message and receive a response', async () => {
    const responsePromise = bridge.send({ type: 'ping', payload: { n: 42 }, id: '1' });

    const msg = await nextClientMessage(client);
    expect(msg.type).toBe('ping');
    expect(msg.payload.n).toBe(42);
    expect(msg.id).toBe('1');

    client.send(JSON.stringify({ type: 'pong', payload: { ok: true }, id: msg.id }));

    const result = await responsePromise;
    expect(result).toEqual({ ok: true });
  });

  it('should reject when the client responds with an error', async () => {
    const responsePromise = bridge.send({ type: 'test', payload: {}, id: '2' });

    await nextClientMessage(client);

    client.send(JSON.stringify({ type: 'response', payload: null, id: '2', error: 'Operation failed' }));

    await expect(responsePromise).rejects.toThrow('Operation failed');
  });

  it('should reject when no extension is connected', async () => {
    client.close();
    await new Promise((r) => setTimeout(r, 100));

    await expect(
      bridge.send({ type: 'test', payload: {}, id: '3' })
    ).rejects.toThrow('Extension not connected');
  });

  it('should expose the actual server port via serverPort getter', () => {
    expect(bridge.serverPort).toBeGreaterThan(0);
    expect(Number.isInteger(bridge.serverPort)).toBe(true);
  });

  it('should handle multiple sequential messages', async () => {
    const msg1Promise = nextClientMessage(client);
    const resp1Promise = bridge.send({ type: 'a', payload: {}, id: '1' });

    const msg1 = await msg1Promise;
    expect(msg1.id).toBe('1');
    client.send(JSON.stringify({ type: 'resp', payload: { seq: 1 }, id: '1' }));
    expect(await resp1Promise).toEqual({ seq: 1 });

    const msg2Promise = nextClientMessage(client);
    const resp2Promise = bridge.send({ type: 'b', payload: {}, id: '2' });

    const msg2 = await msg2Promise;
    expect(msg2.id).toBe('2');
    client.send(JSON.stringify({ type: 'resp', payload: { seq: 2 }, id: '2' }));
    expect(await resp2Promise).toEqual({ seq: 2 });
  });

  it('should close the server cleanly', async () => {
    bridge.close();
    client.close();
    // No throw is the success case
  });
});
