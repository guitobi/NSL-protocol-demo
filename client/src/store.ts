import { create } from 'zustand';
import type {
  ClientId,
  FSMState,
  KeyPair,
  Peer,
  ChatMessage,
  ProtocolLog,
  InterceptedPacket,
  Protocol,
} from './types';

const MAX_CHAT_MESSAGES = 1000;
const MAX_PROTOCOL_LOGS = 500;

interface AppState {
  // Identity and state
  myId: ClientId | null;
  fsmState: FSMState;
  protocol: Protocol | null;

  // Cryptographic keys
  keyPair: KeyPair | null;
  peers: Peer[];

  // Protocol state
  myNonce: Uint8Array | null;
  peerNonce: Uint8Array | null;
  sessionKey: CryptoKey | null;
  activePeerId: ClientId | null;
  isInitiator: boolean;

  // Messages and logs
  chatMessages: ChatMessage[];
  protocolLogs: ProtocolLog[];

  // Intruder state
  mitmActive: boolean;
  interceptedPackets: InterceptedPacket[];
  attackDetected: boolean;

  // Actions
  setMyId: (id: ClientId) => void;
  setFsmState: (state: FSMState) => void;
  setProtocol: (protocol: Protocol | null) => void;
  setKeyPair: (keyPair: KeyPair) => void;
  setPeers: (peers: Peer[]) => void;
  setMyNonce: (nonce: Uint8Array | null) => void;
  setPeerNonce: (nonce: Uint8Array | null) => void;
  setSessionKey: (key: CryptoKey | null) => void;
  setActivePeerId: (id: ClientId | null) => void;
  setIsInitiator: (isInitiator: boolean) => void;
  addChatMessage: (message: ChatMessage) => void;
  addProtocolLog: (log: ProtocolLog) => void;
  clearChatMessages: () => void;
  clearProtocolLogs: () => void;
  setMitmActive: (active: boolean) => void;
  addInterceptedPacket: (packet: InterceptedPacket) => void;
  setInterceptedPackets: (packets: InterceptedPacket[]) => void;
  setAttackDetected: (detected: boolean) => void;
  reset: () => void;
}

const initialState = {
  myId: null,
  fsmState: 'IDLE' as FSMState,
  protocol: null,
  keyPair: null,
  peers: [],
  myNonce: null,
  peerNonce: null,
  sessionKey: null,
  activePeerId: null,
  isInitiator: false,
  chatMessages: [],
  protocolLogs: [],
  mitmActive: false,
  interceptedPackets: [],
  attackDetected: false,
};

export const useStore = create<AppState>((set) => ({
  ...initialState,

  setMyId: (myId) => set({ myId }),
  setFsmState: (fsmState) => set({ fsmState }),
  setProtocol: (protocol) => set({ protocol }),
  setKeyPair: (keyPair) => set({ keyPair }),
  setPeers: (peers) => set({ peers }),
  setMyNonce: (myNonce) => set({ myNonce }),
  setPeerNonce: (peerNonce) => set({ peerNonce }),
  setSessionKey: (sessionKey) => set({ sessionKey }),
  setActivePeerId: (activePeerId) => set({ activePeerId }),
  setIsInitiator: (isInitiator) => set({ isInitiator }),

  addChatMessage: (message) =>
    set((state) => {
      const messages = [...state.chatMessages, message];
      return {
        chatMessages: messages.slice(-MAX_CHAT_MESSAGES),
      };
    }),

  addProtocolLog: (log) =>
    set((state) => {
      const logs = [...state.protocolLogs, log];
      return {
        protocolLogs: logs.slice(-MAX_PROTOCOL_LOGS),
      };
    }),

  clearChatMessages: () => set({ chatMessages: [] }),
  clearProtocolLogs: () => set({ protocolLogs: [] }),

  setMitmActive: (mitmActive) => set({ mitmActive }),

  addInterceptedPacket: (packet) =>
    set((state) => {
      const packets = [...state.interceptedPackets, packet];
      return {
        interceptedPackets: packets.slice(-100), // Keep last 100
      };
    }),

  setInterceptedPackets: (interceptedPackets) => set({ interceptedPackets }),

  setAttackDetected: (attackDetected) => set({ attackDetected }),

  reset: () => set(initialState),
}));
