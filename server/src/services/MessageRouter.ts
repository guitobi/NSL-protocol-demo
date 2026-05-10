import type { Server } from 'socket.io';
import type { WSMessage } from '../types';
import type { ClientManager } from './ClientManager';
import { getPeerList, getClient } from './ClientManager';

export function broadcastPeerList(io: Server, clientManager: ClientManager): void {
  const peerList = getPeerList(clientManager);
  io.emit('message', {
    type: 'PEER_LIST',
    from: 'server',
    to: 'all',
    payload: { peers: peerList },
    timestamp: Date.now(),
  });
}

export function routeMessage(
  io: Server,
  msg: WSMessage,
  clientManager: ClientManager
): void {
  const targetClient = getClient(clientManager, msg.to);
  if (targetClient) {
    io.to(targetClient.socketId).emit('message', msg);
    console.log(`Message routed: ${msg.type} from ${msg.from} to ${msg.to}`);
  } else {
    console.warn(`Target client not found: ${msg.to}`);
  }
}
