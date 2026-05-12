import { io, Socket } from "socket.io-client";
import type { WSMessage, MessageType } from "./types";

const SERVER_URL = "http://localhost:3001";
const RECONNECTION_DELAY = 1000;
const RECONNECTION_ATTEMPTS = 5;

type MessageHandler = (msg: WSMessage) => void;

export interface WebSocketClient {
  socket: Socket | null;
  messageHandlers: Map<MessageType, Set<MessageHandler>>;
  connectHandler: (() => void) | null;
  disconnectHandler: (() => void) | null;
}

export function createWebSocketClient(): WebSocketClient {
  return {
    socket: null,
    messageHandlers: new Map<MessageType, Set<MessageHandler>>(),
    connectHandler: null,
    disconnectHandler: null,
  };
}

export function connect(client: WebSocketClient): void {
  if (client.socket) {
    return;
  }

  client.socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionDelay: RECONNECTION_DELAY,
    reconnectionAttempts: RECONNECTION_ATTEMPTS,
  });

  client.socket.on("connect", () => {
    console.log("Connected to server");
    client.connectHandler?.();
  });

  client.socket.on("disconnect", () => {
    console.log("Disconnected from server");
    client.disconnectHandler?.();
  });

  client.socket.on("connect_error", (error) => {
    console.error("Connection error:", error);
  });

  client.socket.on("error", (error) => {
    console.error("Socket error:", error);
  });

  client.socket.on("message", (msg: WSMessage) => {
    const handlers = client.messageHandlers.get(msg.type);
    if (!handlers) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(msg);
      } catch (error) {
        console.error(`Error in message handler for type ${msg.type}:`, error);
      }
    });
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
    throw new Error("Socket not connected");
  }
  client.socket.emit("message", message);
}

export function onMessage(
  client: WebSocketClient,
  type: MessageType,
  handler: MessageHandler,
): () => void {
  const handlers =
    client.messageHandlers.get(type) ?? new Set<MessageHandler>();
  handlers.add(handler);
  client.messageHandlers.set(type, handlers);

  return () => {
    handlers.delete(handler);
    if (handlers.size === 0) {
      client.messageHandlers.delete(type);
    }
  };
}

export function onConnect(
  client: WebSocketClient,
  handler: () => void,
): () => void {
  client.connectHandler = handler;

  return () => {
    if (client.connectHandler === handler) {
      client.connectHandler = null;
    }
  };
}

export function onDisconnect(
  client: WebSocketClient,
  handler: () => void,
): () => void {
  client.disconnectHandler = handler;

  return () => {
    if (client.disconnectHandler === handler) {
      client.disconnectHandler = null;
    }
  };
}

export function isConnected(client: WebSocketClient): boolean {
  return client.socket?.connected ?? false;
}

export const wsClient = createWebSocketClient();
