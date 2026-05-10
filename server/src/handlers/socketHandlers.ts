import type { Server } from 'socket.io';
import type { Socket } from 'socket.io';
import type { WSMessage } from '../types';
import type { ClientManager } from '../services/ClientManager';
import type { MitmManager } from '../services/MitmManager';
import { registerClient, unregisterClient, findClientBySocketId, getAllClients } from '../services/ClientManager';
import { broadcastPeerList, routeMessage } from '../services/MessageRouter';
import { activateMitm, deactivateMitm, getInterceptedPackets } from '../services/MitmManager';

export function setupSocketHandlers(
  socket: Socket,
  io: Server,
  clientManager: ClientManager,
  mitmManager: MitmManager,
  currentProtocol: 'NSPK' | 'NSL' | null,
  setProtocol: (protocol: 'NSPK' | 'NSL' | null) => void
): void {
  console.log(`Client connected: ${socket.id}`);

  socket.on('message', (msg: WSMessage) => {
    try {
      if (!msg || typeof msg !== 'object' || !msg.type || !msg.from) {
        console.warn('Invalid message format received');
        return;
      }

      const { type, from, payload } = msg;

      if (type === 'SET_PROTOCOL') {
        const { protocol } = payload as { protocol: 'NSPK' | 'NSL' };
        setProtocol(protocol);

        // Broadcast to all clients
        io.emit('message', {
          type: 'PROTOCOL_SET',
          from: 'server',
          to: 'all',
          payload: { protocol },
          timestamp: Date.now(),
        });

        console.log(`[Protocol] Set to ${protocol}`);
      } else if (type === 'REGISTER') {
        const { id, publicKey } = payload;
        registerClient(clientManager, {
          id,
          socketId: socket.id,
          publicKey,
        });
        console.log(`Client registered: ${id}`);
        broadcastPeerList(io, clientManager);
      } else if (type === 'ACTIVATE_MITM') {
        // Intruder activates MitM attack
        if (from === 'Intruder') {
          activateMitm(mitmManager);
          socket.emit('message', {
            type: 'MITM_ACTIVATED',
            from: 'server',
            to: 'Intruder',
            payload: { success: true },
            timestamp: Date.now(),
          });
          console.log('[MitM] Attack activated by Intruder');
        }
      } else if (type === 'DEACTIVATE_MITM') {
        // Intruder deactivates MitM attack
        if (from === 'Intruder') {
          deactivateMitm(mitmManager);
          socket.emit('message', {
            type: 'MITM_DEACTIVATED',
            from: 'server',
            to: 'Intruder',
            payload: { success: true },
            timestamp: Date.now(),
          });
          console.log('[MitM] Attack deactivated by Intruder');
        }
      } else if (type === 'GET_PACKETS') {
        // Intruder requests packet history
        if (from === 'Intruder') {
          const packets = getInterceptedPackets(mitmManager);
          socket.emit('message', {
            type: 'PACKET_HISTORY',
            from: 'server',
            to: 'Intruder',
            payload: { packets },
            timestamp: Date.now(),
          });
        }
      } else if (type === 'DISCONNECT') {
        unregisterClient(clientManager, from);
        console.log(`Client disconnected: ${from}`);
        broadcastPeerList(io, clientManager);
      } else {
        routeMessage(io, msg, clientManager, mitmManager);
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

      // Reset protocol and MitM when all clients disconnect
      const remainingClients = getAllClients(clientManager);
      if (remainingClients.length === 0) {
        setProtocol(null);
        deactivateMitm(mitmManager);
        console.log('[Server] All clients disconnected - reset protocol and MitM state');
      }

      broadcastPeerList(io, clientManager);
    }
  });
}
