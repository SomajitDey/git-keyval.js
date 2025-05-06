// Brief: Cryptographic utilities that act on bytes <Uint8Array>
//  Use ./conversions.js and ../types.js to convert other types into bytes

// Params: bytes <Uint8Array>
export async function hash (bytes, algo = 'SHA-256') {
  return crypto.subtle.digest(algo, bytes)
    .then((buffer) => new Uint8Array(buffer));
}

export default class Codec {
  key;

  static async instantiate (secretBytes) {
    const instance = new Codec();
    instance.key = await crypto.subtle.importKey('raw', secretBytes, 'AES-GCM', true, [
      'encrypt',
      'decrypt'
    ]);
    return instance;
  }

  async encrypt (bytes) {
  }
}
