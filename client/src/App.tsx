import { useEffect, useRef } from 'react';
import { useStore } from './store';
import { wsClient, connect, disconnect, send, onMessage, onConnect, isConnected } from './websocket';
import { generateRSAKeyPair, exportPublicKey, importPublicKey, encryptAES, decryptAES } from './crypto';
import { generateNonce, createMSG1, verifyMSG1, createMSG2, verifyMSG2, createMSG3, verifyMSG3, deriveSessionKey } from './protocol';
import { PeerList } from './components/PeerList';
import { Chat } from './components/Chat';
import { ProtocolLog } from './components/ProtocolLog';
import { IntruderPanel } from './components/IntruderPanel';
import type { ClientId, WSMessage } from './types';

function App() {
  const myId = useStore((state) => state.myId);
  const setMyId = useStore((state) => state.setMyId);
  const keyPair = useStore((state) => state.keyPair);
  const setKeyPair = useStore((state) => state.setKeyPair);
  const setPeers = useStore((state) => state.setPeers);
  const fsmState = useStore((state) => state.fsmState);
  const setFsmState = useStore((state) => state.setFsmState);
  const activePeerId = useStore((state) => state.activePeerId);
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

  // Intruder attack state
  const attackMode = useStore((state) => state.attackMode);
  const attackTarget = useStore((state) => state.attackTarget);
  const setInterceptedNonce = useStore((state) => state.setInterceptedNonce);
  const setInterceptedSender = useStore((state) => state.setInterceptedSender);
  const interceptedNonce = useStore((state) => state.interceptedNonce);
  const interceptedSender = useStore((state) => state.interceptedSender);

  // Track last sent message to prevent race condition
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
      // Cleanup: handler is replaced on re-mount
    };
  }, [setPeers, addProtocolLog, myId]);

  // Initiate handshake when activePeerId changes (automatic on chat open)
  useEffect(() => {
    if (!activePeerId || fsmState !== 'IDLE' || !keyPair || !myId) return;

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

      addProtocolLog({
        type: 'NSL_MSG1',
        from: myId,
        to: activePeerId,
        description: 'Sent MSG1: {Na, A}Kb',
        timestamp: Date.now(),
        color: 'green',
      });
    };
    initiateHandshake();
  }, [activePeerId, fsmState, keyPair, peers, myId, setFsmState, setMyNonce, addProtocolLog]);

  // Handle MSG1 (responder)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || fsmState !== 'IDLE' || !myId) return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };
        const { nonce: peerNonceValue, peerId } = await verifyMSG1(ciphertext, keyPair.privateKey);

        setPeerNonce(peerNonceValue);
        setFsmState('HANDSHAKE');

        const myNonceValue = generateNonce();
        setMyNonce(myNonceValue);

        const peer = peers.find((p) => p.id === peerId);
        if (!peer) throw new Error('Peer not found');

        const msg2 = await createMSG2(peerNonceValue, myNonceValue, myId, peer.publicKey);
        send(wsClient, {
          type: 'NSL_MSG2',
          from: myId,
          to: msg.from,
          payload: { ciphertext: msg2 },
          timestamp: Date.now(),
        });

        addProtocolLog({
          type: 'NSL_MSG2',
          from: myId,
          to: msg.from,
          description: 'Sent MSG2: {Na, Nb, B}Ka',
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
      // Cleanup: handler is replaced on re-mount
    };
  }, [keyPair, fsmState, peers, myId, setPeerNonce, setFsmState, setMyNonce, addProtocolLog]);

  // Intruder: Lowe Attack - intercept MSG1 and redirect
  useEffect(() => {
    if (myId !== 'Intruder' || attackMode !== 'LOWE' || !attackTarget || !keyPair) return;

    const handler = async (msg: WSMessage) => {
      // Only intercept MSG1 sent TO Intruder FROM the attack target
      if (msg.to !== 'Intruder' || msg.from !== attackTarget) return;

      try {
        addProtocolLog({
          type: 'NSL_MSG1',
          from: msg.from,
          to: 'Intruder',
          description: `🔴 [ATTACK] Intercepted MSG1 from ${attackTarget}`,
          timestamp: Date.now(),
          color: 'red',
        });

        // Step 1: Decrypt MSG1 with Intruder's private key
        const { ciphertext } = msg.payload as { ciphertext: string };
        const { nonce, peerId } = await verifyMSG1(ciphertext, keyPair.privateKey);

        setInterceptedNonce(nonce);
        setInterceptedSender(peerId);

        addProtocolLog({
          type: 'NSL_MSG1',
          from: 'Intruder',
          to: 'Intruder',
          description: `🔴 [ATTACK] Decrypted: Na=${Array.from(nonce.slice(0, 4)).map(b => b.toString(16).padStart(2, '0')).join('')}..., sender=${peerId}`,
          timestamp: Date.now(),
          color: 'red',
        });

        // Step 2: Find the victim to redirect to
        const victim = attackTarget === 'Alice' ? 'Bob' : 'Alice';
        const victimPeer = peers.find((p) => p.id === victim);
        if (!victimPeer) {
          throw new Error(`Victim ${victim} not found in peer list`);
        }

        // Step 3: Re-encrypt MSG1 for victim, forging the sender identity
        const forgedMsg1 = await createMSG1(peerId as ClientId, nonce, victimPeer.publicKey);

        addProtocolLog({
          type: 'NSL_MSG1',
          from: 'Intruder',
          to: victim,
          description: `🔴 [ATTACK] Forged MSG1: pretending to be ${peerId}, sending to ${victim}`,
          timestamp: Date.now(),
          color: 'red',
        });

        // Step 4: Send forged MSG1 to victim
        send(wsClient, {
          type: 'NSL_MSG1',
          from: peerId, // ❗ Forged sender
          to: victim,
          payload: { ciphertext: forgedMsg1 },
          timestamp: Date.now(),
        });

        addProtocolLog({
          type: 'NSL_MSG1',
          from: 'Intruder',
          to: victim,
          description: `🔴 [ATTACK] Sent forged MSG1 to ${victim}. Waiting for ${victim} to respond...`,
          timestamp: Date.now(),
          color: 'red',
        });

        addProtocolLog({
          type: 'ATTACK_SIM',
          from: 'Intruder',
          to: attackTarget,
          description: `🔴 [ATTACK] Next: ${victim} will send MSG2 with identity "${victim}", but ${attackTarget} expects "Intruder" → attack will be detected!`,
          timestamp: Date.now(),
          color: 'red',
        });

        // Reset attack mode after successful execution
        useStore.getState().setAttackMode('NONE');
        useStore.getState().setAttackTarget(null);

      } catch (error) {
        addProtocolLog({
          type: 'ERROR',
          from: 'Intruder',
          to: 'Intruder',
          description: `🔴 [ATTACK FAILED] ${error}`,
          timestamp: Date.now(),
          color: 'red',
        });

        // Reset attack mode on error
        useStore.getState().setAttackMode('NONE');
        useStore.getState().setAttackTarget(null);
      }
    };

    onMessage(wsClient, 'NSL_MSG1', handler);

    return () => {
      // Cleanup
    };
  }, [myId, attackMode, attackTarget, keyPair, peers, addProtocolLog, setInterceptedNonce, setInterceptedSender]);

  // Handle MSG2 (initiator)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || !myNonce || fsmState !== 'HANDSHAKE' || !myId) return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };
        const { peerNonce: peerNonceValue } = await verifyMSG2(
          ciphertext,
          myNonce,
          keyPair.privateKey,
          msg.from as ClientId
        );

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

        addProtocolLog({
          type: 'NSL_MSG3',
          from: myId,
          to: msg.from,
          description: 'Sent MSG3: {Nb}Kb',
          timestamp: Date.now(),
          color: 'green',
        });

        // Derive session key (initiator uses myNonce first)
        const sessionKeyValue = await deriveSessionKey(myNonce, peerNonceValue);
        setSessionKey(sessionKeyValue);
        setFsmState('SESSION');

        addProtocolLog({
          type: 'HANDSHAKE_OK',
          from: myId,
          to: msg.from,
          description: 'Handshake complete, session key derived',
          timestamp: Date.now(),
          color: 'green',
        });
      } catch (error) {
        setFsmState('ERROR');
        addProtocolLog({
          type: 'ERROR',
          from: myId || 'unknown',
          to: msg.from,
          description: `MSG2 verification failed: ${error}`,
          timestamp: Date.now(),
          color: 'red',
        });
      }
    };

    onMessage(wsClient, 'NSL_MSG2', handler);

    return () => {
      // Cleanup: handler is replaced on re-mount
    };
  }, [keyPair, myNonce, fsmState, peers, myId, setPeerNonce, setSessionKey, setFsmState, addProtocolLog]);

  // Handle MSG3 (responder)
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair || !myNonce || !peerNonce || fsmState !== 'HANDSHAKE' || !myId) return;

      try {
        const { ciphertext } = msg.payload as { ciphertext: string };
        await verifyMSG3(ciphertext, myNonce, keyPair.privateKey);

        // Derive session key (responder uses peerNonce first to match initiator's order: NA || NB)
        const sessionKeyValue = await deriveSessionKey(peerNonce, myNonce);
        setSessionKey(sessionKeyValue);
        setFsmState('SESSION');

        addProtocolLog({
          type: 'HANDSHAKE_OK',
          from: myId,
          to: msg.from,
          description: 'Handshake complete, session key derived',
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
      // Cleanup: handler is replaced on re-mount
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
          description: `✓ Decrypted message successfully: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
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
      // Cleanup: handler is replaced on re-mount
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
            description: `✓ Sent encrypted message: "${lastMessage.text.substring(0, 30)}${lastMessage.text.length > 30 ? '...' : ''}"`,
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

  const handleSelectId = (id: ClientId) => {
    setMyId(id);
  };

  if (!myId) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold mb-6">Select Your Identity</h1>
          <div className="space-y-3">
            {(['Alice', 'Bob', 'Intruder'] as ClientId[]).map((id) => (
              <button
                key={id}
                onClick={() => handleSelectId(id)}
                className="w-full px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <div className="bg-white shadow-sm border-b px-6 py-4">
        <h1 className="text-2xl font-bold">NSL Protocol Demo - {myId}</h1>
      </div>

      {myId === 'Intruder' && (
        <div className="px-6 pt-4">
          <IntruderPanel />
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Contacts */}
        <div className="w-80 bg-white border-r flex flex-col">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">Contacts</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PeerList />
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
                  onClick={() => {
                    useStore.getState().setActivePeerId(null);
                    useStore.getState().setFsmState('IDLE');
                    useStore.getState().setSessionKey(null);
                    useStore.getState().setMyNonce(null);
                    useStore.getState().setPeerNonce(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
                >
                  Close
                </button>
              </div>

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

export default App;
