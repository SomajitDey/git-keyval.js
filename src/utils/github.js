// Note: Using variables instead of template literals in GraphQL to avoid query injection attacks
// Ref: https://github.com/octokit/graphql.js/issues/2

import { request } from '@octokit/request';
import { withCustomRequest } from '@octokit/graphql';
import * as git from './git-hash.js';
import { bytesToBase64 } from './conversions.js';

const repository = {
  committer: {
    // Name and email uses the same letter(s) for better compression
    name: 'a a',
    email: 'a@a.a',
    date: '2025-01-01T00:00:00Z'
  }
};

repository.author = repository.committer;

// Brief: Decorate `repository` with properties and methods
repository.init = async function ({ owner, repo, auth }) {
  repository.owner = owner;
  repository.name = repo;

  repository.request = request.defaults({
    owner,
    repo,
    headers: {
      Authorization: auth ? `Bearer ${auth}` : auth,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  repository.graphql = withCustomRequest(repository.request);

  // The following network call, being the slowest, is not awaited immediately
  const pending = repository.graphql(`
    query($owner: String!, $repo: String!) {
      repository(followRenames: true, owner: $owner, name: $repo) {
        ... on Node {
          id
        }
      }
    }
  `, {
    owner,
    repo
  }).then((data) => data.repository.id);

  // Blob SHA corresponding to the 'empty' tag as prepped by the init workflow
  repository.emptyBlob = await git.blobHash('');

  // Tree SHA corresponding to the 'empty' tag
  repository.emptyTree = await git.treeHash({
    value: { type: 'blob', hash: repository.emptyBlob }
  });

  // Commit SHA corresponding to the 'empty' tag
  repository.emptyCommit = await git.commitHash({
    treeHash: repository.emptyTree,
    committer: repository.committer,
    author: repository.author,
    message: 'Empty value'
  });

  repository.id = await pending;
};

// Brief: Computes the hash of an orphan or root commit that contains the given bytes at ./value
repository.bytesToCommitHash = async function (bytes) {
  const blobHash = await git.blobHash(bytes);
  const treeHash = await git.treeHash({
    'value': { type: 'blob', hash: blobHash },
    'value.txt': { type: 'blob', hash: blobHash },
    'value.json': { type: 'blob', hash: blobHash }
  });
  return git.commitHash({
    treeHash,
    committer: repository.committer,
    author: repository.author,
  });
};

// Brief: Put provided bytes in ./value path of a deduplicated commit
// Params: bytes <Uint8Array>
// Returns: hex <string> commit hash
// Ref: https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
repository.commitBytes = async function (bytes) {
  // First, check if the desired commit already exists using an unauthenticated request to GitHub REST API
  const { owner, name: repo, bytesToCommitHash } = repository;
  const commitHash = await bytesToCommitHash(bytes);
  const exists = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/commits/${commitHash}`, {
    method: 'HEAD'
  }).then((response) => {
    const statusCode = response.status;
    if (response.ok) {
      return true;
    } else if (statusCode == 404) {
      return false;
    } else {
      throw new Error(`GitHub API network error: ${statusCode}`);
    }
  });

  if (exists) return commitHash; // Hooray!

  // Undertake the expensive process of commit creation using authenticated GitHub API requests
  const blobHash = await repository.request('POST /repos/{owner}/{repo}/git/blobs', {
    content: bytesToBase64(bytes),
    encoding: 'base64'
  }).then((response) => response.data.sha);

  const treeHash = await repository.request('POST /repos/{owner}/{repo}/git/trees', {
    tree: [
    {
      path: 'value',
      type: 'blob',
      mode: '100644',
      sha: blobHash
    },
    {
      path: 'value.txt',
      type: 'blob',
      mode: '100644',
      sha: blobHash
    },
    {
      path: 'value.json',
      type: 'blob',
      mode: '100644',
      sha: blobHash
    }
    ]
  }).then((response) => response.data.sha);
  return await repository.request('POST /repos/{owner}/{repo}/git/commits', {
    message: '',
    tree: treeHash,
    author: repository.author,
    committer: repository.committer
  }).then((response) => response.data.sha);
};

// Params: refUpdates <[<refUpdate>]>;  [] means array
// Each <refUpdate> is an object, ! means required:
//  { beforeOid: hex <string>, afterOid: hex <string> | 'empty' | 0, name: <string>! }
// Ref: https://docs.github.com/en/graphql/reference/mutations#updaterefs
repository.updateRefs = async function ([...refUpdates]) {
  refUpdates.forEach((refUpdate) => {
    const { afterOid, name } = refUpdate;

    // If afterOid is falsy (undefined, null, false, or 0), format ref for deletion
    // If afterOid includes the string `empty`, format ref to point to the 'empty' tag
    if (!afterOid) {
      refUpdate.afterOid = '0000000000000000000000000000000000000000';
    } else if (afterOid.toLowerCase().includes('empty')) {
      refUpdate.afterOid = repository.emptyCommit;
    }

    // If name is not a fully qualified name, format ref as branch
    if (!name.startsWith('refs/')) refUpdate.name = `refs/heads/${name}`;

    // Enable force update. This makes the `beforeOid` property optional.
    refUpdate.force = true;
  });
  return repository.graphql(
  `
    mutation($repositoryId: ID!, $refUpdates: [RefUpdate!]!) {
      updateRefs(input: { repositoryId: $repositoryId, refUpdates: $refUpdates }) {
        clientMutationId
      }
    }
  `,
  {
    repositoryId: repository.id,
    refUpdates
  });
};

// Brief: Fetch target commit hash for given branch
// Params: branch <string>
// Returns: hex <string>
// Note: Can be used unauthenticated
repository.branchToCommitHash = async function (branch) {
  return repository.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
    ref: `heads/${branch}`
  })
  .then((response) => response.data.object.sha)
  .catch((err) => {
    if (err.status == 404) return;
    throw err;
  });
}

// Brief: Fetch bytes content for the given commit, from a CDN. Tries multiple CDNs as fail-safe.
// Params: commitHash <string>
// Returns: bytes <Uint8Array> | undefined (if fails)
repository.fetchCommitContent = async function (commitHash) {
  const { owner: user, name: repo } = repository;
  const cdnURLs = [
    `https://cdn.jsdelivr.net/gh/${user}/${repo}@${commitHash}`,
    `https://cdn.statically.io/gh/${user}/${repo}/${commitHash}`,
    `https://rawcdn.githack.com/${user}/${repo}/${commitHash}`,
    `https://raw.githubusercontents.com/${user}/${repo}/${commitHash}`
  ];
  const path = '/value';
  for (const cdnURL of cdnURLs) {
    try {
      const bytes = await fetch(cdnURL + path, { redirect: 'follow' })
        .then((response) => {
          if (!response.ok) throw new Error(response.status);
          return response.bytes();
        });
      return bytes; // Error handler below is designed to skip this step in case of error
    } catch (err) {
      if (err.message == 404) {
        // If 404 for one CDN, no use trying other CDNs as commit might not exist in GitHub origin
        throw new Error('Commit not found');
      } else {
        continue; // Try other CDNs in case current CDN is down
      }
    }
  }
};

export default repository;
