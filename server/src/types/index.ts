export interface Client {
  id: string;
  socketId: string;
  publicKey: string;
}

export interface WSMessage {
  type: string;
  from: string;
  to: string;
  payload: any;
  timestamp?: number;
}
