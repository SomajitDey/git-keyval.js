//import { request } from '@octokit/request';
//import { graphql } from '@octokit/graphql';
import * as git from './git-hash.js';

// Name and email uses the same letter(s) for better compression
// Date is Git representation of time (in ISO format): 2025-01-01T00:00:00.000Z
const committer = {
  name: 'a a',
  email: 'a@a.a',
  date: `${Math.floor(Date.UTC(2025)/1000)} +0000`
};
const author = committer;

console.log(await git.blobHash('hello world'));
