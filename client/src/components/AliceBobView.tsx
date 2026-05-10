import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { wsClient, connect, disconnect, send, onMessage, onConnect, isConnected } from '../websocket';
import { generateRSAKeyPair, exportPublicKey, importPublicKey, encryptAES, decryptAES } from '../crypto';
import { generateNonce, createMSG1, verifyMSG1, createMSG2, verifyMSG2, createMSG3, verifyMSG3, deriveSessionKey } from '../protocol';
import type { ClientId, WSMessage } from '../types';
import { Chat } from './Chat';
import { ProtocolLog } from './ProtocolLog';

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

  const lastSentMessageRef = useRef<number>(0);

  // Initialize keys and WebSocket
  useEffect(() => {
    const init = async () => {
      const keys = await generateRSAKeyPair();
      setKeyPair(keys);
    };
    init();

    connect(wsClient);
    onConnect(wsClient, () => {
      console.log('WebSocket connected');
    });

    return () => {
      disconnect(wsClient);
    };
  }, [setKeyPair]);

  // Register with server when ID and keys are ready
  useEffect(() => {
    if (!myId || !keyPair || !isConnected(wsClient)) return;

    const register = async () => {
      const publicKeyJWK = await exportPublicKey(keyPair.publicKey);
      send(wsClient, {
        type: 'REGISTER',
        from: myId,
        to: 'server',
        payload: { id: myId, publicKey: publicKeyJWK },
        timestamp: Date.now(),
      });
      addProtocolLog({
        type: 'REGISTER',
        from: myId,
        to: 'server',
        description: 'Registered with server',
        timestamp: Date.now(),
        color: 'blue',
      });
    };
    register();
  }, [myId, keyPair, addProtocolLog]);

  // Handle peer list updates
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      const { peers: peerList } = msg.payload as { peers: any[] };
      const importedPeers = await Promise.all(
        peerList.map(async (p: any) => ({
          id: p.id,
          publicKey: await importPublicKey(p.publicKey),
        }))
      );
      setPeers(importedPeers);
      addProtocolLog({
        type: 'PEER_LIST',
        from: 'server',
        to: myId || 'unknown',
        description: `Received peer list: ${peerList.map((p: any) => p.id).join(', ')}`,
        timestamp: Date.now(),
        color: 'gray',
      });
    };

    onMessage(wsClient, 'PEER_LIST', handler);

    return () => {
      // Cleanup
    };
  }, [setPeers, addProtocolLog, myId]);

  // Initiate handshake when activePeerId changes (automatic on chat open)
  useEffect(() => {
    if (!activePeerId || !keyPair || !myId || !isInitiator) return;

    // Reset FSM state when opening new chat AS INITIATOR
    setFsmState('IDLE');
    setSessionKey(null);
    setMyNonce(null);
    setPeerNonce(null);
    setAttackDetected(false);

    const initiateHandshake = async () => {
      const peer = peers.find((p) => p.id === activePeerId);
      if (!peer) return;

      setFsmState('HANDSHAKE');
      const nonce = generateNonce();
      setMyNonce(nonce);

      const msg1 = await createMSG1(myId, nonce, peer.publicKey);
      send(wsClient, {
        type: 'NSL_MSG1',
        from: myId,
        to: activePeerId,
        payload: { ciphertext: msg1 },
        timestamp: Date.now(),
      });

      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
      addProtocolLog({
        type: 'NSL_MSG1',
        from: myId,
        to: activePeerId,
        description: `[${timestamp}] → Sending MSG1 to ${activePeerId}: E_PK${activePeerId[0].toLowerCase()}(NA, ID${myId[0]})`,
        timestamp: Date.now(),
        color: 'green',
      });
    };
    initiateHandshake();
  }, [activePeerId, keyPair, peers, myId, setFsmState, setMyNonce, addProtocolLog, setSessionKey, setPeerNonce, isInitiator, setAttackDetected]);

  // Handle MSG1 (responder)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || !myId) return;

      const isNewConversation = !activePeerId || activePeerId !== msg.from;

      if (fsmState !== 'IDLE' && !isNewConversation) {
        return;
      }

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };
        const { nonce: peerNonceValue, peerId } = await verifyMSG1(ciphertext, keyPair.privateKey);

        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'NSL_MSG1',
          from: msg.from,
          to: myId,
          description: `[${timestamp}] ← Received MSG1 from ${msg.from}: E_PK${myId[0].toLowerCase()}(NA, ID${peerId[0]})`,
          timestamp: Date.now(),
          color: 'blue',
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
        setFsmState('HANDSHAKE');

        addProtocolLog({
          type: 'NSL_MSG1',
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ NA verified`,
          timestamp: Date.now(),
          color: 'green',
        });

        addProtocolLog({
          type: 'NSL_MSG1',
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ ID${peerId[0]} verified — no MitM detected`,
          timestamp: Date.now(),
          color: 'green',
        });

        const myNonceValue = generateNonce();
        setMyNonce(myNonceValue);

        const peer = peers.find((p) => p.id === peerId);
        if (!peer) throw new Error('Peer not found');

        const msg2 = await createMSG2(peerNonceValue, myNonceValue, myId, peer.publicKey, protocol!);
        send(wsClient, {
          type: 'NSL_MSG2',
          from: myId,
          to: msg.from,
          payload: { ciphertext: msg2 },
          timestamp: Date.now(),
        });

        const timestamp2 = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'NSL_MSG2',
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] → Sending MSG2 to ${msg.from}: E_PK${peerId[0].toLowerCase()}(NA, NB, ID${myId[0]})`,
          timestamp: Date.now(),
          color: 'green',
        });
      } catch (error) {
        setFsmState('ERROR');
        addProtocolLog({
          type: 'ERROR',
          from: myId || 'unknown',
          to: msg.from,
          description: `MSG1 verification failed: ${error}`,
          timestamp: Date.now(),
          color: 'red',
        });
      }
    };

    onMessage(wsClient, 'NSL_MSG1', handler);

    return () => {
      // Cleanup
    };
  }, [keyPair, fsmState, peers, myId, setPeerNonce, setFsmState, setMyNonce, addProtocolLog, activePeerId, setActivePeerId, setSessionKey, setIsInitiator, setAttackDetected]);

  // Handle MSG2 (initiator)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || !myNonce || fsmState !== 'HANDSHAKE' || !myId) return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };

        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'NSL_MSG2',
          from: msg.from,
          to: myId,
          description: `[${timestamp}] ← Received MSG2 from ${msg.from}: E_PK${myId[0].toLowerCase()}(NA, NB, ID${msg.from[0]})`,
          timestamp: Date.now(),
          color: 'blue',
        });

        const { peerNonce: peerNonceValue } = await verifyMSG2(
          ciphertext,
          myNonce,
          keyPair.privateKey,
          msg.from as ClientId,
          protocol!
        );

        addProtocolLog({
          type: 'NSL_MSG2',
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ NA verified`,
          timestamp: Date.now(),
          color: 'green',
        });

        addProtocolLog({
          type: 'NSL_MSG2',
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ ID${msg.from[0]} verified — no MitM detected`,
          timestamp: Date.now(),
          color: 'green',
        });

        setPeerNonce(peerNonceValue);

        const peer = peers.find((p) => p.id === msg.from);
        if (!peer) throw new Error('Peer not found');

        const msg3 = await createMSG3(peerNonceValue, peer.publicKey);
        send(wsClient, {
          type: 'NSL_MSG3',
          from: myId,
          to: msg.from,
          payload: { ciphertext: msg3 },
          timestamp: Date.now(),
        });

        const timestamp2 = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'NSL_MSG3',
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] → Sending MSG3 to ${msg.from}: E_PK${msg.from[0].toLowerCase()}(NB)`,
          timestamp: Date.now(),
          color: 'green',
        });

        // Derive session key
        const sessionKeyValue = await deriveSessionKey(myNonce, peerNonceValue);
        setSessionKey(sessionKeyValue);
        setFsmState('SESSION');

        const timestamp3 = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'HANDSHAKE_OK',
          from: myId,
          to: msg.from,
          description: `[${timestamp3}] 🔐 Session key derived: SHA-256(NA||NB)`,
          timestamp: Date.now(),
          color: 'green',
        });

        addProtocolLog({
          type: 'HANDSHAKE_OK',
          from: myId,
          to: msg.from,
          description: `[${timestamp3}] ✅ Handshake complete. Channel is secure.`,
          timestamp: Date.now(),
          color: 'green',
        });
      } catch (error) {
        setFsmState('ERROR');
        setSessionKey(null);
        setMyNonce(null);
        setPeerNonce(null);

        const errorMsg = String(error);

        // Check if this is an identity mismatch attack
        if (errorMsg.includes('Identity mismatch') || errorMsg.includes('expected')) {
          setAttackDetected(true);
          addProtocolLog({
            type: 'ERROR',
            from: myId || 'unknown',
            to: msg.from,
            description: `❌ ATTACK DETECTED: ${errorMsg}`,
            timestamp: Date.now(),
            color: 'red',
          });
        } else {
          addProtocolLog({
            type: 'ERROR',
            from: myId || 'unknown',
            to: msg.from,
            description: `MSG2 verification failed: ${errorMsg}`,
            timestamp: Date.now(),
            color: 'red',
          });
        }

        setTimeout(() => {
          setFsmState('IDLE');
        }, 2000);
      }
    };

    onMessage(wsClient, 'NSL_MSG2', handler);

    return () => {
      // Cleanup
    };
  }, [keyPair, myNonce, fsmState, peers, myId, setPeerNonce, setSessionKey, setFsmState, addProtocolLog, setAttackDetected]);

  // Handle MSG3 (responder)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || !myNonce || !peerNonce || fsmState !== 'HANDSHAKE' || !myId) return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };

        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'NSL_MSG3',
          from: msg.from,
          to: myId,
          description: `[${timestamp}] ← Received MSG3 from ${msg.from}: E_PK${myId[0].toLowerCase()}(NB)`,
          timestamp: Date.now(),
          color: 'blue',
        });

        await verifyMSG3(ciphertext, myNonce, keyPair.privateKey);

        addProtocolLog({
          type: 'NSL_MSG3',
          from: myId,
          to: msg.from,
          description: `[${timestamp}] ✓ NB verified`,
          timestamp: Date.now(),
          color: 'green',
        });

        // Derive session key (responder uses peerNonce first)
        const sessionKeyValue = await deriveSessionKey(peerNonce, myNonce);
        setSessionKey(sessionKeyValue);
        setFsmState('SESSION');

        const timestamp2 = new Date().toLocaleTimeString('en-US', { hour12: false });
        addProtocolLog({
          type: 'HANDSHAKE_OK',
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] 🔐 Session key derived: SHA-256(NA||NB)`,
          timestamp: Date.now(),
          color: 'green',
        });

        addProtocolLog({
          type: 'HANDSHAKE_OK',
          from: myId,
          to: msg.from,
          description: `[${timestamp2}] ✅ Handshake complete. Channel is secure.`,
          timestamp: Date.now(),
          color: 'green',
        });
      } catch (error) {
        setFsmState('ERROR');
        addProtocolLog({
          type: 'ERROR',
          from: myId || 'unknown',
          to: msg.from,
          description: `MSG3 verification failed: ${error}`,
          timestamp: Date.now(),
          color: 'red',
        });
      }
    };

    onMessage(wsClient, 'NSL_MSG3', handler);

    return () => {
      // Cleanup
    };
  }, [keyPair, myNonce, peerNonce, fsmState, myId, setSessionKey, setFsmState, addProtocolLog]);

  // Handle encrypted chat messages
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!sessionKey) return;

      try {
        const { encrypted } = msg.payload as { encrypted: any };
        const decrypted = await decryptAES(encrypted, sessionKey);
        const text = new TextDecoder().decode(decrypted);

        addChatMessage({
          from: msg.from as ClientId,
          to: msg.to as ClientId,
          text,
          timestamp: Date.now(),
        });

        addProtocolLog({
          type: 'CHAT_MSG',
          from: msg.from,
          to: msg.to,
          description: `✓ Decrypted message successfully`,
          timestamp: Date.now(),
          color: 'blue',
        });
      } catch (error) {
        addProtocolLog({
          type: 'ERROR',
          from: myId || 'unknown',
          to: msg.from,
          description: `Failed to decrypt message: ${error}`,
          timestamp: Date.now(),
          color: 'red',
        });
      }
    };

    onMessage(wsClient, 'CHAT_MSG', handler);

    return () => {
      // Cleanup
    };
  }, [sessionKey, myId, addChatMessage, addProtocolLog]);

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
            type: 'CHAT_MSG',
            from: myId,
            to: activePeerId,
            payload: { encrypted },
            timestamp: Date.now(),
          });

          addProtocolLog({
            type: 'CHAT_MSG',
            from: myId,
            to: activePeerId,
            description: `✓ Sent encrypted message`,
            timestamp: Date.now(),
            color: 'blue',
          });
        } catch (error) {
          addProtocolLog({
            type: 'ERROR',
            from: myId,
            to: activePeerId,
            description: `Failed to send message: ${error}`,
            timestamp: Date.now(),
            color: 'red',
          });
        }
      };
      sendEncrypted();
    }
  }, [chatMessages, myId, sessionKey, activePeerId, addProtocolLog]);

  // Filter peers: show only the other person (Alice sees Bob, Bob sees Alice)
  const availablePeers = peers.filter((peer) => {
    if (peer.id === myId) return false;
    if (peer.id === 'Intruder') return false;
    return true;
  });

  const handleSelectPeer = (peerId: ClientId) => {
    // Deterministic initiator selection: smaller ID is always initiator
    const amInitiator = myId! < peerId;
    setIsInitiator(amInitiator);
    setActivePeerId(peerId);
  };

  const handleCloseChat = () => {
    setActivePeerId(null);
    setFsmState('IDLE');
    setSessionKey(null);
    setMyNonce(null);
    setPeerNonce(null);
    setAttackDetected(false);
  };

  const getConnectionStatus = () => {
    if (fsmState === 'SESSION') return { icon: '🟢', text: 'Encrypted', color: 'text-green-500' };
    if (fsmState === 'HANDSHAKE') return { icon: '🟡', text: 'Handshake...', color: 'text-yellow-500' };
    return { icon: '🔴', text: 'Offline', color: 'text-red-500' };
  };

  const status = getConnectionStatus();

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">NSL Protocol Demo - {myId}</h1>
        <div className="flex items-center gap-2">
          <span className="text-xl">{status.icon}</span>
          <span className={`font-semibold ${status.color}`}>{status.text}</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Contacts */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Contacts</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            {availablePeers.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <p>No contacts available</p>
                <p className="text-xs mt-2">Waiting for other users...</p>
              </div>
            ) : (
              <ul className="divide-y">
                {availablePeers.map((peer) => (
                  <li key={peer.id}>
                    <button
                      onClick={() => handleSelectPeer(peer.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                        activePeerId === peer.id ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-lg">
                          {peer.id[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-gray-900">{peer.id}</div>
                          <div className="text-sm text-gray-500 truncate">
                            {activePeerId === peer.id ? 'Active chat' : 'Click to open chat'}
                          </div>
                        </div>
                        {activePeerId === peer.id && (
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right panel - Chat or empty state */}
        <div className="flex-1 flex flex-col">
          {activePeerId ? (
            <>
              {/* Chat header */}
              <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{activePeerId}</h2>
                  <p className="text-sm text-gray-500">
                    {fsmState === 'IDLE' && 'Initiating handshake...'}
                    {fsmState === 'HANDSHAKE' && '🔄 Handshake in progress...'}
                    {fsmState === 'SESSION' && '🔒 Secure session established'}
                    {fsmState === 'ERROR' && '❌ Connection error'}
                  </p>
                </div>
                <button
                  onClick={handleCloseChat}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Close
                </button>
              </div>

              {/* Attack detection banner */}
              {attackDetected && (
                <div className="bg-red-600 text-white px-6 py-3 flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-bold">ATTACK DETECTED!</p>
                    <p className="text-sm">Identity mismatch in MSG2. Expected {activePeerId}, but received different identity. Connection terminated.</p>
                  </div>
                </div>
              )}

              {/* Chat area */}
              <div className="flex-1 flex">
                <div className="flex-1">
                  <Chat />
                </div>
                <div className="w-96 border-l bg-gray-50">
                  <ProtocolLog />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
              <div className="text-center text-gray-400">
                <svg className="w-24 h-24 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-lg">Select a contact to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
