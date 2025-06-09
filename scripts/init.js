#!/usr/bin/env node
// Brief: Initialise the given repo as database
// Arg: <owner>/<repo>, to pass github user/repo
// Env: GH_REPO, same as arg above. To be used if arg is not provided.
// Env: GH_TOKEN, to pass auth/access token

import Database from '../src/index.js';

const ownerRepo = process.argv[2] ?? process.env.GH_REPO;
const auth = process.env.GH_TOKEN;
if (Boolean(ownerRepo && auth) === false) {
  throw new Error('Pass <owner>/<repo> as arg and GH_TOKEN as env variable');
}

const db = await Database.instantiate(ownerRepo, { auth });
await db.init();
console.log(`Initialised https://github.com/${ownerRepo}`);
