import { default as Async, mixin } from './async-prototype.js';
import assert from 'node:assert';
// import { describe, it } from 'node:test';

class C {
  constructor (a, b) {
    if (!b) throw Error('b needs to be truthy');
    this.a = a;
    this.b = b;
  }

  dump () {
    return { a: this.a, b: this.b };
  }
}

class AsyncC extends Async {
  static async constructor (a, b) {
    if (!b) throw Error('b needs to be truthy');
    this.a = a;
    this.b = b;
  }

  dump () {
    return { a: this.a, b: this.b };
  }
}

class SubC extends C {
  constructor (a, b, c) {
    super(a, b);
    this.c = c;
  }

  dump () {
    return { ...super.dump(), c: this.c };
  }
}

class AsyncSubC extends mixin(C) {
  static async constructor (a, b, c) {
    await this.asyncSuper(a, b);
    this.instance.c = c;
  }

  dump () {
    return { ...super.dump(), c: this.c };
  }
}

class AsyncSubAsyncC extends mixin(AsyncC) {
  static async constructor (a, b, c) {
    await this.asyncSuper(a, b);
    this.instance.c = c;
  }

  dump () {
    return { ...super.dump(), c: this.c };
  }
}

class AsyncSubAsyncSubAsyncC extends mixin(AsyncSubAsyncC) {
  a = 'override';

  static async constructor (a, b, c, d) {
    await this.asyncSuper(a, b, c);
    this.instance.d = d;
    this.instance.b = 'override';
  }

  dump () {
    return { ...super.dump(), d: this.d };
  }
}

describe('Testing async-prototype', () => {
  describe('Base class', () => {
    it('new Class() throws', () => {
      assert.throws(() => new AsyncC(1, 2), { cause: 'async constructor' });
    });

    it('await Class._instantiate()', async () => {
      const c = await AsyncC.instantiate(1, 2);
      assert.deepStrictEqual(c.dump(), { a: 1, b: 2 });
    });
  });

  describe('Derived class: both derived from a standard class and an async class', () => {
    it('new Class() throws', () => {
      assert.throws(() => new AsyncSubC(1, 2, 3), { cause: 'async constructor' });
      assert.throws(() => new AsyncSubAsyncC(1, 2, 3), { cause: 'async constructor' });
    });

    it('await Class._instantiate()', async () => {
      const asyncSubC = await AsyncSubC.instantiate(1, 2, 3);
      assert.deepStrictEqual(asyncSubC.dump(), { a: 1, b: 2, c: 3 });
      const asyncSubAsyncC = await AsyncSubAsyncC.instantiate(1, 2, 3);
      assert.deepStrictEqual(asyncSubAsyncC.dump(), { a: 1, b: 2, c: 3 });
      const asyncSubAsyncSubAsyncC = await AsyncSubAsyncSubAsyncC.instantiate(1, 2, 3, 4);
      assert.deepStrictEqual(asyncSubAsyncSubAsyncC.dump(), { a: 'override', b: 'override', c: 3, d: 4 });
    });

    it('Maintain prototype chain', async () => {
      const asyncSubC = await AsyncSubC.instantiate(1, 2, 3);
      assert.ok(asyncSubC instanceof C);
      const asyncSubAsyncC = await AsyncSubAsyncC.instantiate(1, 2, 3);
      assert.ok(asyncSubAsyncC instanceof AsyncC);
      const asyncSubAsyncSubAsyncC = await AsyncSubAsyncSubAsyncC.instantiate(1, 2, 3, 4);
      assert.ok(asyncSubAsyncSubAsyncC instanceof AsyncC);
    });
  });
});
