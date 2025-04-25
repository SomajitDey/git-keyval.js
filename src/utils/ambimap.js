// Brief: Exports a class that extends the native `Map` class with an `inv` property
//  to contain the inverse map
//  The two maps may be merged into one, if parameter `merge`=true
// Params: arg <Same as in Map() constructor>, merge <Boolean>
export default class extends Map {
  constructor (arg, merge = false) {
    const entries = Array.from(arg);
    const invEntries = Array.from(entries.map(([key, val]) => [val, key]));
    if (merge) {
      super([...entries, ...invEntries]);
      if (this.size < entries.length + invEntries.length) throw new Error('Any key must not be a value if merging');
    } else {
      super(entries);
      this.inv = new Map(invEntries);
    }
  }
}
