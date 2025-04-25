import ambimap from './ambimap.js';
import assert from 'assert';

describe('Testing bi-directional map', () => {
  const map = new ambimap([
    ['key', 'key is string'],
    [23, 'key is number'],
    [{ key: 'val' }, 'key is object']
  ]);
  const mergedMap = new ambimap(map, 'true');

  it('iterating over all keys for merge = false', () => {
    for (const key of map.keys()) {
      assert.equal(map.inv.get(map.get(key)), key);
    }
  });

  it('iterating over all keys for merge = true', () => {
    for (const key of mergedMap.keys()) {
      assert.equal(mergedMap.get(mergedMap.get(key)), key);
    }
  });

  it('Error if key is also value if merging', () => {
    let errMsg;
    try {
      const map = new ambimap([['key', 'value'], ['Key', 'key']], true);
    } catch (err) {
      errMsg = err.message;
    }
    assert.equal(errMsg, 'Any key must not be a value if merging');
  });
});
