import { request } from '@octokit/request';
import { graphql } from '@octokit/graphql';
import * as git from './git-hash.js';
import { bytesToBase64 } from './conversions.js'
 
// Name and email uses the same letter(s) for better compression
const committer = {
  name: 'a a',
  email: 'a@a.a',
  date: '2025-01-01T00:00:00.000Z'
};
const author = committer;

// Brief: Update empty ./value file in given branch with given bytes
// Params: bytes <Uint8Array>
export async function commitBlob({ bytes, branch, owner, repo, auth }) {
  const emptyBlobHash = await git.blobHash('');
  request('PUT /repos/{owner}/{repo}/contents/{path}', {
    owner,
    repo,
    branch,
    path: 'value',
    message: 'set value',
    committer,
    content: bytesToBase64(bytes),
    sha: emptyBlobHash,
    headers: {
    'Authorization': `Bearer ${auth}`
    }
  })
}

export async function updateRefs({ repositoryId, refUpdates, auth }) {
  const mutation = `
    mutation {
      updateRefs(input: ${ { repositoryId, refUpdates } }) {
      }
    }
  `
  graphql(mutation, {
    headers: {
    'Authorization': `Bearer ${auth}`
    }    
  })
}
