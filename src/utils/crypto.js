// Brief: Cryptographic utilities that act on and return bytes <Uint8Array>
//  Use ./conversions.js and ../types.js to convert other types into bytes

import { concatBytes, textToBytes } from './conversions.js';

// Params: bytes <Uint8Array>
export async function hash (bytes, algo = 'SHA-256') {
  return crypto.subtle.digest(algo, bytes)
    .then((buffer) => new Uint8Array(buffer));
}

// Params: bytes <Uint8Array>, key <Uint8Array>
export async function hmac (bytes, key) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', keyMaterial, bytes));
}

// Params: passwd <String>, salt <Uint8Array>
export async function pbkdf2 (passwd, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textToBytes(passwd),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    )
  );
}

// Brief: Class having symmetric encrypt() and decrypt() methods
export default class Codec {
  key;

  // Brief: SHA-256 of the returned bytes will be used as AES-GCM's IV while encrypting the given bytes
  async iv (bytes) {
    return crypto.getRandomValues(new Uint8Array(32));
  }

  constructor (iv) {
    if (iv) this.iv = iv;
  }

  // Brief: Returns a complete instance of this class
  // Params: passwd <String>, salt <Uint8Array>
  // Ref: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey#pbkdf2_derive_aes_key_from_password
  static async instantiate (passwd, salt, iv = undefined) {
    const instance = new Codec(iv);
    instance.key = await pbkdf2(passwd, salt).then((keyBytes) =>
      crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', true, ['encrypt', 'decrypt'])
    );

    return instance;
  }

  async encrypt (bytes) {
    const iv = await this.iv(bytes).then((bytes) => hash(bytes));
    const cipher = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        this.key,
        bytes
      )
    );
    return concatBytes([iv, cipher]);
  }

  async decrypt (bytes) {
    // Slicing at offset 32 since iv is 32 bytes long
    const iv = bytes.slice(0, 32);
    const cipher = bytes.slice(32);
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        this.key,
        cipher
      )
    );
  }
}
