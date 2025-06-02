import DB from './database.js';
import assert from 'assert';
import { describe, it } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { config } from 'dotenv';

config(); // Sourcing .env

const kv = await DB.instantiate({
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  auth: process.env.GITHUB_AUTH
});

const val = 2;
const promises = [];
for (let i=0; i<200; i++) {
  promises.push(kv.create(i, val, { ttl: -1 }));
};
await Promise.all(promises);

await kv.gc();

describe('Checking if GC can remove lots of stale keys', () => {  
  it('GC', async () => {
    const promises = [];
    for (let i=0; i<31; i++) {
      promises.push(kv.has(i).then((bool) => assert.equal(bool, false)));
    };
  })
});
