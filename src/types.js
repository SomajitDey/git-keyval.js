import * as conversions from './utils/conversions.js';
import repository from './github.js';

// Brief: Return the type of input
// Params: Any javascript value!
export function getType (input) {
  return Object.prototype.toString.call(input).split(' ').pop().slice(0,-1);
}

// Brief: Convert typed input into bytes. Also doubles as type checker/validator.
// Params: <string | number | object | Uint8Array>
// Returns: { bytes: <Uint8Array>, type: 'Number' | 'Boolean' | 'String' | 'JSON' | undefined }
export function typedToBytes (input) {
  // Below we use fall-through a lot! Use of 'return' implies 'break'
  const type = getType(input);
  switch (type) {
    case 'Number':
      if (input.toString().length > 7) return {
        type,
        bytes: conversions.numToBytes(input)
      };
    case 'Boolean':
    case 'String':
      return { type, bytes: conversions.textToBytes(input.toString()) };
    case 'Null':
    case 'Array':
    case 'Object':
      return { type: 'JSON', bytes: conversions.textToBytes(JSON.stringify(input)) };
    case 'Uint8Array':
      return { bytes: input };
    default:
      throw new Error('Input type not allowed');
  }
}

// Brief: Inverse of typedToBytes()
// Params: { type: <string>, bytes: <Uint8Array> }
export function bytesToTyped ({ type, bytes }) {
  switch (type) {
    case 'Number':
      if (bytes.length === 8) return conversions.bytesToNum(bytes);
      return Number(conversions.bytesToText(bytes));
    case 'Boolean':
      return conversions.bytesToText(bytes) === 'true';
    case 'String':
      return conversions.bytesToText(bytes);
    case 'JSON':
      return JSON.parse(conversions.bytesToText(bytes));
    default:
      return bytes;
  }
}
