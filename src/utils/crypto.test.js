import * as cryptolib from './crypto.js';
import assert from 'assert';

describe('Testing utils/crypto', () => {
it('hash', async () => {
  const hash = '0a4d55a8d778e5022fab701977c5d840bbc486d0';
  assert.equal(await cryptolib.hash('Hello World', 'SHA-1'), hash);
})
})
