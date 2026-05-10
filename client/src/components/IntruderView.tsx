import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { wsClient, send, onMessage } from '../websocket';
import { formatTime } from '../utils';
import { exportPublicKey } from '../crypto';
import { decryptRSA, encryptRSA } from '../crypto';
import type { WSMessage } from '../types';

export function IntruderView() {
  const mitmActive = useStore((state) => state.mitmActive);
  const setMitmActive = useStore((state) => state.setMitmActive);
  const interceptedPackets = useStore((state) => state.interceptedPackets);
  const peers = useStore((state) => state.peers);
  const keyPair = useStore((state) => state.keyPair);

  const [attackStatus, setAttackStatus] = useState<string>('');

  // Handle MITM_INTERCEPT - decrypt and forward MSG1
  useEffect(() => {
    const handler = async (msg: WSMessage) => {
      if (!keyPair) return;

      const { originalFrom, originalTo, originalPayload } = msg.payload as {
        originalFrom: string;
        originalTo: string;
        originalPayload: { ciphertext: string };
      };

      console.log('[Intruder] Intercepted MSG1 from', originalFrom, 'to', originalTo);

      try {
        // Decrypt MSG1 with Intruder's private key
        const decrypted = await decryptRSA(originalPayload.ciphertext, keyPair.privateKey);

        // Extract NA and IDA (first 16 bytes = nonce, rest = sender ID)
        const NA = decrypted.slice(0, 16);
        const IDA = decrypted.slice(16);

        console.log('[Intruder] Decrypted MSG1 - NA length:', NA.length, 'IDA:', new TextDecoder().decode(IDA));

        // Get Bob's REAL public key from peers
        const bobPeer = peers.find(p => p.id === 'Bob');
        if (!bobPeer) {
          console.error('[Intruder] Bob not found in peers list');
          return;
        }

        // Re-encrypt with Bob's real public key, preserving original NA and IDA
        const forgedPayload = new Uint8Array(NA.length + IDA.length);
        forgedPayload.set(NA, 0);
        forgedPayload.set(IDA, NA.length);

        const forgedCiphertext = await encryptRSA(forgedPayload, bobPeer.publicKey);

        // Send forged MSG1 to Bob (spoofing Alice's identity)
        send(wsClient, {
          type: 'NSL_MSG1',
          from: originalFrom,  // Spoof as Alice
          to: originalTo,      // To Bob
          payload: { ciphertext: forgedCiphertext },
          timestamp: Date.now(),
        });

        console.log('[Intruder] Forwarded forged MSG1 to Bob');
        setAttackStatus('MSG1 intercepted and forwarded to Bob. Waiting for Bob\'s response...');
      } catch (error) {
        console.error('[Intruder] Failed to process intercepted MSG1:', error);
      }
    };

    onMessage(wsClient, 'MITM_INTERCEPT', handler);

    return () => {
      // Cleanup
    };
  }, [keyPair, peers]);

  const handleActivateMitm = async () => {
    if (!keyPair) {
      console.error('No keypair available');
      return;
    }

    // Export public key to send to server
    const publicKeyJWK = await exportPublicKey(keyPair.publicKey);

    send(wsClient, {
      type: 'ACTIVATE_MITM',
      from: 'Intruder',
      to: 'server',
      payload: { publicKey: publicKeyJWK },
      timestamp: Date.now(),
    });
    setAttackStatus('MitM activated. Waiting for next handshake between Alice and Bob...');
  };

  const handleDeactivateMitm = () => {
    send(wsClient, {
      type: 'DEACTIVATE_MITM',
      from: 'Intruder',
      to: 'server',
      payload: {},
      timestamp: Date.now(),
    });
    setMitmActive(false);
    setAttackStatus('');
  };

  const activeConnections = peers.filter((p) => p.id !== 'Intruder').length;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <h1 className="text-2xl font-bold text-red-400">Intruder Panel</h1>
        <p className="text-sm text-gray-400 mt-1">
          Active connections: {activeConnections}
        </p>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        {/* MitM Control */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-red-400">Man-in-the-Middle Attack</h2>

          {!mitmActive ? (
            <button
              onClick={handleActivateMitm}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <span className="text-2xl">🎭</span>
              Activate MitM Attack
            </button>
          ) : (
            <div className="space-y-4">
              <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
                <p className="text-red-300 font-semibold">⚠️ MitM Attack Active</p>
                <p className="text-sm text-gray-300 mt-2">{attackStatus}</p>
              </div>
              <button
                onClick={handleDeactivateMitm}
                className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors"
              >
                Deactivate Attack
              </button>
            </div>
          )}

          <div className="mt-4 text-sm text-gray-400 bg-gray-900/50 p-4 rounded border border-gray-700">
            <p className="font-semibold mb-2">How it works:</p>
            <ol className="list-decimal list-inside space-y-1 text-xs">
              <li>Activate MitM mode on the server</li>
              <li>When Alice or Bob initiates handshake, server intercepts MSG1</li>
              <li>Server forwards MSG1 to Intruder instead of intended recipient</li>
              <li>Intruder can decrypt, inspect, and re-encrypt with forged identity</li>
              <li>Victim detects identity mismatch (NSL protocol protection)</li>
            </ol>
          </div>
        </div>

        {/* Packet Interception Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 flex-1 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-blue-400">Real-time Packet Interception</h2>
            <p className="text-sm text-gray-400 mt-1">
              Captured {interceptedPackets.length} packets
            </p>
          </div>

          <div className="flex-1 overflow-auto">
            {interceptedPackets.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>No packets intercepted yet</p>
                  <p className="text-sm mt-2">Waiting for network activity...</p>
                </div>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-900 sticky top-0">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-semibold text-gray-300">TIME</th>
                    <th className="px-4 py-3 font-semibold text-gray-300">FROM</th>
                    <th className="px-4 py-3 font-semibold text-gray-300">TO</th>
                    <th className="px-4 py-3 font-semibold text-gray-300">TYPE</th>
                    <th className="px-4 py-3 font-semibold text-gray-300">PAYLOAD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {interceptedPackets.slice().reverse().map((packet, idx) => (
                    <tr key={`${packet.timestamp}-${idx}`} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                        {formatTime(packet.timestamp)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-blue-900/50 text-blue-300 rounded text-xs font-semibold">
                          {packet.from}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-purple-900/50 text-purple-300 rounded text-xs font-semibold">
                          {packet.to}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                          packet.messageType.startsWith('NSL_MSG')
                            ? 'bg-red-900/50 text-red-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {packet.messageType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">
                        {packet.payloadPreview}...
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
