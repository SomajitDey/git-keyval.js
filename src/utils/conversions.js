// Semantics: Bytes <Uint8Array>

import { fromUint8Array, toUint8Array as base64ToBytes } from 'js-base64';

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
// Returns: bytesArray <Uint8Array>
export function textToBytes (txt) {
  return textEncoder.encode(txt);
}

// Params: bytesArray <Uint8Array>
// Returns: txt <string>
export function bytesToText (bytesArray) {
  return textDecoder.decode(bytesArray);
}

// Params: bytesArray <Uint8Array>
// Returns: hexString <string>
export function bytesToHex (bytesArray) {
  return Array.from(bytesArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Params: hexString <Uint8Array>
// Returns: bytesArray <Uint8Array>
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
// Returns: bytesArray <Uint8Array>
export function numToBytes (num) {
  return new Uint8Array(new Float64Array([num]).buffer);
}

// Params: bytesArray <Uint8Array>
// Returns: number <number>
// Remarks: Fidelity of conversion may be checked using Number.isSafeInteger() on the returned value
// If returned value is not a safe integer it's guaranteed to be very close to the actual number
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger#description
export function bytesToNum (bytesArray) {
  return new Float64Array(bytesArray.buffer)[0];
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
