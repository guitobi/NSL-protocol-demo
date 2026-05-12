import type { Server } from "socket.io";
import type { WSMessage } from "../types";
import type { ClientManager } from "./ClientManager";
import type { MitmManager } from "./MitmManager";
import { getPeerList, getClient } from "./ClientManager";
import { isMitmActive, logPacket } from "./MitmManager";

function isActiveMitm(manager: MitmManager): boolean {
  return isMitmActive(manager) && manager.protocol !== null;
}

function isNspkMitm(manager: MitmManager): boolean {
  return isActiveMitm(manager) && manager.protocol === "NSPK";
}

export function broadcastPeerList(
  io: Server,
  clientManager: ClientManager,
  mitmManager?: MitmManager,
): void {
  const peerList = getPeerList(clientManager);

  if (
    mitmManager &&
    isNspkMitm(mitmManager) &&
    mitmManager.attackInProgress &&
    mitmManager.intruderPublicKey
  ) {
    const aliceClient = getClient(clientManager, "Alice");
    if (aliceClient) {
      const modifiedPeerList = peerList.map((peer) => {
        if (peer.id === "Bob") {
          return { id: "Bob", publicKey: mitmManager.intruderPublicKey! };
        }
        return peer;
      });

      aliceClient.socket.emit("message", {
        type: "PEER_LIST",
        from: "server",
        to: "Alice",
        payload: { peers: modifiedPeerList },
        timestamp: Date.now(),
      });

      const otherClients = getPeerList(clientManager).filter(
        (p) => p.id !== "Alice",
      );
      otherClients.forEach((peer) => {
        const client = getClient(clientManager, peer.id);
        if (client) {
          io.to(client.socketId).emit("message", {
            type: "PEER_LIST",
            from: "server",
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
  io.emit("message", {
    type: "PEER_LIST",
    from: "server",
    to: "all",
    payload: { peers: peerList },
    timestamp: Date.now(),
  });
}

export function routeMessage(
  io: Server,
  msg: WSMessage,
  clientManager: ClientManager,
  mitmManager: MitmManager,
): void {
  console.log(
    `[Router] Received message: ${msg.type} from ${msg.from} to ${msg.to}`,
  );

  if (!msg.to || typeof msg.to !== "string") {
    console.warn(`Rejected message without target: ${msg.type}`);
    return;
  }

  const intruderClient = getClient(clientManager, "Intruder");
  const isTrafficVisibleToIntruder =
    msg.from === "Intruder" ||
    msg.to === "Intruder" ||
    (isNspkMitm(mitmManager) && mitmManager.attackInProgress);

  if (isTrafficVisibleToIntruder) {
    logPacket(mitmManager, msg.from, msg.to, msg.type, msg.payload);
  }

  // Broadcast only traffic that actually traverses Intruder or active MitM observation window.
  if (intruderClient && isTrafficVisibleToIntruder) {
    io.to(intruderClient.socketId).emit("message", {
      type: "PACKET_INTERCEPTED",
      from: "server",
      to: "Intruder",
      payload: {
        timestamp: Date.now(),
        from: msg.from,
        to: msg.to,
        messageType: msg.type,
        payloadPreview: JSON.stringify(msg.payload).substring(0, 200),
        mode:
          msg.from === "Intruder" || msg.to === "Intruder"
            ? "active"
            : "passive",
        protocol: mitmManager.protocol,
      },
      timestamp: Date.now(),
    });

    // Send ATTACK_RESULT when Alice detects attack (ERROR with ATTACK DETECTED)
    if (
      isMitmActive(mitmManager) &&
      msg.type === "ERROR" &&
      msg.from === "Alice" &&
      JSON.stringify(msg.payload).includes("ATTACK DETECTED")
    ) {
      io.to(intruderClient.socketId).emit("message", {
        type: "PACKET_INTERCEPTED",
        from: "server",
        to: "Intruder",
        payload: {
          timestamp: Date.now(),
          from: msg.from,
          to: msg.to,
          messageType: "NSL_BLOCKED_MITM",
          payloadPreview:
            "NSL rejected active MITM: Alice detected identity mismatch in MSG2",
          mode: "active",
          protocol: mitmManager.protocol,
          attackStep: "NSL_IDENTITY_CHECK",
          blockedByProtocol: true,
          abortReason: "Alice detected identity mismatch in MSG2",
        },
        timestamp: Date.now(),
      });

      io.to(intruderClient.socketId).emit("message", {
        type: "ATTACK_RESULT",
        from: "server",
        to: "Intruder",
        payload: {
          result: "failed",
          reason: "Alice detected identity mismatch",
        },
        timestamp: Date.now(),
      });
      console.log("[MitM] Attack failed - Alice detected identity mismatch");
    }

    // In NSPK only, successful Alice handshake means the demonstration attack succeeded.
    // In NSL, packet visibility is passive monitoring; success must not be reported as MitM success.
    if (
      isNspkMitm(mitmManager) &&
      msg.type === "HANDSHAKE_OK" &&
      msg.from === "Alice"
    ) {
      io.to(intruderClient.socketId).emit("message", {
        type: "ATTACK_RESULT",
        from: "server",
        to: "Intruder",
        payload: { result: "success" },
        timestamp: Date.now(),
      });
      console.log(
        "[MitM] Attack successful - Alice completed handshake without detecting attack",
      );
    }
  }

  // Active MitM relay is enabled for both protocols. NSPK completes the relay;
  // NSL must abort when Alice verifies Bob's identity in MSG2 while expecting Intruder.
  const mitmPayload = msg.payload as { mitmForwarded?: boolean } | undefined;
  const isMitmForwarded = mitmPayload?.mitmForwarded === true;
  const isLoweInitialMessage =
    msg.type === "NSL_MSG1" && msg.from === "Alice" && msg.to === "Intruder";
  const isSubstitutedKeyMessage =
    (msg.type === "NSL_MSG1" || msg.type === "NSL_MSG3") &&
    msg.from === "Alice" &&
    msg.to === "Bob" &&
    mitmManager.protocol === "NSPK";
  if (
    isActiveMitm(mitmManager) &&
    mitmManager.attackInProgress &&
    !isMitmForwarded &&
    (isLoweInitialMessage || isSubstitutedKeyMessage)
  ) {
    const relayTarget = isLoweInitialMessage ? "Bob" : msg.to;
    console.log(
      `[MitM] Active relay intercept: protocol=${mitmManager.protocol}, type=${msg.type}, original=${msg.from}->${msg.to}, routed=${msg.from}->${relayTarget}`,
    );

    // Send intercepted message to Intruder with metadata
    if (intruderClient) {
      io.to(intruderClient.socketId).emit("message", {
        type: "MITM_INTERCEPT",
        from: "server",
        to: "Intruder",
        payload: {
          attackStep: isLoweInitialMessage
            ? "LOWE_MSG1_RELAY"
            : "KEY_SUBSTITUTION_RELAY",
          protocol: mitmManager.protocol,
          originalType: msg.type,
          originalFrom: msg.from,
          originalTo: relayTarget,
          originalRecipient: msg.to,
          routedFrom: msg.from,
          routedTo: relayTarget,
          keySubstituted: msg.to === "Bob",
          originalPayload: msg.payload,
        },
        timestamp: Date.now(),
      });
      console.log(
        `[MitM] Forwarded intercepted ${msg.type} to Intruder for ${relayTarget}`,
      );
    }

    // Do NOT forward to original recipient until Intruder re-encrypts with Bob's key.
    return;
  }

  // Normal routing
  const targetClient = getClient(clientManager, msg.to);
  if (targetClient) {
    io.to(targetClient.socketId).emit("message", msg);
    console.log(`Message routed: ${msg.type} from ${msg.from} to ${msg.to}`);
  } else {
    console.warn(`Target client not found: ${msg.to}`);
  }
}
