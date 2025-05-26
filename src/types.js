import * as conversions from './utils/conversions.js';
import MimeDb from 'mime-db-lite';

const mimeDb = new MimeDb({ cacheMaxEntries: 32 });

export const types = [
  'Number',
  'Boolean',
  'String',
  'JSON',
  'Blob',
  'ArrayBuffer'
];

// Brief: Return the type of input
// Params: Any javascript value!
export function getType (input) {
  return Object.prototype.toString.call(input).split(' ').pop().slice(0, -1);
}

// Brief: Convert typed input into bytes. Also doubles as type checker/validator.
// Params: <boolean | string | number | array | object | ArrayBuffer | Uint8Array | blob>
// Returns: {
//    bytes: <Uint8Array>,
//    type: 'Number' | 'Boolean' | 'String' | 'JSON' | 'ArrayBuffer' | 'Blob' | undefined,
//    mimeType: <String>,
//    extension: <String>
//  }
export async function typedToBytes (input) {
  // Below we use fall-through a lot! Use of 'return' implies 'break'
  const type = getType(input);
  switch (type) {
    case 'Number':
      if (input.toString().length > 7) {
        return {
          type,
          bytes: conversions.numToBytes(input)
        };
      }
    case 'Boolean':
    case 'String':
      return { type, bytes: conversions.textToBytes(input.toString()), extension: 'txt' };
    case 'Null':
    case 'Array':
    case 'Object':
      return { type: 'JSON', bytes: conversions.textToBytes(JSON.stringify(input)), extension: 'json' };
    case 'Blob':
      // Using .arrayBuffer() instead of .bytes() because the latter isn't universally supported
      const blobBytes = new Uint8Array(await input.arrayBuffer());
      const mimeType = input.type;
      const [extension] = await mimeDb.getExtensions(mimeType).catch(() => []);
      // ext is undefined in case of error on the above RHS
      return { type, mimeType, bytes: blobBytes, extension };
    case 'Uint8Array':
      return { bytes: input };
    case 'ArrayBuffer':
      return { type, bytes: new Uint8Array(input) };
    default:
      throw new Error('Unsupported parameter type');
  }
}

// Brief: Inverse of typedToBytes()
// Params: { type: <string>, bytes: <Uint8Array> }
export function bytesToTyped ({ type = 'Uint8Array', mimeType, bytes }) {
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
    case 'Blob':
      return new Blob([bytes], { type: mimeType });
    case 'ArrayBuffer':
      return bytes.buffer;
    case 'Uint8Array':
      return bytes;
    default:
      throw new Error('Unsupported type');
  }
}
