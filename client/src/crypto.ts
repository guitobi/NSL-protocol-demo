import { createCryptoError } from "./types";
import type { EncryptedMessage, KeyPair } from "./types";

// Constants
const RSA_MODULUS_LENGTH = 2048;
const RSA_PUBLIC_EXPONENT = new Uint8Array([1, 0, 1]); // 65537
const AES_KEY_LENGTH = 256;
const AES_GCM_IV_LENGTH = 12; // 96 bits, standard for GCM

const RSA_OAEP_ALGORITHM = {
  name: "RSA-OAEP" as const,
  hash: "SHA-256" as const,
};

// Utility functions
function arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function generateRSAKeyPair(): Promise<KeyPair> {
  try {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: RSA_OAEP_ALGORITHM.name,
        modulusLength: RSA_MODULUS_LENGTH,
        publicExponent: RSA_PUBLIC_EXPONENT,
        hash: RSA_OAEP_ALGORITHM.hash,
      },
      true,
      ["encrypt", "decrypt"],
    );
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
    };
  } catch (error) {
    throw createCryptoError("generateRSAKeyPair", error as Error);
  }
}

export async function encryptRSA(
  data: Uint8Array,
  publicKey: CryptoKey,
): Promise<string> {
  try {
    const encrypted = await window.crypto.subtle.encrypt(
      RSA_OAEP_ALGORITHM,
      publicKey,
      data as BufferSource,
    );
    return arrayBufferToBase64(encrypted);
  } catch (error) {
    throw createCryptoError("encryptRSA", error as Error);
  }
}

export async function decryptRSA(
  ciphertext: string,
  privateKey: CryptoKey,
): Promise<Uint8Array> {
  try {
    const encrypted = base64ToUint8Array(ciphertext);
    const decrypted = await window.crypto.subtle.decrypt(
      RSA_OAEP_ALGORITHM,
      privateKey,
      encrypted as BufferSource,
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    throw createCryptoError("decryptRSA", error as Error);
  }
}

export async function generateAESKey(): Promise<CryptoKey> {
  try {
    return await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: AES_KEY_LENGTH },
      true,
      ["encrypt", "decrypt"],
    );
  } catch (error) {
    throw createCryptoError("generateAESKey", error as Error);
  }
}

export async function encryptAES(
  data: Uint8Array,
  key: CryptoKey,
): Promise<EncryptedMessage> {
  try {
    const iv = window.crypto.getRandomValues(new Uint8Array(AES_GCM_IV_LENGTH));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      data as BufferSource,
    );
    return {
      iv: arrayBufferToBase64(iv),
      ciphertext: arrayBufferToBase64(encrypted),
    };
  } catch (error) {
    throw createCryptoError("encryptAES", error as Error);
  }
}

export async function decryptAES(
  encrypted: EncryptedMessage,
  key: CryptoKey,
): Promise<Uint8Array> {
  try {
    const iv = base64ToUint8Array(encrypted.iv);
    const ciphertext = base64ToUint8Array(encrypted.ciphertext);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    throw createCryptoError("decryptAES", error as Error);
  }
}

export async function exportPublicKey(key: CryptoKey): Promise<JsonWebKey> {
  try {
    return await window.crypto.subtle.exportKey("jwk", key);
  } catch (error) {
    throw createCryptoError("exportPublicKey", error as Error);
  }
}

export async function importPublicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  try {
    return await window.crypto.subtle.importKey(
      "jwk",
      jwk,
      RSA_OAEP_ALGORITHM,
      true,
      ["encrypt"],
    );
  } catch (error) {
    throw createCryptoError("importPublicKey", error as Error);
  }
}
