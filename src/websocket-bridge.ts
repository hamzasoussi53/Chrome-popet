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
      const timeout = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error(`Timeout waiting for extension response to ${message.type}`));
      }, 30000);

      this.pending.set(message.id, {
        resolve: (val: any) => {
          clearTimeout(timeout);
          resolve(val);
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
