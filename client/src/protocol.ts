import {
  encryptRSA,
  decryptRSA,
} from './crypto';
import {
  createProtocolError,
} from './types';
import type { ClientId } from './types';

const NONCE_LENGTH = 16;
const MSG2_MIN_PAYLOAD_LENGTH = NONCE_LENGTH * 2;
const VALID_CLIENT_IDS: readonly ClientId[] = ['Alice', 'Bob', 'Intruder'] as const;

function constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function generateNonce(): Uint8Array {
  return window.crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
}

async function deriveSessionKey(
  nonceA: Uint8Array,
  nonceB: Uint8Array
): Promise<CryptoKey> {
  const combined = new Uint8Array(nonceA.length + nonceB.length);
  combined.set(nonceA, 0);
  combined.set(nonceB, nonceA.length);

  const hash = await window.crypto.subtle.digest('SHA-256', combined);

  return await window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function createMSG1(
  myId: ClientId,
  myNonce: Uint8Array,
  peerPublicKey: CryptoKey
): Promise<string> {
  try {
    const idBytes = new TextEncoder().encode(myId);
    const payload = new Uint8Array(myNonce.length + idBytes.length);
    payload.set(myNonce, 0);
    payload.set(idBytes, myNonce.length);

    return await encryptRSA(payload, peerPublicKey);
  } catch (error) {
    if ((error as Error).name === 'CryptoError') throw error;
    throw createProtocolError('MSG1', 'Failed to create MSG1');
  }
}

export async function verifyMSG1(
  ciphertext: string,
  myPrivateKey: CryptoKey
): Promise<{ nonce: Uint8Array; peerId: ClientId }> {
  try {
    const decrypted = await decryptRSA(ciphertext, myPrivateKey);

    if (decrypted.length <= NONCE_LENGTH) {
      throw createProtocolError('MSG1', 'Invalid MSG1 payload length');
    }

    const nonce = decrypted.slice(0, NONCE_LENGTH);
    const idBytes = decrypted.slice(NONCE_LENGTH);
    const peerId = new TextDecoder().decode(idBytes) as ClientId;

    if (!VALID_CLIENT_IDS.includes(peerId)) {
      throw createProtocolError('MSG1', `Invalid peer ID: ${peerId}`);
    }

    return { nonce, peerId };
  } catch (error) {
    const err = error as Error;
    if (err.name === 'CryptoError' || err.name === 'ProtocolError') {
      throw error;
    }
    throw createProtocolError('MSG1', 'Failed to verify MSG1');
  }
}

export async function createMSG2(
  peerNonce: Uint8Array,
  myNonce: Uint8Array,
  myId: ClientId,
  peerPublicKey: CryptoKey,
  protocol: 'NSPK' | 'NSL'
): Promise<string> {
  try {
    const idBytes = protocol === 'NSL'
      ? new TextEncoder().encode(myId)
      : new Uint8Array(0);  // NSPK: no identity

    const payload = new Uint8Array(
      peerNonce.length + myNonce.length + idBytes.length
    );
    payload.set(peerNonce, 0);
    payload.set(myNonce, peerNonce.length);
    if (protocol === 'NSL') {
      payload.set(idBytes, peerNonce.length + myNonce.length);
    }

    return await encryptRSA(payload, peerPublicKey);
  } catch (error) {
    if ((error as Error).name === 'CryptoError') throw error;
    throw createProtocolError('MSG2', 'Failed to create MSG2');
  }
}

export async function verifyMSG2(
  ciphertext: string,
  myNonce: Uint8Array,
  myPrivateKey: CryptoKey,
  expectedPeerId: ClientId,
  protocol: 'NSPK' | 'NSL'
): Promise<{ peerNonce: Uint8Array; peerId: ClientId }> {
  try {
    const decrypted = await decryptRSA(ciphertext, myPrivateKey);

    if (decrypted.length <= MSG2_MIN_PAYLOAD_LENGTH) {
      throw createProtocolError('MSG2', 'Invalid MSG2 payload length');
    }

    const receivedMyNonce = decrypted.slice(0, NONCE_LENGTH);
    const peerNonce = decrypted.slice(NONCE_LENGTH, NONCE_LENGTH * 2);

    // Verify nonce (always)
    if (!constantTimeCompare(receivedMyNonce, myNonce)) {
      throw createProtocolError('MSG2', 'Nonce mismatch');
    }

    // Verify identity (NSL only)
    if (protocol === 'NSL') {
      if (decrypted.length <= NONCE_LENGTH * 2) {
        throw createProtocolError('MSG2', 'Missing identity in NSL mode');
      }

      const idBytes = decrypted.slice(NONCE_LENGTH * 2);
      const peerId = new TextDecoder().decode(idBytes) as ClientId;

      if (peerId !== expectedPeerId) {
        throw createProtocolError(
          'MSG2',
          `ATTACK DETECTED: Identity mismatch - expected ${expectedPeerId}, got ${peerId}`
        );
      }

      return { peerNonce, peerId };
    } else {
      // NSPK: identity не передається в MSG2, тому приймаємо будь-який peer
      // Саме тут і є вразливість — ми не знаємо з ким реально говоримо
      return { peerNonce, peerId: expectedPeerId };
    }
  } catch (error) {
    const err = error as Error;
    if (err.name === 'CryptoError' || err.name === 'ProtocolError') {
      throw error;
    }
    throw createProtocolError('MSG2', 'Failed to verify MSG2');
  }
}

export async function createMSG3(
  peerNonce: Uint8Array,
  peerPublicKey: CryptoKey
): Promise<string> {
  try {
    return await encryptRSA(peerNonce, peerPublicKey);
  } catch (error) {
    if ((error as Error).name === 'CryptoError') throw error;
    throw createProtocolError('MSG3', 'Failed to create MSG3');
  }
}

export async function verifyMSG3(
  ciphertext: string,
  myNonce: Uint8Array,
  myPrivateKey: CryptoKey
): Promise<void> {
  try {
    const decrypted = await decryptRSA(ciphertext, myPrivateKey);

    if (decrypted.length !== NONCE_LENGTH) {
      throw createProtocolError('MSG3', 'Invalid MSG3 payload length');
    }

    if (!constantTimeCompare(decrypted, myNonce)) {
      throw createProtocolError('MSG3', 'Nonce mismatch');
    }
  } catch (error) {
    const err = error as Error;
    if (err.name === 'CryptoError' || err.name === 'ProtocolError') {
      throw error;
    }
    throw createProtocolError('MSG3', 'Failed to verify MSG3');
  }
}

export { generateNonce, deriveSessionKey };
