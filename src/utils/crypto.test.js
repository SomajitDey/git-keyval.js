import Codec, * as cryptolib from './crypto.js';
import { textToBytes, hexToBytes } from './conversions.js';
import assert from 'assert';

const salt = crypto.getRandomValues(new Uint8Array(12));
const codec = await Codec.instantiate('Secret key', salt);

describe('Testing utils/crypto', () => {
  it('hash', async () => {
    const hash = hexToBytes('0a4d55a8d778e5022fab701977c5d840bbc486d0');
    assert.deepStrictEqual(await cryptolib.hash(textToBytes('Hello World'), 'SHA-1'), hash);
  });

  it('HMAC', async () => {
    const bytes = textToBytes('content');
    const key = textToBytes('key');
    const hmac = hexToBytes('8cd8aeca06e9d8514f6a96aea10c9e118730892a3e3188eb869d1a29197bba7a');
    assert.deepStrictEqual(await cryptolib.hmac(bytes, key), hmac);
  });

  it('Encryption * Decryption', async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await codec.encrypt(bytes);
    assert.deepStrictEqual(await codec.decrypt(cipher), bytes);
  });
});
