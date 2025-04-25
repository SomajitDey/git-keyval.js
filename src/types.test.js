import * as types from './types.js';
import assert from 'assert';

function test (input) {
  it(`For input: ${input}, type: ${types.getType(input)}`, () => {
    assert.deepStrictEqual(types.bytesToTyped(types.typedToBytes(input)), input);
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
      new Uint8Array([123, 298])
    ];

    inputs.forEach(test);
  });
});
