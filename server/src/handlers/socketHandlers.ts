import type { Server } from "socket.io";
import type { Socket } from "socket.io";
import type { PublicKeyJwk, WSMessage } from "../types";
import type { ClientManager } from "../services/ClientManager";
import type { MitmManager } from "../services/MitmManager";
import {
  registerClient,
  unregisterClient,
  findClientBySocketId,
  getAllClients,
  getClient,
} from "../services/ClientManager";
import { broadcastPeerList, routeMessage } from "../services/MessageRouter";
import {
  activateMitm,
  deactivateMitm,
  getInterceptedPackets,
  setAttackInProgress,
  setMitmProtocol,
} from "../services/MitmManager";

export function setupSocketHandlers(
  socket: Socket,
  io: Server,
  clientManager: ClientManager,
  mitmManager: MitmManager,
  currentProtocol: "NSPK" | "NSL" | null,
  setProtocol: (protocol: "NSPK" | "NSL" | null) => void,
): void {
  console.log(`Client connected: ${socket.id}`);

  socket.on("message", (msg: WSMessage) => {
    try {
      if (!msg || typeof msg !== "object" || !msg.type || !msg.from) {
        console.warn("Invalid message format received");
        return;
      }

      const { type, from, to, payload } = msg;
      const registeredClient = findClientBySocketId(clientManager, socket.id);
      const serverMessageTypes = new Set([
        "SET_PROTOCOL",
        "REGISTER",
        "DISCONNECT",
      ]);
      const isAllowedMitmRelay =
        registeredClient?.id === "Intruder" &&
        mitmManager.active &&
        mitmManager.protocol !== null &&
        (type === "NSL_MSG1" || type === "NSL_MSG3") &&
        from === "Alice" &&
        (to === "Bob" || to === "Intruder") &&
        typeof payload === "object" &&
        payload !== null &&
        (payload as { mitmForwarded?: unknown }).mitmForwarded === true;

      if (
        !serverMessageTypes.has(type) &&
        registeredClient?.id !== from &&
        !isAllowedMitmRelay
      ) {
        console.warn(
          `Rejected spoofed message: socket ${socket.id} attempted from=${from}, registered=${registeredClient?.id ?? "none"}`,
        );
        return;
      }

      if (type === "SET_PROTOCOL") {
        const { protocol } = payload as { protocol?: unknown };
        if (protocol !== "NSPK" && protocol !== "NSL") {
          console.warn(`Rejected invalid protocol: ${String(protocol)}`);
          return;
        }
        setProtocol(protocol);
        setMitmProtocol(mitmManager, protocol);

        // Broadcast to all clients
        io.emit("message", {
          type: "PROTOCOL_SET",
          from: "server",
          to: "all",
          payload: { protocol },
          timestamp: Date.now(),
        });

        console.log(`[Protocol] Set to ${protocol}`);
      } else if (type === "REGISTER") {
        const { id, publicKey } = payload as {
          id?: string;
          publicKey?: PublicKeyJwk;
        };

        const clientId =
          typeof id === "string" && id.trim().length > 0 ? id : from;
        if (
          clientId !== "Alice" &&
          clientId !== "Bob" &&
          clientId !== "Intruder"
        ) {
          console.warn(`Rejected invalid client id: ${clientId}`);
          return;
        }
        if (!publicKey || typeof publicKey !== "object") {
          console.warn(`Rejected registration without public key: ${clientId}`);
          return;
        }
        const existingClient = getClient(clientManager, clientId);

        if (existingClient && existingClient.socketId !== socket.id) {
          console.warn(
            `Rejected duplicate registration for ${clientId} from socket ${socket.id}`,
          );
          socket.emit("message", {
            type: "ERROR",
            from: "server",
            to: clientId,
            payload: { reason: `Role ${clientId} is already registered` },
            timestamp: Date.now(),
          });
          return;
        }

        registerClient(clientManager, {
          id: clientId,
          socketId: socket.id,
          socket: socket,
          publicKey,
        });
        console.log(`Client registered: ${clientId}`);
        if (!mitmManager.attackInProgress) {
          broadcastPeerList(io, clientManager, mitmManager);
        }
      } else if (type === "ACTIVATE_MITM") {
        // Intruder activates MitM attack
        if (registeredClient?.id === "Intruder") {
          const { publicKey } = payload as { publicKey?: PublicKeyJwk };
          if (!publicKey || typeof publicKey !== "object") {
            console.warn("Rejected MitM activation without public key");
            return;
          }
          activateMitm(mitmManager, publicKey);

          // Broadcast modified PEER_LIST to Alice
          broadcastPeerList(io, clientManager, mitmManager);

          socket.emit("message", {
            type: "MITM_ACTIVATED",
            from: "server",
            to: "Intruder",
            payload: { success: true },
            timestamp: Date.now(),
          });
          console.log("[MitM] Attack activated by Intruder");
        }
      } else if (type === "DEACTIVATE_MITM") {
        // Intruder deactivates MitM attack
        if (registeredClient?.id === "Intruder") {
          deactivateMitm(mitmManager);

          // Broadcast normal PEER_LIST to all
          broadcastPeerList(io, clientManager, mitmManager);

          socket.emit("message", {
            type: "MITM_DEACTIVATED",
            from: "server",
            to: "Intruder",
            payload: { success: true },
            timestamp: Date.now(),
          });
          console.log("[MitM] Attack deactivated by Intruder");
        }
      } else if (type === "GET_PACKETS") {
        // Intruder requests packet history
        if (registeredClient?.id === "Intruder") {
          const packets = getInterceptedPackets(mitmManager);
          socket.emit("message", {
            type: "PACKET_HISTORY",
            from: "server",
            to: "Intruder",
            payload: { packets },
            timestamp: Date.now(),
          });
        }
      } else if (type === "ATTACK_SIM") {
        if (registeredClient?.id === "Intruder") {
          if (!mitmManager.active || !mitmManager.protocol) {
            socket.emit("message", {
              type: "ATTACK_RESULT",
              from: "server",
              to: "Intruder",
              payload: {
                result: "failed",
                reason:
                  "Activate MitM and select a protocol before starting the attack",
              },
              timestamp: Date.now(),
            });
            return;
          }

          setAttackInProgress(mitmManager, true);
          broadcastPeerList(io, clientManager, mitmManager);

          const aliceClient = getClient(clientManager, "Alice");
          if (aliceClient) {
            io.to(aliceClient.socketId).emit("message", {
              type: "ATTACK_SIM",
              from: "server",
              to: "Alice",
              payload: { targetId: "Intruder" },
              timestamp: Date.now(),
            });
            console.log(
              `[MitM] Active Lowe attack simulation triggered for protocol=${mitmManager.protocol}: Alice targets Intruder, Intruder relays to Bob`,
            );
          } else {
            console.warn(
              "[MitM] Attack simulation requested but Alice not connected",
            );
          }
        }
      } else if (type === "DISCONNECT") {
        unregisterClient(clientManager, from);
        console.log(`Client disconnected: ${from}`);
        broadcastPeerList(io, clientManager, mitmManager);
      } else {
        routeMessage(io, msg, clientManager, mitmManager);
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  });

  socket.on("disconnect", () => {
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
        console.log(
          "[Server] All clients disconnected - reset protocol and MitM state",
        );
      }

      broadcastPeerList(io, clientManager, mitmManager);
    }
  });
}
