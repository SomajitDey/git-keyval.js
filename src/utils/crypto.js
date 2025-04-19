import { textToBytes, bytesToHex } from './conversions.js';

// Params: input <string> or <Uint8Array>
export async function hash (input, algo = 'SHA-256') {
  const bytesArray = typeof input === 'string' ? textToBytes(input) : input;
  return crypto.subtle.digest(algo, bytesArray)
    .then((buffer) => bytesToHex(new Uint8Array(buffer)));
}
