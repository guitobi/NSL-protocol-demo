import type { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { WSMessage } from '../types';
import type { ClientManager } from '../services/ClientManager';
import { registerClient, unregisterClient, findClientBySocketId } from '../services/ClientManager';
import { broadcastPeerList, routeMessage } from '../services/MessageRouter';

export function setupSocketHandlers(
  socket: Socket,
  io: Server,
  clientManager: ClientManager
): void {
  console.log(`Client connected: ${socket.id}`);

  socket.on('message', (msg: WSMessage) => {
    try {
      if (!msg || typeof msg !== 'object' || !msg.type || !msg.from) {
        console.warn('Invalid message format received');
        return;
      }

      const { type, from, payload } = msg;

      if (type === 'REGISTER') {
        const { id, publicKey } = payload;
        registerClient(clientManager, {
          id,
          socketId: socket.id,
          publicKey,
        });
        console.log(`Client registered: ${id}`);
        broadcastPeerList(io, clientManager);
      } else if (type === 'DISCONNECT') {
        unregisterClient(clientManager, from);
        console.log(`Client disconnected: ${from}`);
        broadcastPeerList(io, clientManager);
      } else {
        routeMessage(io, msg, clientManager);
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);

    const disconnectedClient = findClientBySocketId(clientManager, socket.id);
    if (disconnectedClient) {
      unregisterClient(clientManager, disconnectedClient.id);
      console.log(`Client removed: ${disconnectedClient.id}`);
      broadcastPeerList(io, clientManager);
    }
  });
}
