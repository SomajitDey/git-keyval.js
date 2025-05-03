import DB from './database.js';
import assert from 'assert';
import { config } from 'dotenv';

config(); // Sourcing .env

const kv = await DB.instantiate({
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  auth: process.env.GITHUB_AUTH
});

describe('Testing database', () => {
  it('create, read, delete', async () => {
    const key = { hello: 'world!' };
    assert.deepStrictEqual(await kv.keyToUuid(key), {
      uuid: 'JSON/gbrIqdWiKaJ4QsSwfhJ_W7QvTyE',
      type: 'JSON',
      commitHash: '81bac8a9d5a229a27842c4b07e127f5bb42f4f21'
    });
    const val = new Blob([JSON.stringify({ how: 'are you?' })], { type: 'application/json' });
    await kv.create(key, val, { overwrite: false });
    assert.deepStrictEqual(await kv.read(key), val);
    await kv.delete([key]);
    assert.deepStrictEqual(await kv.read(key), undefined);
  });
});
