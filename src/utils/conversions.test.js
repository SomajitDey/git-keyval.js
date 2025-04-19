import * as conversions from './conversions.js';
import assert from 'assert';

describe('Testing utils/conversions', () => {
  describe('bytesToBase64 and base64ToBytes', () => {
    const base64 = 'AbCD'; // Must be n*8 bit, so we chose 4*6 = 3*8 bit
    it('convert to and fro', () => {
      assert.equal(conversions.bytesToBase64(conversions.base64ToBytes(base64)), base64);
    })
    it('number of bytes', () => {
      assert.equal(conversions.base64ToBytes(base64).length, 3);
    })
  })

  it('textToBytes and bytesToText', () => {
    const txt = 'Hello World';
    assert.equal(conversions.bytesToText(conversions.textToBytes(txt)), txt);
  })

  describe('hexToBytes and bytesToHex', () => {
    const hex = '1970692b4ca5dfe67e073d1f88887cc7d642810e';
    it('convert to and fro', () => {
      assert.equal(conversions.bytesToHex(conversions.hexToBytes(hex)), hex);
    })
    it('number of bytes', () => {
      assert.equal(conversions.hexToBytes(hex).length, hex.length/2);
    })
  })

  it('hexToBase64 and base64ToHex', () => {
    const hex = '1970692b4ca5dfe67e073d1f88887cc7d642810e';
    assert.equal(conversions.base64ToHex(conversions.hexToBase64(hex)), hex);
  })

  it('numToBase64 and base64ToNum', () => {
    const num = -3878790.56;
    assert.equal(conversions.base64ToNum(conversions.numToBase64(num)), num);
  })
})
