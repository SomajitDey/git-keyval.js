// Semantics: Bytes <Uint8Array>, Base64 <Base64-URL>

import { fromUint8Array as base64encode, toUint8Array as base64decode } from 'js-base64';

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
    .join('')
}

// Params: hexString <Uint8Array>
// Returns: bytesArray <Uint8Array>
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
// Returns: base64String <string>
export function hexToBase64 (hexString) {
  return base64encode(hexToBytes(hexString), true);
}

// Params: base64String <string>
// Returns: hexString <string>
export function base64ToHex (base64String) {
  return bytesToHex(base64decode(base64String));
}

// Compress any 64-bit number (float or int, signed or unsigned) to base64 string with <= 11 characters
// Params: num <number>. Accepts any number including signed integers and floats 
// Returns: base64String <string>
export function numTobase64 (num) {
  return base64encode(new Uint8Array(new Float64Array([num]).buffer), true)
    .replace(/^A*/,'');
}

// Params: base64String <string>
// Returns: number <number>
// Fidelity of conversion may be checked using Number.isSafeInteger() on the returned value
// If returned value is not a safe integer it's guaranteed to be very close to the actual number
// Ref: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger#description
export function base64ToNum (base64String) {
  return new Float64Array(base64decode(base64String.padStart(11,'A')).buffer)[0];
}

// Tests
const a = hexToBase64('1970692b4ca5dfe67e073d1f88887cc7d642810e');
console.log(a, base64ToHex(a));

const num = -3878790.56;
const b = numTobase64(num);
console.log(b, base64ToNum(b), num, Number.isSafeInteger(num));

const bytes1 = textToBytes("Hi there");
const bytes2 = textToBytes("Hello how do you do Pullinder and Pushkar?");
console.log(bytes1, bytesToText(bytes1), bytesToText(bytes2));
