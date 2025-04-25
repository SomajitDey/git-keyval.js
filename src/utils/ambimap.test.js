import ambimap from './ambimap.js';
import assert from 'assert';

const map = new Map([
  ['key', 'key is string'],
  [23, 'key is number'],
  [{ key: 'val' }, 'key is object']
]);

describe('Testing bi-directional map', () => {
  it('ambimap.inv.inv == ambimap', () => {
    const biMap = new ambimap(map);
    assert.deepStrictEqual(biMap.inv.inv, biMap);
  });

  it('Iterating over all keys', () => {
    const biMap = new ambimap(map);

    for (const [key, val] of biMap.entries()) {
      assert.deepStrictEqual(biMap.inv.get(val), key);
    }
  });

  it('Error for non-bijective maps', () => {
    assert.throws(() => { new ambimap([['keyA', 'val'], ['keyB', 'val']]); });
  });

  it('clear()', () => {
    const biMap = new ambimap(map);
    biMap.clear();
    assert.strictEqual(biMap.size + biMap.inv.size, 0);
  });

  it('inv.clear()', () => {
    const biMap = new ambimap(map);
    biMap.inv.clear();
    assert.strictEqual(biMap.size + biMap.inv.size, 0);
  });

  it('delete() and has(), inv.has()', () => {
    const biMap = new ambimap(map);
    const [key, val] = Array.from(map)[0];
    biMap.delete(key);
    assert.ok(!(biMap.has(key) && biMap.inv.has(val)));
  });

  it('inv.delete() and has(), inv.has()', () => {
    const biMap = new ambimap(map);
    const [key, val] = Array.from(map)[1];
    biMap.inv.delete(val);
    assert.ok(!(biMap.has(key) && biMap.inv.has(val)));
  });

  describe('set()', () => {
    it('old key, new value', () => {
      const biMap = new ambimap(map);
      const key = Array.from(map.keys())[0];
      const val = 'new value';
      biMap.set(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('new key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[0];
      const key = 'new key';
      assert.throws(() => { biMap.set(key, val); });
    });

    it('old key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[1];
      const key = Array.from(map.keys())[0];
      assert.throws(() => { biMap.set(key, val); });
    });

    it('new key, new value', () => {
      const biMap = new ambimap(map);
      const val = 'new value';
      const key = 'new key';
      biMap.set(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });
  });

  describe('inv.set()', () => {
    it('old key, new value', () => {
      const biMap = new ambimap(map);
      const key = Array.from(map.keys())[0];
      const val = 'new value';
      assert.throws(() => { biMap.inv.set(val, key); });
    });

    it('new key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[0];
      const key = 'new key';
      biMap.inv.set(val, key);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('old key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[1];
      const key = Array.from(map.keys())[0];
      assert.throws(() => { biMap.inv.set(val, key); });
    });

    it('new key, new value', () => {
      const biMap = new ambimap(map);
      const val = 'new value';
      const key = 'new key';
      biMap.inv.set(val, key);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });
  });

  describe('push()', () => {
    it('old key, new value', () => {
      const biMap = new ambimap(map);
      const key = Array.from(map.keys())[0];
      const val = 'new value';
      biMap.push(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('new key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[0];
      const key = 'new key';
      biMap.push(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('old key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[1];
      const key = Array.from(map.keys())[0];
      biMap.push(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('new key, new value', () => {
      const biMap = new ambimap(map);
      const val = 'new value';
      const key = 'new key';
      biMap.push(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });
  });

  describe('inv.push()', () => {
    it('old key, new value', () => {
      const biMap = new ambimap(map);
      const key = Array.from(map.keys())[0];
      const val = 'new value';
      biMap.push(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('new key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[0];
      const key = 'new key';
      biMap.inv.push(val, key);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('old key, old value', () => {
      const biMap = new ambimap(map);
      const val = Array.from(map.values())[1];
      const key = Array.from(map.keys())[0];
      biMap.push(key, val);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });

    it('new key, new value', () => {
      const biMap = new ambimap(map);
      const val = 'new value';
      const key = 'new key';
      biMap.inv.push(val, key);
      assert.equal(biMap.get(key), val);
      assert.equal(biMap.inv.get(val), key);
    });
  });
});
