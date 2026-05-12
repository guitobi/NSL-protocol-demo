import { useEffect, useState } from "react";
import { useStore } from "./store";
import {
  wsClient,
  onMessage,
  connect,
  onConnect,
  onDisconnect,
} from "./websocket";
import type { ClientId, WSMessage, InterceptedPacket } from "./types";
import { AliceBobView } from "./components/views/AliceBobView";
import { IntruderView } from "./components/intruder/IntruderView";
import { ProtocolSelectionScreen } from "./components/protocol/ProtocolSelectionScreen";

function App() {
  const myId = useStore((state) => state.myId);
  const protocol = useStore((state) => state.protocol);
  const setMyId = useStore((state) => state.setMyId);
  const setProtocol = useStore((state) => state.setProtocol);
  const wsConnected = useStore((state) => state.wsConnected);
  const setWsConnected = useStore((state) => state.setWsConnected);
  const setMitmActive = useStore((state) => state.setMitmActive);
  const addInterceptedPacket = useStore((state) => state.addInterceptedPacket);

  const [isProtocolHydrated, setIsProtocolHydrated] = useState(false);

  // Initialize WebSocket connection on mount
  useEffect(() => {
    connect(wsClient);
    const unsubscribeConnect = onConnect(wsClient, () => {
      setWsConnected(true);
    });
    const unsubscribeDisconnect = onDisconnect(wsClient, () => {
      setWsConnected(false);
    });

    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
    };
  }, [setWsConnected]);

  // Handle initial bootstrap snapshot from server
  useEffect(() => {
    const handler = (msg: WSMessage) => {
      const { protocol: snapshotProtocol } = msg.payload as {
        protocol: "NSPK" | "NSL" | null;
      };

      if (snapshotProtocol) {
        setProtocol(snapshotProtocol);
      }
      setIsProtocolHydrated(true);
    };

    return onMessage(wsClient, "BOOTSTRAP_SNAPSHOT", handler);
  }, [setProtocol]);

  // Handle runtime protocol updates from server
  useEffect(() => {
    const handler = (msg: WSMessage) => {
      const { protocol: selectedProtocol } = msg.payload as {
        protocol: "NSPK" | "NSL";
      };
      setProtocol(selectedProtocol);
      setIsProtocolHydrated(true);
    };

    return onMessage(wsClient, "PROTOCOL_SET", handler);
  }, [setProtocol]);

  // Fallback when server does not send snapshot for any reason.
  useEffect(() => {
    if (!wsConnected || isProtocolHydrated) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsProtocolHydrated(true);
    }, 800);

    return () => {
      window.clearTimeout(timer);
    };
  }, [wsConnected, isProtocolHydrated]);

  // Handle Intruder-specific messages
  useEffect(() => {
    if (myId !== "Intruder") return;

    // Handle MitM activation confirmation
    const handleMitmActivated = () => {
      setMitmActive(true);
    };

    // Handle MitM deactivation confirmation
    const handleMitmDeactivated = () => {
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
        originalPayload: unknown;
      };

      console.log("[Intruder] Intercepted MSG1:", { originalFrom, originalTo });

      // Add to intercepted packets
      addInterceptedPacket({
        timestamp: Date.now(),
        from: originalFrom,
        to: originalTo,
        messageType: "NSL_MSG1 (INTERCEPTED)",
        payloadPreview: JSON.stringify(originalPayload).substring(0, 200),
      });
    };

    const unsubscribeActivated = onMessage(
      wsClient,
      "MITM_ACTIVATED",
      handleMitmActivated,
    );
    const unsubscribeDeactivated = onMessage(
      wsClient,
      "MITM_DEACTIVATED",
      handleMitmDeactivated,
    );
    const unsubscribePackets = onMessage(
      wsClient,
      "PACKET_INTERCEPTED",
      handlePacketIntercepted,
    );
    const unsubscribeIntercept = onMessage(
      wsClient,
      "MITM_INTERCEPT",
      handleMitmIntercept,
    );

    return () => {
      unsubscribeActivated();
      unsubscribeDeactivated();
      unsubscribePackets();
      unsubscribeIntercept();
    };
  }, [myId, setMitmActive, addInterceptedPacket]);

  const handleSelectId = (id: ClientId) => {
    setMyId(id);
    setMitmActive(false);
  };

  if (!isProtocolHydrated) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <p className="text-white/50 text-sm">Synchronizing protocol state...</p>
      </div>
    );
  }

  // Protocol selection screen
  if (!protocol) {
    return <ProtocolSelectionScreen />;
  }

  // Role selection modal
  if (!myId) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="w-16 h-16 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-2xl shadow-purple-500/20">
              <span className="text-3xl">👥</span>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">
              Choose Your Role
            </h1>
            <p className="text-white/50">
              Select a participant to begin the protocol demonstration
            </p>
            {/* Back to protocol selection */}
            <button
              onClick={() => {
                setMyId(null);
                setProtocol(null);
                setMitmActive(false);
              }}
              className="mt-4 text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              ← Change Protocol
            </button>
          </div>

          {/* Role Cards */}
          <div className="space-y-5">
            <button
              onClick={() => handleSelectId("Alice")}
              className="w-full p-6 bg-[#141414] hover:bg-[#1a1a1a] border border-white/5 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-xl group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:shadow-blue-500/40 transition-all">
                  <span className="text-3xl">👩</span>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-xl font-semibold text-white mb-1">
                    Alice
                  </h3>
                  <p className="text-sm text-white/50">Protocol initiator</p>
                </div>
                <span className="text-white/20 group-hover:text-white/40 transition-colors text-xl">
                  →
                </span>
              </div>
            </button>

            <button
              onClick={() => handleSelectId("Bob")}
              className="w-full p-6 bg-[#141414] hover:bg-[#1a1a1a] border border-white/5 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-xl group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/20 group-hover:shadow-green-500/40 transition-all">
                  <span className="text-3xl">👨</span>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-xl font-semibold text-white mb-1">Bob</h3>
                  <p className="text-sm text-white/50">Protocol responder</p>
                </div>
                <span className="text-white/20 group-hover:text-white/40 transition-colors text-xl">
                  →
                </span>
              </div>
            </button>

            <button
              onClick={() => handleSelectId("Intruder")}
              className="w-full p-6 bg-[#141414] hover:bg-[#1a1a1a] border border-white/5 rounded-2xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-xl group"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500 to-pink-600 flex items-center justify-center shadow-lg shadow-red-500/20 group-hover:shadow-red-500/40 transition-all">
                  <span className="text-3xl">🎭</span>
                </div>
                <div className="flex-1 text-left">
                  <h3 className="text-xl font-semibold text-white mb-1">
                    Intruder
                  </h3>
                  <p className="text-sm text-white/50">
                    Man-in-the-middle attacker
                  </p>
                </div>
                <span className="text-white/20 group-hover:text-white/40 transition-colors text-xl">
                  →
                </span>
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center">
            <p className="text-sm text-white/30">
              Needham-Schroeder-Lowe Protocol Demonstration
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Route to appropriate view based on role
  if (myId === "Intruder") {
    return <IntruderView />;
  }

  return <AliceBobView />;
}

export default App;
