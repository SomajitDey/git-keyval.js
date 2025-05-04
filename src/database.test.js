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
  it('keyToUuid, create, read, delete', async () => {
    const key = { hello: 'world!' };
    assert.deepStrictEqual(await kv.keyToUuid(key), {
      uuid: 'JSON/gbrIqdWiKaJ4QsSwfhJ_W7QvTyE',
      type: 'JSON',
      commitHash: '81bac8a9d5a229a27842c4b07e127f5bb42f4f21'
    });
    const val = new Blob([JSON.stringify({ how: 'are you?' })], { type: 'application/json' });
    await kv.create(key, val, { overwrite: true });
    // Forcing delays using setTimeout in order to bust caches, if any
    // assert.deepStrictEqual(await kvUnauthenticated.read(key), val);
    assert.deepStrictEqual(await kv.read(key), val);
    assert.rejects(kv.create(key, val), { message: 'Key exists' });
    const newVal = crypto.randomUUID();
    await kv.create(key, newVal, { overwrite: true });
    // assert.deepStrictEqual(await kvUnauthenticated.read(key), newVal);
    assert.deepStrictEqual(await kv.read(key), newVal);
    await kv.delete([key]);
    // assert.deepStrictEqual(await kvUnauthenticated.read(key), undefined);
    assert.deepStrictEqual(await kv.read(key), undefined);
  });
});
