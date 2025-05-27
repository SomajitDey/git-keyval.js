#!/usr/bin/env node
// Brief: Initialise the given repo as database
// Env: GITHUB_OWNER, to pass github user
// Env: GITHUB_REPO, to pass repo name
// Env: GITHUB_AUTH, to pass auth/access token

import Database from './database.js';
import { config } from 'dotenv';

config(); // Sourcing .env
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const auth = process.env.GITHUB_AUTH;
if (Boolean(owner && repo && auth) === false) {
  throw new Error('Pass GITHUB_OWNER, GITHUB_REPO and GITHUB_AUTH as env variables');
}

const db = await Database.instantiate({ owner, repo, auth });
await db.init();
