// Note: Using a timeout before reads after an update to allow changes take effect across upstream

import DB from './database.js';
import Codec from './utils/crypto.js';
import { textToBytes, concatBytes } from './utils/conversions.js';
import assert from 'assert';
import { setTimeout } from 'node:timers/promises';
import { config } from 'dotenv';

config(); // Sourcing .env

const passwd = process.env.PASSWORD;
const ownerRepo = `${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`;
const salt = textToBytes(ownerRepo);
const iv = (bytes) => concatBytes([
  textToBytes(passwd),
  salt,
  bytes
]);
const codec = await Codec.instantiate(passwd, salt, iv);

const kv = await DB.instantiate({
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  auth: process.env.GITHUB_AUTH,
  encrypt: async (bytes) => codec.encrypt(bytes),
  decrypt: async (bytes) => codec.decrypt(bytes)
});

// Can't use unauthenticated for private repositories
const kvUnauthenticated = kv.repository.isPublic ? await DB.instantiate({
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  encrypt: async (bytes) => codec.encrypt(bytes),
  decrypt: async (bytes) => codec.decrypt(bytes)
}) : kv;

describe('Testing database', () => {
  it('keyToUuid, uuidToKey, create, read, update, increment, toggle, delete', async () => {
    const key = { hello: 'world!' };
    const val = { how: 'are you?' };
    const { uuid } = await kv.create(key, val);
    assert.deepStrictEqual(await kvUnauthenticated.uuidToKey(uuid), key);
    assert.deepStrictEqual(await kv.read(key), val);
    await assert.rejects(kv.create(key, val, { overwrite: false }), { message: 'Key exists' });
    const modifier = (obj) => {
      obj.how = 'are you now?';
      obj.who = 'are  you?';
      return obj;
    };
    const modifiedVal = modifier(val);
    await kv.update(key, modifier);
    await setTimeout(2000);
    assert.deepStrictEqual(await kv.read(key), modifiedVal);
    await assert.rejects(kv.increment(key, -4), new Error('modifier() threw error. See "cause" for details.', { cause: new Error('Old value must be a Number') }));
    await assert.rejects(kv.toggle(key), new Error('modifier() threw error. See "cause" for details.', { cause: new Error('Old value must be a Boolean') }));

    const blob = new Blob(['hello', 'world'], { type: 'custom/mime' });
    await kv.create(key, blob, { overwrite: true });
    await setTimeout(2000);
    assert.deepStrictEqual(await kv.read(key), blob);

    const typedArray = new Uint8Array([12, 23, 3434]);
    await kv.create(key, typedArray, { overwrite: true });
    await setTimeout(2000);
    assert.deepStrictEqual(await kv.read(key), typedArray);

    await kv.create(key, 3, { overwrite: true });
    await setTimeout(2000);
    await kv.increment(key, -4);
    await setTimeout(2000);
    assert.deepStrictEqual(await kv.read(key), -1);

    await kv.create(key, false, { overwrite: true });
    await setTimeout(2000);
    await kv.toggle(key);
    await setTimeout(2000);
    assert.deepStrictEqual(await kv.read(key), true);

    await kv.delete(key);
    await setTimeout(2000);
    assert.deepStrictEqual(await kv.has(key), false);
    assert.deepStrictEqual(await kv.read(key), undefined);
    await assert.rejects(kv.create(key, val, { overwrite: true }), { message: 'Nothing to overwrite' });
  });
});
