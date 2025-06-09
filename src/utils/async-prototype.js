// Brief: Enabling async constructors without jeopardizing class hierarchy.

// Usage:
//  Define your base class as an extension of the default export.
//  Define your derived class as an extension of the class returned by `mixin(<Base Class>)`
//  Instead of writing a `constructor()` method, write a `static async constructor()`.
//  For your derived class, inside the static async constructor(),
//    - use `await this.asyncSuper()` instead of `super()`
//    - use `this.instance.<property>`, instead of the usual `this.<property>`

const keyString = 'Any random string that the user will never use as first parameter in class constructor :=)';

// Brief: Prototype for async base classes
export default class AsyncPrototype {
  static isAsync = true;

  static async instantiate (...args) {
    const instance = new this(keyString);
    const boundConstructor = this.constructor.bind(instance);
    await boundConstructor(...args);
    return instance;
  }

  constructor (key) {
    if (key === keyString) return;
    const className = this.constructor.name;
    throw new TypeError(
      `Instantiate with 'await ${className}.instantiate()' instead of 'new ${className}()'`,
      { cause: 'async constructor' }
    );
  }
}

// Brief: Returns prototype for async classes derived from a given base class (Base)
export function mixin (Base) {
  return class extends Base {
    static isAsync = true;

    static async instantiate (...args) {
      const instance = {
        constructor: this,
        async asyncSuper (...superArgs) {
          const superInstance = (Base.isAsync === true)
            ? await Base.instantiate(...superArgs)
            : new Base(...superArgs);

          const desiredInstance = new this.constructor(keyString, ...superArgs);

          delete this.asyncSuper;

          this.instance = Object.assign(desiredInstance, superInstance, Object.assign({}, desiredInstance));
        }
      };
      // new this
      const boundConstructor = this.constructor.bind(instance);
      await boundConstructor(...args);
      return instance.instance;
    }

    constructor (key, ...superArgs) {
      if (key === keyString) {
        if (Base.isAsync) {
          super(key, ...superArgs);
        } else {
          super(...superArgs);
        }
        return;
      }

      throw new TypeError(
        'Instantiate with \'await AsyncClass.instantiate()\' instead of \'new AsyncClass()\'',
        { cause: 'async constructor' }
      );
    }
  };
}
