// Brief: Extends native `Map` class with an `inv` field to contain the inverse map
export default class BidirectionalMap extends Map {
  // Brief: To hold the Map object (key => val) the current instance (val => key) inverts
  inv;

  // Params: (required) iterable <same as taken by Map(), an iterable or Map instance>
  // Params: inverseOf <BidirectionalMap>, for internal use only
  constructor (iterable, inverseOf) {
    super(iterable);
    if (inverseOf) {
      this.inv = inverseOf;
    } else {
      const invEntries = Array.from(this).map(([val, key]) => [key, val]);
      this.inv = new BidirectionalMap(invEntries, this);
      if (this.inv.size < invEntries.length) throw new Error('Breaking bijection');
    }
    if (this.size !== this.inv.size) throw new Error('Breaking bijection');
  }

  // Overriding Map.prototype.method() by method()
  // However, __method() calls the overridden method

  // Brief: Delete key <=> val
  delete (val) {
    const key = this.get(val);
    this.inv?.__delete(key);
    return super.delete(val);
  }

  // Brief: Delete val => key
  __delete (val) {
    return super.delete(val);
  }

  // Brief: Try setting key <=> val without breaking bijection
  set (val, key) {
    if (this.inv?.has(key)) throw new Error('Breaking bijection');
    this.delete(val);
    this.inv?.__set(key, val);
    return super.set(val, key);
  }

  // Brief: Regenerate inverseOf based on current/this
  regenInverseOf () {
    this.inv.__clear();
    for (const [val, key] of this.entries()) {
      this.inv.__set(key, val);
    }
  }

  // Brief: Force set key <=> val by recreating inverseOf
  push (val, key) {
    if (!this.inv?.has(key)) return this.set(val, key);
    // Delete the mapping that was breaking bijection
    this.__delete(this.inv.get(key));

    this.__set(val, key);
    this.regenInverseOf();
  }

  // Brief: Set val => key
  __set (val, key) {
    return super.set(val, key);
  }

  // Brief: Clear everything
  clear () {
    this.inv?.__clear();
    return super.clear();
  }

  // Brief: Doesn't clear inverseOf
  __clear () {
    return super.clear();
  }
}
