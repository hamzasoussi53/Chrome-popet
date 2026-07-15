import { BridgeMessage } from './types.js';
export declare class WebSocketBridge {
    private wss;
    private extension;
    private pending;
    port: number;
    constructor(port?: number);
    send(message: BridgeMessage): Promise<any>;
    close(): void;
}
