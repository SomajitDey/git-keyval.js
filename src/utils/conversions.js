// Semantics: Bytes <Uint8Array>

import { fromUint8Array, toUint8Array as base64ToBytes } from 'js-base64';

// Params: base64ToBytes(encodedString) where encodedString is a base64 encoded string
//  that may optionally contain whitespace characters (e.g. new line and space)
export { base64ToBytes };

export function bytesToBase64 (bytes) {
  return fromUint8Array(bytes);
}

export function bytesToBase64Url (bytes) {
  return fromUint8Array(bytes, true);
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

// Params: txt <string>
// Returns: bytes <Uint8Array>
export function textToBytes (txt) {
  return textEncoder.encode(txt);
}

// Params: bytes <Uint8Array>
// Returns: txt <string>
export function bytesToText (bytes) {
  return textDecoder.decode(bytes);
}

// Params: bytes <Uint8Array>
// Returns: hexString <string>
export function bytesToHex (bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Params: hexString <Uint8Array>
// Returns: bytes <Uint8Array>
export function hexToBytes (hexString) {
  const numNibbles = hexString.length;
  if (numNibbles % 2 !== 0) throw new Error('Number of provided nibbles must be even');
  const bytes = [];
  for (let i = 0; i < numNibbles; i += 2) {
    bytes.push(parseInt(hexString[i] + hexString[i + 1], 16));
  }
  return Uint8Array.from(bytes);
}

// Params: hexString <string>
// Returns: base64String <string>
export function hexToBase64 (hexString) {
  return bytesToBase64(hexToBytes(hexString));
}

// Params: hexString <string>
// Returns: base64UrlString <string>
export function hexToBase64Url (hexString) {
  return bytesToBase64Url(hexToBytes(hexString));
}

// Params: base64String <string>
// Returns: hexString <string>
export function base64ToHex (base64String) {
  return bytesToHex(base64ToBytes(base64String));
}

// Brief: Convert any 64-bit number (float or int, signed or unsigned) into bytes
// Params: num <number>
// Returns: bytes <Uint8Array>
export function numToBytes (num) {
  return new Uint8Array(new Float64Array([num]).buffer);
}

// Params: bytes <Uint8Array>
// Returns: number <number>
// Remarks: Fidelity of conversion may be checked using Number.isSafeInteger() on the returned value
// If returned value is not a safe integer it's guaranteed to be very close to the actual number
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger#description
export function bytesToNum (bytes) {
  return new Float64Array(bytes.buffer)[0];
}

// Brief: Compress any 64-bit number (float or int, signed or unsigned) to base64 string with <= 11 characters
// Params: num <number>. Accepts any number including signed integers and floats
// Returns: base64String <string>
export function numToBase64 (num) {
  return bytesToBase64(numToBytes(num)).replace(/^A*/, '');
}

// Brief: Compress any 64-bit number (float or int, signed or unsigned) to base64 string with <= 11 characters
// Params: num <number>. Accepts any number including signed integers and floats
// Returns: base64UrlString <string>
export function numToBase64Url (num) {
  return bytesToBase64Url(numToBytes(num)).replace(/^A*/, '');
}

// Params: base64String <string>
// Returns: number <number>
// Remarks: Fidelity of conversion may be checked using Number.isSafeInteger() on the returned value
// If returned value is not a safe integer it's guaranteed to be very close to the actual number
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger#description
export function base64ToNum (base64String) {
  return bytesToNum(base64ToBytes(base64String.padStart(11, 'A')));
}

// Brief: Concatenate provided bytes
// Params: bytes <[Uint8Array]>, Array of Bytes
// Returns: <Uint8Array>
// Alternate implementation: refer https://stackoverflow.com/a/49129872
export async function concatBytes ([...bytes]) {
  return new Uint8Array(await new Blob(bytes).arrayBuffer());
}
