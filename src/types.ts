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
