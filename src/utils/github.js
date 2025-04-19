import { request } from '@octokit/request';
import { withCustomRequest } from '@octokit/graphql';
import * as git from './git-hash.js';
import { bytesToBase64 } from './conversions.js';

export const repository = {};

// Brief: Cache repository info
export async function init ({ owner, repo, auth }) {
  repository.owner = owner;
  repository.name = repo;

  repository.request = request.defaults({
    owner,
    repo,
    headers: {
      Authorization: `Bearer ${auth}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }    
  })

  repository.graphql = withCustomRequest(repository.request);
  
  // The following network call, being the slowest, is not awaited immediately
  const pending = repository.graphql(`
    query {
      repository(followRenames: true, owner: "${owner}", name: "${repo}") {
        ... on Node {
          id
        }
      }
    }
  `)
  .then((data) => data.repository.id)
  
  repository.emptyBlob = await git.blobHash('');

  repository.id = await pending;
}

// Name and email uses the same letter(s) for better compression
const committer = {
  name: 'a a',
  email: 'a@a.a',
  date: '2025-01-01T00:00:00.000Z'
};
const author = committer;

// Brief: Update empty ./value file in given branch with given bytes
// Params: bytes <Uint8Array>
export async function commitBlob ({ bytes, branch }) {
  request('PUT /repos/{owner}/{repo}/contents/{path}', {
    branch,
    path: 'value',
    message: 'set value',
    committer,
    content: bytesToBase64(bytes),
    sha: repository.emptyBlob,
  });
}

export async function updateRefs ({ refUpdates }) {
  graphql(`
    mutation {
      updateRefs(input: ${{ repositoryId: repository.id, refUpdates }}) {
      }
    }
  `)
}
