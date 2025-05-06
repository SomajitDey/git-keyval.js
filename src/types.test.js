import * as types from './types.js';
import assert from 'assert';

function test (input) {
  it(`For input: ${input}, type: ${types.getType(input)}`, async () => {
    assert.deepStrictEqual(types.bytesToTyped(await types.typedToBytes(input)), input);
  });
}

describe('Testing types', () => {
  describe('typedToBytes and bytesToTyped', () => {
    const inputs = [
      8,
      -2345.2387,
      -89.2378798E-2,
      true,
      false,
      'Hello World!',
      [{ hi: 'there!' }, { how: 'are you?' }],
      { key: 'value' },
      'null',
      new Uint8Array([123, 298]),
      new Float64Array([12, 78]).buffer,
      new Blob(['Hello World!', ' ', 'How are you?'], { type: 'text/plain' })
    ];

    inputs.forEach(test);
  });
});
