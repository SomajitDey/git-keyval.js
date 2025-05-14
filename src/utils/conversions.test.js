import * as conversions from './conversions.js';
import assert from 'assert';

describe('Testing utils/conversions', () => {
  describe('bytesToBase64 and base64ToBytes', () => {
    it('convert to and fro, and number of bytes', () => {
      // Note: The following base64 contains optional whitespace (space and new line)
      const base64 = 'AbC\n +'; // Must be n*8 bit, so we chose 4*6 = 3*8 bit
      assert.equal(
        conversions.bytesToBase64(conversions.base64ToBytes(base64)),
        base64.replace(/\s/g, '') // Remove all whitespace
      );
      assert.equal(conversions.base64ToBytes(base64).length, 3);
    });
  });

  describe('bytesToBase64Url and base64ToBytes', () => {
    it('convert to and fro, and number of bytes', () => {
      const base64 = 'AbC-'; // Must be n*8 bit, so we chose 4*6 = 3*8 bit
      assert.equal(conversions.bytesToBase64Url(conversions.base64ToBytes(base64)), base64);
      assert.equal(conversions.base64ToBytes(base64).length, 3);
    });
  });

  it('textToBytes and bytesToText', () => {
    const txt = 'Hello World';
    assert.equal(conversions.bytesToText(conversions.textToBytes(txt)), txt);
  });

  describe('hexToBytes and bytesToHex', () => {
    it('convert to and fro, and number of bytes', () => {
      const hex = '1970692b4ca5dfe67e073d1f88887cc7d642810e';
      assert.equal(conversions.bytesToHex(conversions.hexToBytes(hex)), hex);
      assert.equal(conversions.hexToBytes(hex).length, hex.length / 2);
    });
  });

  it('hexToBase64 and base64ToHex', () => {
    const hex = '1970692b4ca5dfe67e073d1f88887cc7d642810e';
    assert.equal(conversions.base64ToHex(conversions.hexToBase64(hex)), hex);
  });

  it('hexToBase64Url and base64ToHex', () => {
    const hex = '1970692b4ca5dfe67e073d1f88887cc7d642810e';
    assert.equal(conversions.base64ToHex(conversions.hexToBase64Url(hex)), hex);
  });

  it('numToBytes and bytesToNum', () => {
    const num = -3878790.56;
    assert.equal(conversions.bytesToNum(conversions.numToBytes(num)), num);
  });

  it('numToBase64 and base64ToNum', () => {
    const num = -3878790.56;
    assert.equal(conversions.base64ToNum(conversions.numToBase64(num)), num);
  });

  it('numToBase64Url and base64ToNum', () => {
    const num = -3878790.56;
    assert.equal(conversions.base64ToNum(conversions.numToBase64Url(num)), num);
  });
});
