import { useStore } from "../../store";
import { EmptyState, Avatar } from "../shared/ui";

export function PeerList() {
  const myId = useStore((state) => state.myId);
  const peers = useStore((state) => state.peers);
  const activePeerId = useStore((state) => state.activePeerId);
  const setActivePeerId = useStore((state) => state.setActivePeerId);
  const setIsInitiator = useStore((state) => state.setIsInitiator);

  // Filter out self and hide Intruder from other users
  const availablePeers = peers.filter((peer) => {
    if (peer.id === myId) return false;
    if (myId !== "Intruder" && peer.id === "Intruder") return false;
    return true;
  });

  const handleSelectPeer = (peerId: string) => {
    if (peerId === "Alice" || peerId === "Bob" || peerId === "Intruder") {
      // Only Alice initiates by default. Bob opens the chat and waits for MSG1.
      const amInitiator = myId === "Alice";
      setIsInitiator(amInitiator);
      setActivePeerId(peerId);
    }
  };

  const getPeerGradient = (peerId: string) => {
    if (peerId === "Alice")
      return "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
    if (peerId === "Bob")
      return "linear-gradient(135deg, #10b981 0%, #059669 100%)";
    if (peerId === "Intruder")
      return "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
    return "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)";
  };

  const getPeerIcon = (peerId: string) => {
    if (peerId === "Alice") return "👩";
    if (peerId === "Bob") return "👨";
    if (peerId === "Intruder") return "🎭";
    return "👤";
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {availablePeers.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center p-4">
          <EmptyState
            icon="👥"
            title="No contacts available"
            description="Waiting for other users to connect..."
          />
        </div>
      ) : (
        <ul className="divide-y divide-white/5 overflow-y-auto">
          {availablePeers.map((peer) => {
            const isActive = activePeerId === peer.id;

            return (
              <li key={peer.id}>
                <button
                  onClick={() => handleSelectPeer(peer.id)}
                  className={`w-full text-left px-3 py-2.5 transition-all duration-200 ${
                    isActive ? "bg-white/[0.08]" : "hover:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar
                      icon={getPeerIcon(peer.id)}
                      gradient={getPeerGradient(peer.id)}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {peer.id}
                      </div>
                      <div className="text-xs text-white/40 truncate">
                        {isActive ? "Active chat" : "Click to open chat"}
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
