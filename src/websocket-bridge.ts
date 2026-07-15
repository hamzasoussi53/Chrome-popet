import { EventEmitter } from 'events';
import { WebSocketServer, WebSocket } from 'ws';
import { BridgeMessage, BridgeResponse } from './types.js';

export class WebSocketBridge extends EventEmitter {
  private wss: WebSocketServer;
  private extension: WebSocket | null = null;
  private pending: Map<string, { resolve: Function; reject: Function }> = new Map();
  public port: number;
  private timeout: number;

  constructor(port: number = 9876) {
    super();
    this.timeout = parseInt(process.env.CHROME_WEASEL_BRIDGE_TIMEOUT || '180000', 10);
    this.port = port;
    this.wss = new WebSocketServer({ port: this.port, host: '127.0.0.1' });

    this.wss.on('listening', () => {
      this.emit('ready');
    });
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

    this.wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[chrome-weasel] Port ${this.port} is already in use. Choose a different port via CHROME_WEASEL_WS_PORT env var.`);
        process.exit(1);
      }
      console.error('[chrome-weasel] WebSocket server error:', err);
    });
  }

  get serverPort(): number {
    const addr = this.wss.address();
    if (addr && typeof addr === 'object') return addr.port;
    return this.port;
  }

  async send(message: BridgeMessage): Promise<any> {
    if (!this.extension) {
      throw new Error('Extension not connected. Make sure the chrome-weasel extension is loaded in Chrome.');
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`Timeout waiting for extension response to ${message.type}`));
      }, this.timeout);

      this.pending.set(message.id, {
        resolve: (val: any) => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: (err: any) => {
          clearTimeout(timer);
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
