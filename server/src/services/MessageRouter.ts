import type { Server } from 'socket.io';
import type { WSMessage } from '../types';
import type { ClientManager } from './ClientManager';
import type { MitmManager } from './MitmManager';
import { getPeerList, getClient } from './ClientManager';
import { isMitmActive, logPacket } from './MitmManager';

export function broadcastPeerList(io: Server, clientManager: ClientManager, mitmManager?: MitmManager): void {
  const peerList = getPeerList(clientManager);

  // Send modified PEER_LIST to Alice if MitM is active
  if (mitmManager && isMitmActive(mitmManager) && mitmManager.intruderPublicKey) {
    const aliceClient = getClient(clientManager, 'Alice');
    const bobClient = getClient(clientManager, 'Bob');

    if (aliceClient && bobClient) {
      // Alice gets modified list with Intruder's key instead of Bob's
      const modifiedPeerList = peerList.map(peer => {
        if (peer.id === 'Bob') {
          return { id: 'Bob', publicKey: mitmManager.intruderPublicKey! };
        }
        return peer;
      });

      io.to(aliceClient.socketId).emit('message', {
        type: 'PEER_LIST',
        from: 'server',
        to: 'Alice',
        payload: { peers: modifiedPeerList },
        timestamp: Date.now(),
      });

      console.log('[MitM] Sent modified PEER_LIST to Alice (Bob key substituted with Intruder key)');

      // Bob and others get normal list
      const otherClients = getPeerList(clientManager).filter(p => p.id !== 'Alice');
      otherClients.forEach(peer => {
        const client = getClient(clientManager, peer.id);
        if (client) {
          io.to(client.socketId).emit('message', {
            type: 'PEER_LIST',
            from: 'server',
            to: peer.id,
            payload: { peers: peerList },
            timestamp: Date.now(),
          });
        }
      });

      return;
    }
  }

  // Normal broadcast to all
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
  clientManager: ClientManager,
  mitmManager: MitmManager
): void {
  // Log all packets for Intruder to see
  logPacket(mitmManager, msg.from, msg.to, msg.type, msg.payload);

  // Broadcast packet info to Intruder
  const intruderClient = getClient(clientManager, 'Intruder');
  if (intruderClient) {
    io.to(intruderClient.socketId).emit('message', {
      type: 'PACKET_INTERCEPTED',
      from: 'server',
      to: 'Intruder',
      payload: {
        timestamp: Date.now(),
        from: msg.from,
        to: msg.to,
        messageType: msg.type,
        payloadPreview: JSON.stringify(msg.payload).substring(0, 32),
      },
      timestamp: Date.now(),
    });

    // Send ATTACK_RESULT when Alice detects attack (ERROR with ATTACK DETECTED)
    if (
      isMitmActive(mitmManager) &&
      msg.type === 'ERROR' &&
      msg.from === 'Alice' &&
      JSON.stringify(msg.payload).includes('ATTACK DETECTED')
    ) {
      io.to(intruderClient.socketId).emit('message', {
        type: 'ATTACK_RESULT',
        from: 'server',
        to: 'Intruder',
        payload: { result: 'failed', reason: 'Alice detected identity mismatch' },
        timestamp: Date.now(),
      });
      console.log('[MitM] Attack failed - Alice detected identity mismatch');
    }

    // Send ATTACK_RESULT when Alice successfully completes handshake
    if (
      isMitmActive(mitmManager) &&
      msg.type === 'HANDSHAKE_OK' &&
      msg.from === 'Alice'
    ) {
      io.to(intruderClient.socketId).emit('message', {
        type: 'ATTACK_RESULT',
        from: 'server',
        to: 'Intruder',
        payload: { result: 'success' },
        timestamp: Date.now(),
      });
      console.log('[MitM] Attack successful - Alice completed handshake without detecting attack');
    }
  }

  // MitM interception logic: intercept NSL_MSG1 from Alice/Bob to Bob/Alice
  if (
    isMitmActive(mitmManager) &&
    msg.type === 'NSL_MSG1' &&
    ((msg.from === 'Alice' && msg.to === 'Bob') || (msg.from === 'Bob' && msg.to === 'Alice'))
  ) {
    console.log(`[MitM] Intercepting MSG1 from ${msg.from} to ${msg.to}, redirecting to Intruder`);

    // Send intercepted message to Intruder with metadata
    if (intruderClient) {
      io.to(intruderClient.socketId).emit('message', {
        type: 'MITM_INTERCEPT',
        from: 'server',
        to: 'Intruder',
        payload: {
          originalFrom: msg.from,
          originalTo: msg.to,
          originalPayload: msg.payload,
        },
        timestamp: Date.now(),
      });
      console.log(`[MitM] Forwarded intercepted MSG1 to Intruder`);
    }

    // Do NOT forward to original recipient
    return;
  }

  // Normal routing
  const targetClient = getClient(clientManager, msg.to);
  if (targetClient) {
    io.to(targetClient.socketId).emit('message', msg);
    console.log(`Message routed: ${msg.type} from ${msg.from} to ${msg.to}`);
  } else {
    console.warn(`Target client not found: ${msg.to}`);
  }
}
