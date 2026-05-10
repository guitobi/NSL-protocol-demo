import { useEffect } from 'react';
import { useStore } from './store';
import { wsClient, onMessage } from './websocket';
import type { ClientId, WSMessage, InterceptedPacket } from './types';
import { AliceBobView } from './components/AliceBobView';
import { IntruderView } from './components/IntruderView';
import { ProtocolSelectionScreen } from './components/ProtocolSelectionScreen';

function App() {
  const myId = useStore((state) => state.myId);
  const protocol = useStore((state) => state.protocol);
  const setMyId = useStore((state) => state.setMyId);
  const setProtocol = useStore((state) => state.setProtocol);
  const setMitmActive = useStore((state) => state.setMitmActive);
  const addInterceptedPacket = useStore((state) => state.addInterceptedPacket);

  // Handle PROTOCOL_SET from server
  useEffect(() => {
    const handler = (msg: WSMessage) => {
      const { protocol: selectedProtocol } = msg.payload as { protocol: 'NSPK' | 'NSL' };
      setProtocol(selectedProtocol);
    };

    onMessage(wsClient, 'PROTOCOL_SET', handler);
  }, [setProtocol]);

  // Handle Intruder-specific messages
  useEffect(() => {
    if (myId !== 'Intruder') return;

    // Handle MitM activation confirmation
    const handleMitmActivated = (_msg: WSMessage) => {
      setMitmActive(true);
    };

    // Handle MitM deactivation confirmation
    const handleMitmDeactivated = (_msg: WSMessage) => {
      setMitmActive(false);
    };

    // Handle packet interception notifications
    const handlePacketIntercepted = (msg: WSMessage) => {
      const packet = msg.payload as InterceptedPacket;
      addInterceptedPacket(packet);
    };

    // Handle intercepted MSG1 for MitM attack
    const handleMitmIntercept = async (msg: WSMessage) => {
      const { originalFrom, originalTo, originalPayload } = msg.payload as {
        originalFrom: string;
        originalTo: string;
        originalPayload: any;
      };

      console.log('[Intruder] Intercepted MSG1:', { originalFrom, originalTo });

      // For now, just log it. In a full implementation, Intruder would:
      // 1. Decrypt MSG1 with their private key
      // 2. Extract nonce and sender ID
      // 3. Re-encrypt for the other party with forged sender
      // 4. Send forged MSG1

      // This demonstrates the server-side interception working
      addInterceptedPacket({
        timestamp: Date.now(),
        from: originalFrom,
        to: originalTo,
        messageType: 'NSL_MSG1 (INTERCEPTED)',
        payloadPreview: JSON.stringify(originalPayload).substring(0, 32),
      });
    };

    onMessage(wsClient, 'MITM_ACTIVATED', handleMitmActivated);
    onMessage(wsClient, 'MITM_DEACTIVATED', handleMitmDeactivated);
    onMessage(wsClient, 'PACKET_INTERCEPTED', handlePacketIntercepted);
    onMessage(wsClient, 'MITM_INTERCEPT', handleMitmIntercept);

    return () => {
      // Cleanup
    };
  }, [myId, setMitmActive, addInterceptedPacket]);

  const handleSelectId = (id: ClientId) => {
    setMyId(id);
  };

  // Protocol selection screen
  if (!protocol) {
    return <ProtocolSelectionScreen />;
  }

  // Role selection modal
  if (!myId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">NSL Protocol Demo</h1>
            <p className="text-gray-600">Select your role to begin</p>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => handleSelectId('Alice')}
              className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all shadow-md hover:shadow-lg font-semibold text-lg"
            >
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl">👩</span>
                <span>Alice</span>
              </div>
            </button>
            <button
              onClick={() => handleSelectId('Bob')}
              className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl hover:from-green-600 hover:to-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all shadow-md hover:shadow-lg font-semibold text-lg"
            >
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl">👨</span>
                <span>Bob</span>
              </div>
            </button>
            <button
              onClick={() => handleSelectId('Intruder')}
              className="w-full px-6 py-4 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all shadow-md hover:shadow-lg font-semibold text-lg"
            >
              <div className="flex items-center justify-center gap-3">
                <span className="text-2xl">🎭</span>
                <span>Intruder</span>
              </div>
            </button>
          </div>
          <div className="mt-6 text-center text-sm text-gray-500">
            <p>Demonstration of the Needham-Schroeder-Lowe protocol</p>
          </div>
        </div>
      </div>
    );
  }

  // Route to appropriate view based on role
  if (myId === 'Intruder') {
    return <IntruderView />;
  }

  return <AliceBobView />;
}

export default App;
