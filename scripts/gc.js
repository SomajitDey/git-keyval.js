#!/usr/bin/env node
// Brief: Garbage-collect from the given repo/database
// Arg: <owner>/<repo>, to pass github user/repo
// Env: GH_TOKEN, to pass auth/access token

import Database from '../src/index.js';

const [owner, repo] = process.argv[2]?.split('/') ?? [];
const auth = process.env.GH_TOKEN;
if (Boolean(owner && repo && auth) === false) {
  throw new Error('Pass <owner>/<repo> as arg and GH_TOKEN as env variable');
}

const db = await Database.instantiate({ owner, repo, auth });
const numKeysRemoved = await db.gc();
console.log(`GC: Removed ${numKeysRemoved} stale keys at https://github.com/${owner}/${repo}`);
