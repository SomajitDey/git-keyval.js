// Semantics: Bytes <Uint8Array>, Base64 <Base64-URL>

import { fromUint8Array as base64encode, toUint8Array as base64decode } from 'js-base64';

// Params: bytesArray <Uint8Array>
// Returns: <string>
export function bytesToHex (bytesArray) {
  return Array.from(bytesArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Params: hexString <Uint8Array>
// Returns: <Uint8Array>
export function hexToBytes (hexString) {
  const numNibbles = hexString.length;
  if (numNibbles%2 !== 0) throw new Error('Number of provided nibbles must be even');
  const bytes = [];
  for (let i = 0; i < numNibbles; i+=2) {
    bytes.push(parseInt(hexString[i] + hexString[i+1], 16));
  }
  return Uint8Array.from(bytes);
}

// Params: hexString <string>
// Returns: <string>
export function hexToBase64 (hexString) {
  return base64encode(hexToBytes(hexString), true);
}

// Params: base64String <string>
// Returns: <string>
export function base64ToHex (base64String) {
  return bytesToHex(base64decode(base64String));
}

// Tests
const a = hexToBase64('1970692b4ca5dfe67e073d1f88887cc7d642810e');
console.log(a, base64ToHex(a));
