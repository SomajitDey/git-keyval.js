import * as conversions from './utils/conversions.js';
import ambimap from './utils/ambimap.js';

export const typesToCommitHash = new ambimap([
  ['Number', '14f91166da82bb4c61d208ac02c492355e8d2cc2'],
  ['Boolean', '6e3272db79ec82e0caee4729c2b7f7e90e1900d8'],
  ['String', '297f8811f388d4789333d7f2377519c145c4f874'],
  ['JSON', 'f8f3eae1d21b150f5d020b65afd1cb6c07f11ab1'],
  ['Blob', '844f74f26e3a8afe7ff86d5870f40d2a3b926d3a']
]);

export const commitHashToTypes = typesToCommitHash.inv;

// Brief: Return the type of input
// Params: Any javascript value!
export function getType (input) {
  return Object.prototype.toString.call(input).split(' ').pop().slice(0, -1);
}

// Brief: Convert typed input into bytes. Also doubles as type checker/validator.
// Params: <string | number | object | Uint8Array>
// Returns: { bytes: <Uint8Array>, type: 'Number' | 'Boolean' | 'String' | 'JSON' | undefined }
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
      return { type, bytes: conversions.textToBytes(input.toString()) };
    case 'Null':
    case 'Array':
    case 'Object':
      return { type: 'JSON', bytes: conversions.textToBytes(JSON.stringify(input)) };
    case 'Blob':
      const blobBuffer = input.arrayBuffer();
      const mimeType = input.type;
      const offset = mimeType.length + 1;
      const bytes = new Uint8Array(offset + input.size);
      bytes.set([offset]);
      bytes.set(conversions.textToBytes(mimeType), 1);
      bytes.set(new Uint8Array(await blobBuffer), offset);
      return { type, bytes };
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
    case 'Blob':
      const offset = bytes[0];
      const mimeType = conversions.bytesToText(bytes.slice(1, offset));
      return new Blob([bytes.slice(offset)], { type: mimeType });
    default:
      return bytes;
  }
}
