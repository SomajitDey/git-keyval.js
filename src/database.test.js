import DB from './database.js';
import assert from 'assert';
import { config } from 'dotenv';

config(); // Sourcing .env

const kv = await DB.instantiate({
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  auth: process.env.GITHUB_AUTH
});

// const kvUnauthenticated = await DB.instantiate({
//  owner: process.env.GITHUB_OWNER,
//  repo: process.env.GITHUB_REPO
// });

describe('Testing database', () => {
  it('keyToUuid, create, read, update, increment, toggle, delete', async () => {
    const key = { hello: 'world!' };
    assert.deepStrictEqual(await kv.keyToUuid(key), {
      uuid: 'JSON/gbrIqdWiKaJ4QsSwfhJ_W7QvTyE',
      type: 'JSON',
      commitHash: '81bac8a9d5a229a27842c4b07e127f5bb42f4f21'
    });
    const val = { how: 'are you?' };
    await kv.create(key, val, { overwrite: true });
    // assert.deepStrictEqual(await kvUnauthenticated.read(key), val);
    assert.deepStrictEqual(await kv.read(key), val);
    assert.rejects(kv.create(key, val), { message: 'Key exists' });
    const modifier = (obj) => {
      obj.how = 'are you now?';
      return obj;
    };
    const modifiedVal = modifier(val);
    await kv.update(key, modifier);
    assert.deepStrictEqual(await kv.read(key), modifiedVal);
    assert.rejects(kv.increment(key, -4), { message: 'Old value must be a Number' });
    assert.rejects(kv.toggle(key), { message: 'Old value must be a Boolean' });

    await kv.create(key, 3, { overwrite: true });
    await kv.increment(key, -4);
    assert.deepStrictEqual(await kv.read(key), -1);

    await kv.create(key, false, { overwrite: true });
    await kv.toggle(key);
    assert.deepStrictEqual(await kv.read(key), true);

    await kv.delete([key]);
    // assert.deepStrictEqual(await kvUnauthenticated.read(key), undefined);
    assert.deepStrictEqual(await kv.read(key), undefined);
  });
});
