import { useStore } from '../store';

export function PeerList() {
  const myId = useStore((state) => state.myId);
  const peers = useStore((state) => state.peers);
  const activePeerId = useStore((state) => state.activePeerId);
  const setActivePeerId = useStore((state) => state.setActivePeerId);

  // Filter out self and Intruder (unless I am Intruder)
  const availablePeers = peers.filter((peer) => {
    if (peer.id === myId) return false;
    if (myId !== 'Intruder' && peer.id === 'Intruder') return false;
    return true;
  });

  const handleSelectPeer = (peerId: string) => {
    if (peerId === 'Alice' || peerId === 'Bob' || peerId === 'Intruder') {
      setActivePeerId(peerId);
    }
  };

  return (
    <div className="flex flex-col">
      {availablePeers.length === 0 ? (
        <div className="p-4 text-center text-gray-500">
          <p>No contacts available</p>
          <p className="text-xs mt-2">Waiting for other users to connect...</p>
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
  );
}
