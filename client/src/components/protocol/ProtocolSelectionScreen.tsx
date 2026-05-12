import { wsClient, send } from "../../websocket";
import { useStore } from "../../store";
import type { Protocol } from "../../types";

interface ProtocolSelectionScreenProps {
  onProtocolSelected?: (protocol: Protocol) => void;
}

export function ProtocolSelectionScreen({
  onProtocolSelected,
}: ProtocolSelectionScreenProps) {
  const wsConnected = useStore((state) => state.wsConnected);
  const setProtocol = useStore((state) => state.setProtocol);

  const handleSelectProtocol = (protocol: Protocol) => {
    if (!wsConnected) {
      console.warn("WebSocket not connected");
      return;
    }

    setProtocol(protocol);
    onProtocolSelected?.(protocol);

    send(wsClient, {
      type: "SET_PROTOCOL",
      from: "client",
      to: "server",
      payload: { protocol },
      timestamp: Date.now(),
    });
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-2xl shadow-blue-500/20">
            <span className="text-4xl">🔐</span>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
            Needham-Schroeder Protocol
          </h1>
          <p className="text-lg text-white/50">
            Choose a protocol to demonstrate
          </p>
        </div>

        {/* Protocol Cards */}
        <div className="flex flex-col gap-6">
          {/* NSPK Protocol */}
          <button
            onClick={() => wsConnected && handleSelectProtocol("NSPK")}
            disabled={!wsConnected}
            className={`w-full p-6 bg-[#141414] hover:bg-[#1a1a1a] border border-white/5 rounded-2xl transition-all duration-200 text-left mb-6 ${
              wsConnected
                ? "hover:scale-[1.01] cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <span className="text-3xl">🔓</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold text-white">
                    NSPK Protocol
                  </h3>
                  <span className="px-2.5 py-1 bg-orange-500/10 text-orange-400 rounded-full text-xs font-medium border border-orange-500/20">
                    Vulnerable
                  </span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">
                  Needham-Schroeder Public Key — original version without
                  identity verification
                </p>
              </div>
            </div>
          </button>

          {/* NSL Protocol */}
          <button
            onClick={() => wsConnected && handleSelectProtocol("NSL")}
            disabled={!wsConnected}
            className={`w-full p-6 bg-[#141414] hover:bg-[#1a1a1a] border border-white/5 rounded-2xl transition-all duration-200 text-left ${
              wsConnected
                ? "hover:scale-[1.01] cursor-pointer"
                : "opacity-50 cursor-not-allowed"
            }`}
          >
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <span className="text-3xl">🔒</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold text-white">
                    NSL Protocol
                  </h3>
                  <span className="px-2.5 py-1 bg-green-500/10 text-green-400 rounded-full text-xs font-medium border border-green-500/20">
                    Secure
                  </span>
                </div>
                <p className="text-sm text-white/50 leading-relaxed">
                  Needham-Schroeder-Lowe — enhanced with identity verification
                  to prevent attacks
                </p>
              </div>
            </div>
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          {wsConnected ? (
            <div className="flex items-center justify-center gap-2 text-green-400">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
              <span className="text-sm font-medium">Server Connected</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 text-red-400">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></div>
              <span className="text-sm font-medium">Waiting for server...</span>
            </div>
          )}
          <p className="text-sm text-white/30 mt-3">
            Click on a protocol to begin the demonstration
          </p>
        </div>
      </div>
    </div>
  );
}
