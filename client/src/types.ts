export type ClientId = 'Alice' | 'Bob' | 'Intruder';

export type FSMState = 'IDLE' | 'HANDSHAKE' | 'SESSION' | 'ERROR';

export type MessageType =
  | 'REGISTER'
  | 'PEER_LIST'
  | 'NSL_MSG1'
  | 'NSL_MSG2'
  | 'NSL_MSG3'
  | 'HANDSHAKE_OK'
  | 'CHAT_MSG'
  | 'ATTACK_SIM'
  | 'ERROR'
  | 'DISCONNECT';

export type LogColor = 'green' | 'blue' | 'red' | 'gray';

export interface Peer {
  id: ClientId;
  publicKey: CryptoKey;
}

export interface KeyPair {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}

export interface ChatMessage {
  from: ClientId;
  to: ClientId;
  text: string;
  timestamp: number;
}

export interface ProtocolLog {
  type: MessageType;
  from: string;
  to: string;
  description: string;
  timestamp: number;
  color: LogColor;
}

export interface WSMessage {
  type: MessageType;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
}

export interface EncryptedMessage {
  iv: string;  // base64
  ciphertext: string;  // base64
}

export interface CryptoErrorData {
  name: 'CryptoError';
  message: string;
  operation: string;
  originalError: Error;
}

export function createCryptoError(operation: string, originalError: Error): Error & CryptoErrorData {
  const error = new Error(`Crypto operation failed: ${operation}`) as Error & CryptoErrorData;
  error.name = 'CryptoError';
  error.operation = operation;
  error.originalError = originalError;
  return error;
}

export interface ProtocolErrorData {
  name: 'ProtocolError';
  message: string;
  step: 'MSG1' | 'MSG2' | 'MSG3';
  reason: string;
}

export function createProtocolError(step: 'MSG1' | 'MSG2' | 'MSG3', reason: string): Error & ProtocolErrorData {
  const error = new Error(`Protocol error at ${step}: ${reason}`) as Error & ProtocolErrorData;
  error.name = 'ProtocolError';
  error.step = step;
  error.reason = reason;
  return error;
}
