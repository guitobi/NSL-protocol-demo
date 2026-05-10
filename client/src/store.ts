import { create } from 'zustand';
import type {
  ClientId,
  FSMState,
  KeyPair,
  Peer,
  ChatMessage,
  ProtocolLog,
} from './types';

const MAX_CHAT_MESSAGES = 1000;
const MAX_PROTOCOL_LOGS = 500;

interface AppState {
  // Identity and state
  myId: ClientId | null;
  fsmState: FSMState;

  // Cryptographic keys
  keyPair: KeyPair | null;
  peers: Peer[];

  // Protocol state
  myNonce: Uint8Array | null;
  peerNonce: Uint8Array | null;
  sessionKey: CryptoKey | null;
  activePeerId: ClientId | null;

  // Messages and logs
  chatMessages: ChatMessage[];
  protocolLogs: ProtocolLog[];

  // Intruder attack state
  attackMode: 'NONE' | 'LOWE';
  attackTarget: ClientId | null;
  interceptedNonce: Uint8Array | null;
  interceptedSender: ClientId | null;

  // Actions
  setMyId: (id: ClientId) => void;
  setFsmState: (state: FSMState) => void;
  setKeyPair: (keyPair: KeyPair) => void;
  setPeers: (peers: Peer[]) => void;
  setMyNonce: (nonce: Uint8Array | null) => void;
  setPeerNonce: (nonce: Uint8Array | null) => void;
  setSessionKey: (key: CryptoKey | null) => void;
  setActivePeerId: (id: ClientId | null) => void;
  addChatMessage: (message: ChatMessage) => void;
  addProtocolLog: (log: ProtocolLog) => void;
  clearChatMessages: () => void;
  clearProtocolLogs: () => void;
  setAttackMode: (mode: 'NONE' | 'LOWE') => void;
  setAttackTarget: (target: ClientId | null) => void;
  setInterceptedNonce: (nonce: Uint8Array | null) => void;
  setInterceptedSender: (sender: ClientId | null) => void;
  reset: () => void;
}

const initialState = {
  myId: null,
  fsmState: 'IDLE' as FSMState,
  keyPair: null,
  peers: [],
  myNonce: null,
  peerNonce: null,
  sessionKey: null,
  activePeerId: null,
  chatMessages: [],
  protocolLogs: [],
  attackMode: 'NONE' as const,
  attackTarget: null,
  interceptedNonce: null,
  interceptedSender: null,
};

export const useStore = create<AppState>((set) => ({
  ...initialState,

  setMyId: (myId) => set({ myId }),
  setFsmState: (fsmState) => set({ fsmState }),
  setKeyPair: (keyPair) => set({ keyPair }),
  setPeers: (peers) => set({ peers }),
  setMyNonce: (myNonce) => set({ myNonce }),
  setPeerNonce: (peerNonce) => set({ peerNonce }),
  setSessionKey: (sessionKey) => set({ sessionKey }),
  setActivePeerId: (activePeerId) => set({ activePeerId }),

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

  setAttackMode: (attackMode) => set({ attackMode }),
  setAttackTarget: (attackTarget) => set({ attackTarget }),
  setInterceptedNonce: (interceptedNonce) => set({ interceptedNonce }),
  setInterceptedSender: (interceptedSender) => set({ interceptedSender }),

  reset: () => set(initialState),
}));
