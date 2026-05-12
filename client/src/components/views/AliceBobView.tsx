import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../../store";
import { wsClient, send, onMessage } from "../../websocket";
import {
  generateRSAKeyPair,
  exportPublicKey,
  importPublicKey,
  encryptAES,
  decryptAES,
} from "../../crypto";
import {
  generateNonce,
  createMSG1,
  verifyMSG1,
  createMSG2,
  verifyMSG2,
  createMSG3,
  verifyMSG3,
  deriveSessionKey,
} from "../../protocol";
import type { ClientId, EncryptedMessage, WSMessage } from "../../types";
import { Chat } from "../chat/Chat";
import { ProtocolLog } from "../protocol/ProtocolLog";
import { PeerList } from "../peers/PeerList";
import { Badge, Avatar, EmptyState, StatusIndicator } from "../shared/ui";

interface PeerListItem {
  id: ClientId;
  publicKey: JsonWebKey;
}

export function AliceBobView() {
  const myId = useStore((state) => state.myId);
  const protocol = useStore((state) => state.protocol);
  const keyPair = useStore((state) => state.keyPair);
  const setKeyPair = useStore((state) => state.setKeyPair);
  const setPeers = useStore((state) => state.setPeers);
  const fsmState = useStore((state) => state.fsmState);
  const setFsmState = useStore((state) => state.setFsmState);
  const activePeerId = useStore((state) => state.activePeerId);
  const setActivePeerId = useStore((state) => state.setActivePeerId);
  const isInitiator = useStore((state) => state.isInitiator);
  const setIsInitiator = useStore((state) => state.setIsInitiator);
  const myNonce = useStore((state) => state.myNonce);
  const setMyNonce = useStore((state) => state.setMyNonce);
  const peerNonce = useStore((state) => state.peerNonce);
  const setPeerNonce = useStore((state) => state.setPeerNonce);
  const sessionKey = useStore((state) => state.sessionKey);
  const setSessionKey = useStore((state) => state.setSessionKey);
  const peers = useStore((state) => state.peers);
  const addProtocolLog = useStore((state) => state.addProtocolLog);
  const addChatMessage = useStore((state) => state.addChatMessage);
  const chatMessages = useStore((state) => state.chatMessages);
  const attackDetected = useStore((state) => state.attackDetected);
  const setAttackDetected = useStore((state) => state.setAttackDetected);
  const wsConnected = useStore((state) => state.wsConnected);

  const lastSentMessageRef = useRef<number>(0);
  const handshakeInitiatedRef = useRef<string | null>(null);

  const notifyHandshakeOk = useCallback(
    (peerId: string) => {
      if (!myId || !wsConnected) return;

      send(wsClient, {
        type: "HANDSHAKE_OK",
        from: myId,
        to: "server",
        payload: { peerId },
        timestamp: Date.now(),
      });
    },
    [myId, wsConnected],
  );

  const notifyProtocolError = useCallback(
    (peerId: string, reason: string) => {
      if (!myId || !wsConnected) return;

      send(wsClient, {
        type: "ERROR",
        from: myId,
        to: "server",
        payload: { peerId, reason },
        timestamp: Date.now(),
      });
    },
    [myId, wsConnected],
  );

  // Initialize keys. WebSocket connection is owned by App.
  useEffect(() => {
    const init = async () => {
      const keys = await generateRSAKeyPair();
      setKeyPair(keys);
    };
    init();
  }, [setKeyPair]);

  // Register with server when ID and keys are ready
  useEffect(() => {
    if (!myId || !keyPair || !wsConnected) return;

    const register = async () => {
      const publicKeyJWK = await exportPublicKey(keyPair.publicKey);
      send(wsClient, {
        type: "REGISTER",
        from: myId,
        to: "server",
        payload: { id: myId, publicKey: publicKeyJWK },
        timestamp: Date.now(),
      });
      addProtocolLog({
        type: "REGISTER",
        from: myId,
        to: "server",
        description: "Registered with server",
        timestamp: Date.now(),
        color: "blue",
      });
    };
    register();
  }, [myId, keyPair, wsConnected, addProtocolLog]);

  // Handle peer list updates
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      const { peers: peerList } = msg.payload as { peers: PeerListItem[] };
      console.log(
        "[PEER_LIST] Received peer list:",
        peerList.map((p) => p.id).join(", "),
      );

      const bobPeer = peerList.find((p) => p.id === "Bob");
      if (bobPeer) {
        console.log(
          "[PEER_LIST] Bob public key type:",
          typeof bobPeer.publicKey,
        );
        console.log(
          "[PEER_LIST] Bob public key n (first 50):",
          bobPeer.publicKey.n?.substring(0, 50),
        );
      }

      const importedPeers = await Promise.all(
        peerList.map(async (p) => ({
          id: p.id,
          publicKey: await importPublicKey(p.publicKey),
        })),
      );
      setPeers(importedPeers);
      console.log(
        "[PEER_LIST] Updated peers state, count:",
        importedPeers.length,
      );

      addProtocolLog({
        type: "PEER_LIST",
        from: "server",
        to: myId || "unknown",
        description: `Received peer list: ${peerList.map((p) => p.id).join(", ")}`,
        timestamp: Date.now(),
        color: "gray",
      });
    };

    return onMessage(wsClient, "PEER_LIST", handler);
  }, [setPeers, addProtocolLog, myId]);

  // Handle attack simulation (force Alice to initiate with Intruder)
  useEffect(() => {
    const handler = (msg: WSMessage) => {
      if (myId !== "Alice") return;

      const { targetId } = msg.payload as { targetId?: ClientId };
      const target = targetId ?? "Intruder";
      const currentPeers = useStore.getState().peers;
      const targetPeer = currentPeers.find((p) => p.id === target);

      if (!targetPeer) {
        console.error(
          "[AttackSim] Target not found:",
          target,
          "Available peers:",
          currentPeers.map((p) => p.id),
        );
        return;
      }

      handshakeInitiatedRef.current = null;
      setIsInitiator(true);
      setActivePeerId(target);

      addProtocolLog({
        type: "ATTACK_SIM",
        from: "server",
        to: myId,
        description:
          "MITM simulation: attacker substituted a hidden key and relays Alice's handshake to Bob",
        timestamp: Date.now(),
        color: "orange",
      });
    };

    return onMessage(wsClient, "ATTACK_SIM", handler);
  }, [myId, setActivePeerId, setIsInitiator, addProtocolLog]);

  // Initiate handshake when activePeerId changes (automatic on chat open)
  useEffect(() => {
    if (!activePeerId || !keyPair || !myId || !isInitiator || !protocol) return;

    // Hard guard against dual-init deadlocks for Alice/Bob.
    // Even if state updates race, only lexicographically smaller ID may initiate.
    const canInitiateThisPeer =
      activePeerId === "Intruder" || myId < activePeerId;
    if (!canInitiateThisPeer) {
      return;
    }

    // Guard: only initiate handshake once per selected peer.
    // Without this, SESSION state changes retrigger this effect and restart NSPK handshakes.
    if (handshakeInitiatedRef.current === activePeerId) {
      console.log(
        "[Handshake] Already initiated for",
        activePeerId,
        "- skipping",
      );
      return;
    }
    handshakeInitiatedRef.current = activePeerId;

    // Small delay to ensure peers state is updated from any pending PEER_LIST
    const timer = setTimeout(async () => {
      // Read peers from store at the moment of sending MSG1
      const currentPeers = useStore.getState().peers;

      console.log("[Handshake] Initiator check:", {
        activePeerId,
        keyPair: !!keyPair,
        myId,
        isInitiator,
        peersCount: currentPeers.length,
      });

      const peer = currentPeers.find((p) => p.id === activePeerId);
      if (!peer) {
        console.error(
          "[Handshake] Peer not found:",
          activePeerId,
          "Available peers:",
          currentPeers.map((p) => p.id),
        );
        return;
      }

      // Reset FSM state when opening new chat AS INITIATOR
      setFsmState("IDLE");
      setSessionKey(null);
      setMyNonce(null);
      setPeerNonce(null);
      setAttackDetected(false);

      console.log("[Handshake] Starting handshake with", activePeerId);
      setFsmState("HANDSHAKE");
      const nonce = generateNonce();
      setMyNonce(nonce);

      const msg1 = await createMSG1(myId, nonce, peer.publicKey);
      send(wsClient, {
        type: "NSL_MSG1",
        from: myId,
        to: activePeerId,
        payload: { ciphertext: msg1 },
        timestamp: Date.now(),
      });

      const timestamp = new Date().toLocaleTimeString("en-US", {
        hour12: false,
      });
      addProtocolLog({
        type: "NSL_MSG1",
        from: myId,
        to: activePeerId,
        description: `[${timestamp}] → Sending MSG1 to ${activePeerId}: E_PK${activePeerId[0].toLowerCase()}(NA, ID${myId[0]})`,
        timestamp: Date.now(),
        color: "green",
      });
    }, 100); // 100ms delay to ensure peers state is updated

    return () => clearTimeout(timer);
  }, [
    activePeerId,
    keyPair,
    myId,
    setFsmState,
    setMyNonce,
    addProtocolLog,
    setSessionKey,
    setPeerNonce,
    isInitiator,
    setAttackDetected,
    protocol,
  ]);

  // Handle MSG1 (responder)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || !myId || !protocol) return;

      const isNewConversation = !activePeerId || activePeerId !== msg.from;
      const isSamePeerDuringHandshake =
        fsmState === "HANDSHAKE" && activePeerId === msg.from;

      // Simultaneous initiation collision handling:
      // If both sides sent MSG1 at the same time, exactly one side should back off
      // and become responder. Deterministic rule: lexicographically larger ID backs off.
      if (isSamePeerDuringHandshake && isInitiator && myId > msg.from) {
        console.log(
          "[MSG1 Handler] Handshake collision detected. Backing off to responder:",
          myId,
          "<->",
          msg.from,
        );
        setIsInitiator(false);
      } else if (fsmState !== "IDLE" && !isNewConversation) {
        // Busy with current handshake/session and no collision backoff path.
        return;
      }

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };
        const { nonce: peerNonceValue, peerId } = await verifyMSG1(
          ciphertext,
          keyPair.privateKey,
        );

        const timestamp = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "NSL_MSG1",
          from: msg.from,
          to: myId,
          description: `[${timestamp}] ← Received MSG1 from ${msg.from}: E_PK${myId[0].toLowerCase()}(NA, ID${peerId[0]})`,
          timestamp: Date.now(),
          color: "blue",
        });

        // Reset state for new conversation
        if (isNewConversation) {
          setIsInitiator(false);
          setSessionKey(null);
          setMyNonce(null);
          setPeerNonce(null);
          setAttackDetected(false);
          setActivePeerId(msg.from as ClientId);
        }

        setPeerNonce(peerNonceValue);
        setFsmState("HANDSHAKE");

        addProtocolLog({
          type: "NSL_MSG1",
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ NA verified`,
          timestamp: Date.now(),
          color: "green",
        });

        addProtocolLog({
          type: "NSL_MSG1",
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ ID${peerId[0]} verified — no MitM detected`,
          timestamp: Date.now(),
          color: "green",
        });

        const myNonceValue = generateNonce();
        setMyNonce(myNonceValue);

        const peer = peers.find((p) => p.id === peerId);
        if (!peer) {
          console.error(
            "[MSG1 Handler] Peer not found:",
            peerId,
            "Available peers:",
            peers.map((p) => p.id),
          );
          throw new Error("Peer not found");
        }

        console.log("[MSG1 Handler] Sending MSG2 to", msg.from);
        const msg2 = await createMSG2(
          peerNonceValue,
          myNonceValue,
          myId,
          peer.publicKey,
          protocol,
        );
        send(wsClient, {
          type: "NSL_MSG2",
          from: myId,
          to: msg.from,
          payload: { ciphertext: msg2 },
          timestamp: Date.now(),
        });

        const timestamp2 = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "NSL_MSG2",
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] → Sending MSG2 to ${msg.from}: E_PK${peerId[0].toLowerCase()}(NA, NB, ID${myId[0]})`,
          timestamp: Date.now(),
          color: "green",
        });
      } catch (error) {
        setFsmState("ERROR");
        handshakeInitiatedRef.current = null;
        addProtocolLog({
          type: "ERROR",
          from: myId || "unknown",
          to: msg.from,
          description: `MSG1 verification failed: ${error}`,
          timestamp: Date.now(),
          color: "red",
        });
      }
    };

    return onMessage(wsClient, "NSL_MSG1", handler);
  }, [
    keyPair,
    fsmState,
    peers,
    myId,
    setPeerNonce,
    setFsmState,
    setMyNonce,
    addProtocolLog,
    activePeerId,
    setActivePeerId,
    setSessionKey,
    isInitiator,
    setIsInitiator,
    setAttackDetected,
    protocol,
  ]);

  // Handle MSG2 (initiator)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (
        !keyPair ||
        !myNonce ||
        fsmState !== "HANDSHAKE" ||
        !myId ||
        !protocol ||
        !activePeerId
      )
        return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };

        const timestamp = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "NSL_MSG2",
          from: msg.from,
          to: myId,
          description: `[${timestamp}] ← Received MSG2 from ${msg.from}: E_PK${myId[0].toLowerCase()}(NA, NB, ID${msg.from[0]})`,
          timestamp: Date.now(),
          color: "blue",
        });

        console.log("[MSG2 Handler] Verifying responder identity", {
          protocol,
          expectedPeerId: activePeerId,
          messageFrom: msg.from,
        });

        const { peerNonce: peerNonceValue } = await verifyMSG2(
          ciphertext,
          myNonce,
          keyPair.privateKey,
          activePeerId,
          protocol,
        );

        addProtocolLog({
          type: "NSL_MSG2",
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ NA verified`,
          timestamp: Date.now(),
          color: "green",
        });

        addProtocolLog({
          type: "NSL_MSG2",
          from: myId,
          to: msg.from,
          description:
            protocol === "NSL"
              ? `[${timestamp}] ✓ ID${activePeerId?.[0] ?? msg.from[0]} verified — no MitM detected`
              : `[${timestamp}] ⚠ NSPK has no responder identity in MSG2`,
          timestamp: Date.now(),
          color: protocol === "NSL" ? "green" : "orange",
        });

        setPeerNonce(peerNonceValue);

        const peer = peers.find((p) => p.id === activePeerId);
        if (!peer) throw new Error("Peer not found");

        const msg3 = await createMSG3(peerNonceValue, peer.publicKey);
        send(wsClient, {
          type: "NSL_MSG3",
          from: myId,
          to: activePeerId,
          payload: { ciphertext: msg3 },
          timestamp: Date.now(),
        });

        const timestamp2 = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "NSL_MSG3",
          from: myId,
          to: activePeerId,
          description: `[${timestamp2}] → Sending MSG3 to ${activePeerId}: E_PK${activePeerId[0].toLowerCase()}(NB)`,
          timestamp: Date.now(),
          color: "green",
        });

        // Derive session key
        const sessionKeyValue = await deriveSessionKey(myNonce, peerNonceValue);
        setSessionKey(sessionKeyValue);
        setFsmState("SESSION");

        const timestamp3 = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "HANDSHAKE_OK",
          from: myId,
          to: msg.from,
          description: `[${timestamp3}] 🔐 Session key derived: SHA-256(NA||NB)`,
          timestamp: Date.now(),
          color: "green",
        });

        addProtocolLog({
          type: "HANDSHAKE_OK",
          from: myId,
          to: msg.from,
          description: `[${timestamp3}] ✅ Handshake complete. Channel is secure.`,
          timestamp: Date.now(),
          color: "green",
        });
        notifyHandshakeOk(activePeerId);
      } catch (error) {
        setFsmState("ERROR");
        handshakeInitiatedRef.current = null;
        setSessionKey(null);
        setMyNonce(null);
        setPeerNonce(null);

        const errorMsg = String(error);
        console.warn("[MSG2 Handler] Handshake aborted", {
          protocol,
          expectedPeerId: activePeerId,
          messageFrom: msg.from,
          reason: errorMsg,
        });

        // Check if this is an identity mismatch attack
        if (
          errorMsg.includes("Identity mismatch") ||
          errorMsg.includes("expected")
        ) {
          const isHiddenIntruderAttack =
            myId === "Alice" && activePeerId === "Intruder";
          const safePeerId = isHiddenIntruderAttack ? "Bob" : activePeerId;
          setAttackDetected(true);
          addProtocolLog({
            type: "ERROR",
            from: myId || "unknown",
            to: msg.from,
            description: isHiddenIntruderAttack
              ? "❌ NSL BLOCKED MITM: Bob's identity in MSG2 exposed the hidden attacker relay. Connection terminated."
              : `❌ NSL BLOCKED MITM: ${errorMsg}`,
            timestamp: Date.now(),
            color: "red",
          });
          notifyProtocolError(msg.from, `ATTACK DETECTED: ${errorMsg}`);

          if (isHiddenIntruderAttack) {
            setActivePeerId(safePeerId);
            setIsInitiator(true);
            setFsmState("IDLE");
            setAttackDetected(false);
            handshakeInitiatedRef.current = null;
            addChatMessage({
              from: "system",
              to: myId,
              text: "🛡️ Intruder blocked by NSL. Starting a clean Alice ↔ Bob channel.",
              timestamp: Date.now(),
              isSystem: true,
            });
          }
        } else {
          addProtocolLog({
            type: "ERROR",
            from: myId || "unknown",
            to: msg.from,
            description: `MSG2 verification failed: ${errorMsg}`,
            timestamp: Date.now(),
            color: "red",
          });
          notifyProtocolError(
            msg.from,
            `MSG2 verification failed: ${errorMsg}`,
          );
        }

        setTimeout(() => {
          setFsmState("IDLE");
        }, 2000);
      }
    };

    return onMessage(wsClient, "NSL_MSG2", handler);
  }, [
    keyPair,
    myNonce,
    fsmState,
    peers,
    myId,
    setPeerNonce,
    setSessionKey,
    setFsmState,
    addProtocolLog,
    addChatMessage,
    setAttackDetected,
    activePeerId,
    protocol,
    setMyNonce,
    setActivePeerId,
    setIsInitiator,
    notifyHandshakeOk,
    notifyProtocolError,
  ]);

  // Handle MSG3 (responder)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (
        !keyPair ||
        !myNonce ||
        !peerNonce ||
        fsmState !== "HANDSHAKE" ||
        !myId
      )
        return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };

        const timestamp = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "NSL_MSG3",
          from: msg.from,
          to: myId,
          description: `[${timestamp}] ← Received MSG3 from ${msg.from}: E_PK${myId[0].toLowerCase()}(NB)`,
          timestamp: Date.now(),
          color: "blue",
        });

        await verifyMSG3(ciphertext, myNonce, keyPair.privateKey);

        addProtocolLog({
          type: "NSL_MSG3",
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ NB verified`,
          timestamp: Date.now(),
          color: "green",
        });

        // Derive session key (responder uses peerNonce first)
        const sessionKeyValue = await deriveSessionKey(peerNonce, myNonce);
        setSessionKey(sessionKeyValue);
        setFsmState("SESSION");

        const timestamp2 = new Date().toLocaleTimeString("en-US", {
          hour12: false,
        });
        addProtocolLog({
          type: "HANDSHAKE_OK",
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] 🔐 Session key derived: SHA-256(NA||NB)`,
          timestamp: Date.now(),
          color: "green",
        });

        addProtocolLog({
          type: "HANDSHAKE_OK",
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] ✅ Handshake complete. Channel is secure.`,
          timestamp: Date.now(),
          color: "green",
        });
        notifyHandshakeOk(msg.from);
      } catch (error) {
        setFsmState("ERROR");
        handshakeInitiatedRef.current = null;
        addProtocolLog({
          type: "ERROR",
          from: myId || "unknown",
          to: msg.from,
          description: `MSG3 verification failed: ${error}`,
          timestamp: Date.now(),
          color: "red",
        });
        notifyProtocolError(msg.from, `MSG3 verification failed: ${error}`);
      }
    };

    return onMessage(wsClient, "NSL_MSG3", handler);
  }, [
    keyPair,
    myNonce,
    peerNonce,
    fsmState,
    myId,
    setSessionKey,
    setFsmState,
    addProtocolLog,
    notifyHandshakeOk,
    notifyProtocolError,
  ]);

  // Handle SESSION_END
  useEffect(() => {
    const handler = (msg: WSMessage) => {
      if (msg.from === activePeerId) {
        // Peer ended session - return to contacts screen
        setActivePeerId(null);
        setFsmState("IDLE");
        setSessionKey(null);
        setMyNonce(null);
        setPeerNonce(null);
        setAttackDetected(false);

        // Show system message in chat (if still visible)
        if (!myId) return;

        addChatMessage({
          from: "system",
          to: myId,
          text: `${msg.from} завершив сесію`,
          timestamp: Date.now(),
          isSystem: true,
        });

        addProtocolLog({
          type: "SESSION_END",
          from: msg.from,
          to: myId,
          description: `${msg.from} завершив сесію`,
          timestamp: Date.now(),
          color: "gray",
        });
      }
    };

    return onMessage(wsClient, "SESSION_END", handler);
  }, [
    activePeerId,
    myId,
    setActivePeerId,
    setFsmState,
    setSessionKey,
    setMyNonce,
    setPeerNonce,
    setAttackDetected,
    addChatMessage,
    addProtocolLog,
  ]);

  // Handle encrypted chat messages
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!sessionKey || !myId || msg.from !== activePeerId || msg.to !== myId)
        return;

      try {
        const { encrypted } = msg.payload as { encrypted: EncryptedMessage };
        const decrypted = await decryptAES(encrypted, sessionKey);
        const text = new TextDecoder().decode(decrypted);

        addChatMessage({
          from: activePeerId,
          to: myId,
          text,
          timestamp: Date.now(),
        });

        addProtocolLog({
          type: "CHAT_MSG",
          from: msg.from,
          to: msg.to,
          description: `✓ Decrypted message successfully`,
          timestamp: Date.now(),
          color: "blue",
        });
      } catch (error) {
        // Show error in chat
        addChatMessage({
          from: "system",
          to: myId,
          text: `⚠️ Не вдалося розшифрувати повідомлення від ${msg.from}`,
          timestamp: Date.now(),
          isSystem: true,
        });

        addProtocolLog({
          type: "ERROR",
          from: myId || "unknown",
          to: msg.from,
          description: `Failed to decrypt message: ${error}`,
          timestamp: Date.now(),
          color: "red",
        });
      }
    };

    return onMessage(wsClient, "CHAT_MSG", handler);
  }, [sessionKey, myId, activePeerId, addChatMessage, addProtocolLog]);

  // Send encrypted chat messages
  useEffect(() => {
    const lastMessage = chatMessages[chatMessages.length - 1];
    if (
      lastMessage &&
      lastMessage.from === myId &&
      lastMessage.timestamp > lastSentMessageRef.current &&
      sessionKey &&
      activePeerId
    ) {
      lastSentMessageRef.current = lastMessage.timestamp;

      const sendEncrypted = async () => {
        if (!myId) return;

        try {
          const encoded = new TextEncoder().encode(lastMessage.text);
          const encrypted = await encryptAES(encoded, sessionKey);

          send(wsClient, {
            type: "CHAT_MSG",
            from: myId,
            to: activePeerId,
            payload: { encrypted },
            timestamp: Date.now(),
          });

          addProtocolLog({
            type: "CHAT_MSG",
            from: myId,
            to: activePeerId,
            description: `✓ Sent encrypted message`,
            timestamp: Date.now(),
            color: "blue",
          });
        } catch (error) {
          // Show error in chat
          addChatMessage({
            from: "system" as ClientId,
            to: myId,
            text: `⚠️ Повідомлення не відправлено`,
            timestamp: Date.now(),
            isSystem: true,
          });

          addProtocolLog({
            type: "ERROR",
            from: myId,
            to: activePeerId,
            description: `Failed to send message: ${error}`,
            timestamp: Date.now(),
            color: "red",
          });
        }
      };
      sendEncrypted();
    }
  }, [
    chatMessages,
    myId,
    sessionKey,
    activePeerId,
    addProtocolLog,
    addChatMessage,
  ]);

  // Filter peers: show only the other person (Alice sees Bob, Bob sees Alice)
  const availablePeers = peers.filter((peer) => {
    if (peer.id === myId) return false;
    if (peer.id === "Intruder") return false;
    return true;
  });

  const handleCloseChat = () => {
    // Notify peer about session end
    if (activePeerId && myId) {
      send(wsClient, {
        type: "SESSION_END",
        from: myId,
        to: activePeerId,
        payload: {},
        timestamp: Date.now(),
      });
    }

    // Reset local state
    handshakeInitiatedRef.current = null;
    setActivePeerId(null);
    setFsmState("IDLE");
    setSessionKey(null);
    setMyNonce(null);
    setPeerNonce(null);
    setAttackDetected(false);
  };

  const getConnectionStatus = () => {
    if (fsmState === "SESSION")
      return { icon: "🟢", text: "Encrypted", color: "text-green-500" };
    if (fsmState === "HANDSHAKE")
      return { icon: "🟡", text: "Handshake...", color: "text-yellow-500" };
    return { icon: "🔴", text: "Offline", color: "text-red-500" };
  };

  const status = getConnectionStatus();
  const isHiddenIntruderAttack =
    myId === "Alice" && activePeerId === "Intruder";
  const displayedPeerId = isHiddenIntruderAttack ? "Bob" : activePeerId;
  const displayedPeerTitle = isHiddenIntruderAttack
    ? "Bob — MITM simulation"
    : activePeerId;

  const getMyGradient = () => {
    if (myId === "Alice")
      return "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
    if (myId === "Bob")
      return "linear-gradient(135deg, #10b981 0%, #059669 100%)";
    return "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)";
  };

  const getMyIcon = () => {
    if (myId === "Alice") return "👩";
    if (myId === "Bob") return "👨";
    return "👤";
  };

  return (
    <div className="h-screen w-full bg-[#09090b] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-[#111113]/95 border-b border-white/10 px-4 lg:px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar icon={getMyIcon()} gradient={getMyGradient()} size="sm" />
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-white tracking-tight truncate">
                {myId}
              </h1>
              <p className="text-xs text-white/40 truncate">
                Needham-Schroeder demo
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/10">
              <span className="text-sm">{status.icon}</span>
              <span className={`text-xs font-medium ${status.color}`}>
                {status.text}
              </span>
            </div>

            {protocol && (
              <Badge
                color={protocol === "NSL" ? "green" : "amber"}
                className="text-[11px]"
              >
                {protocol} {protocol === "NSL" ? "✅" : "⚠️"}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
        {/* Left sidebar - Contacts */}
        <aside className="bg-[#111113] border-r border-white/10 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 shrink-0">
            <h2 className="text-sm font-semibold text-white">Contacts</h2>
            <p className="text-[11px] text-white/40 mt-0.5">
              {availablePeers.length} available
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <PeerList />
          </div>
        </aside>

        {/* Right panel - Chat or empty state */}
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {activePeerId ? (
            <>
              {/* Chat header */}
              <div className="bg-[#111113] border-b border-white/10 px-4 lg:px-5 py-3 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    icon={displayedPeerId === "Alice" ? "👩" : "👨"}
                    gradient={
                      displayedPeerId === "Alice"
                        ? "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)"
                        : "linear-gradient(135deg, #10b981 0%, #059669 100%)"
                    }
                    size="md"
                  />
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-white truncate">
                      {displayedPeerTitle}
                    </h2>
                    <p className="text-xs text-white/40 truncate">
                      {fsmState === "IDLE" && "Initiating handshake..."}
                      {fsmState === "HANDSHAKE" &&
                        "🔄 Handshake in progress..."}
                      {fsmState === "SESSION" &&
                        "🔒 Secure session established"}
                      {fsmState === "ERROR" && "❌ Connection error"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCloseChat}
                  className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-all duration-200 shrink-0"
                >
                  Close
                </button>
              </div>

              {/* Attack simulation / detection banners */}
              {isHiddenIntruderAttack && !attackDetected && (
                <div className="p-3 pb-0 shrink-0">
                  <StatusIndicator
                    type="warning"
                    title="ACTIVE MITM SIMULATION"
                    description="Intruder is hidden from contacts. This panel stays on Bob while the attacker silently substitutes a key and relays the handshake."
                  />
                </div>
              )}

              {attackDetected && (
                <div className="p-3 pb-0 shrink-0">
                  <StatusIndicator
                    type="error"
                    title="ATTACK DETECTED!"
                    description={
                      isHiddenIntruderAttack
                        ? "NSL verified the responder identity in MSG2: Bob answered through a hidden attacker relay, so the handshake was terminated."
                        : `Identity mismatch in MSG2. Expected ${activePeerId}, but received different identity. Connection terminated.`
                    }
                  />
                </div>
              )}

              {/* Chat area */}
              <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1fr)_420px] overflow-hidden">
                <section className="min-w-0 min-h-0 overflow-hidden">
                  <Chat />
                </section>
                <aside className="min-w-0 min-h-0 border-l border-white/10 bg-[#09090b] overflow-hidden">
                  <ProtocolLog />
                </aside>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={
                  <svg
                    className="w-16 h-16"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                    />
                  </svg>
                }
                title="Select a contact to start messaging"
                description="Choose a peer from the list to begin secure communication"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
