#!/usr/bin/env node
// Brief: Perform a stress test on Garbage-collection from the given repo/database
// Arg: <owner>/<repo>, to pass github user/repo
// Env: GH_REPO, same as arg above. To be used if arg is not provided.
// Env: GH_TOKEN, to pass auth/access token

import DB from '../src/index.js';
import assert from 'assert';
import { describe, it } from 'node:test';
import { setTimeout } from 'node:timers/promises';

const repoSpec = process.argv[2] ?? process.env.GH_REPO;
const [owner, repo] = repoSpec?.split('/') ?? [];
const auth = process.env.GH_TOKEN;
if (Boolean(owner && repo && auth) === false) {
  throw new Error('Pass <owner>/<repo> as arg and GH_TOKEN as env variable');
}

const numKeys = 200; // Too big triggers GitHub's (secondary) rate-limits

const kv = await DB.instantiate({ owner, repo, auth });

const val = 2; // Any random value; setting same value for all keys for efficiency

describe(`Checking if GC can remove ${numKeys} stale keys`, () => {
  it('GC', async () => {
    // Create a large number of stale (ttl: -1) keys.
    const promises = [];
    for (let i = 0; i < numKeys; i++) {
      promises[i] = kv.create(i, val, { ttl: -1 });
    }
    await Promise.all(promises);

    // GC now to remove all the stale keys
    await kv.gc();

    await setTimeout(2000); // Waiting #milliseconds to let changes take effect across GitHub APIs

    // Checking if any stale key survived GC
    for (let i = 0; i < numKeys; i++) {
      promises[i] = kv.has(i).then((bool) => assert.equal(bool, false));
    }
    await Promise.all(promises);
  });
});
