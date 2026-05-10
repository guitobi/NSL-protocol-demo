import { io, Socket } from 'socket.io-client';
import type { WSMessage, MessageType } from './types';

const SERVER_URL = 'http://localhost:3001';
const RECONNECTION_DELAY = 1000;
const RECONNECTION_ATTEMPTS = 5;

export interface WebSocketClient {
  socket: Socket | null;
  messageHandlers: Map<MessageType, (msg: WSMessage) => void>;
  connectHandler: (() => void) | null;
  disconnectHandler: (() => void) | null;
}

export function createWebSocketClient(): WebSocketClient {
  return {
    socket: null,
    messageHandlers: new Map<MessageType, (msg: WSMessage) => void>(),
    connectHandler: null,
    disconnectHandler: null,
  };
}

export function connect(client: WebSocketClient): void {
  if (client.socket?.connected) {
    return;
  }

  client.socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionAttempts: RECONNECTION_ATTEMPTS,
  });

  client.socket.on('connect', () => {
    console.log('Connected to server');
    client.connectHandler?.();
  });

  client.socket.on('disconnect', () => {
    console.log('Disconnected from server');
    client.disconnectHandler?.();
  });

  client.socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });

  client.socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  client.socket.on('message', (msg: WSMessage) => {
    const handler = client.messageHandlers.get(msg.type);
    if (handler) {
      try {
        handler(msg);
      } catch (error) {
        console.error(`Error in message handler for type ${msg.type}:`, error);
      }
    }
  });
}

export function disconnect(client: WebSocketClient): void {
  if (client.socket) {
    client.socket.removeAllListeners();
    client.socket.disconnect();
    client.socket = null;
  }
  client.messageHandlers.clear();
  client.connectHandler = null;
  client.disconnectHandler = null;
}

export function send(client: WebSocketClient, message: WSMessage): void {
  if (!client.socket?.connected) {
    throw new Error('Socket not connected');
  }
  client.socket.emit('message', message);
}

export function onMessage(
  client: WebSocketClient,
  type: MessageType,
  handler: (msg: WSMessage) => void
): void {
  client.messageHandlers.set(type, handler);
}

export function onConnect(client: WebSocketClient, handler: () => void): void {
  client.connectHandler = handler;
}

export function onDisconnect(client: WebSocketClient, handler: () => void): void {
  client.disconnectHandler = handler;
}

export function isConnected(client: WebSocketClient): boolean {
  return client.socket?.connected ?? false;
}

export const wsClient = createWebSocketClient();
