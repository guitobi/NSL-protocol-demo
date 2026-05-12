import type { Socket } from "socket.io";

export interface PublicKeyJwk {
  kty?: string;
  key_ops?: string[];
  ext?: boolean;
  alg?: string;
  n?: string;
  e?: string;
}

export interface Client {
  id: string;
  socketId: string;
  socket: Socket;
  publicKey: PublicKeyJwk;
}

export interface WSMessage {
  type: string;
  from: string;
  to: string;
  payload: unknown;
  timestamp?: number;
}

export interface InterceptedPacket {
  timestamp: number;
  from: string;
  to: string;
  type: string;
  payload: string;
}
