// Brief: Instance of this to be used as .inv property of bidirectionalMap
class invMap extends Map {
  // Brief: To hold the Map object (key => val) the current instance (val => key) inverts
  __inverseOf;

  constructor (arg, inverseOf) {
    super(arg);
    if (inverseOf) this.__inverseOf = inverseOf;
  }

  isInverseOf (inverseOf) {
    this.__inverseOf = inverseOf;
  }

  // Overriding Map.prototype.method() by method()
  // However, __method() calls the overridden method

  // Brief: Delete key <=> val
  delete (val) {
    const key = this.get(val);
    this.__inverseOf?.__delete(key);
    return super.delete(val);
  }

  // Brief: Delete val => key
  __delete (val) {
    return super.delete(val);
  }

  // Brief: Try setting key <=> val without breaking bijection
  set (val, key) {
    if (this.__inverseOf?.has(key)) throw new Error('Breaking bijection');
    this.delete(val);
    this.__inverseOf?.__set(key, val);
    return super.set(val, key);
  }

  // Brief: Regenerate inverseOf based on current/this
  regenInverseOf () {
    this.__inverseOf.__clear();
    for (const [val, key] of this.entries()) {
      this.__inverseOf.__set(key, val);
    }
  }

  // Brief: Force set key <=> val by recreating inverseOf
  push (val, key) {
    if (!this.__inverseOf?.has(key)) return this.set(val, key);
    // Delete the mapping that was breaking bijection
    this.__delete(this.__inverseOf.get(key));

    this.__set(val, key);
    this.regenInverseOf();
  }

  // Brief: Set val => key
  __set (val, key) {
    return super.set(val, key);
  }

  // Brief: Clear everything
  clear () {
    this.__inverseOf?.__clear();
    return super.clear();
  }

  // Brief: Doesn't clear inverseOf
  __clear () {
    return super.clear();
  }
}

// Brief: Extends native `Map` class with an `inv` field to contain the inverse map
// Params: arg <Same as in Map() constructor>
export default class bidirectionalMap extends invMap {
  inv;

  constructor (arg) {
    const entries = Array.from(arg);
    const invEntries = Array.from(entries.map(([key, val]) => [val, key]));
    super(entries);
    this.inv = new invMap(invEntries, this);
    super.isInverseOf(this.inv);

    if (this.size + this.inv.size < entries.length + invEntries.length) { throw new Error('Breaking bijection'); }
  }
}
