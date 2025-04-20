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
    date: '2025-01-01T00:00:00.000Z'
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
      Authorization: `Bearer ${auth}`,
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

// Brief: Update empty ./value file in given branch with given bytes
// Params: bytes <Uint8Array>, branch <string>
// Returns: hex <string> commit sha
// Ref: https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
repository.commitBlob = async function ({ bytes, branch }) {
  return repository.request('PUT /repos/{owner}/{repo}/contents/{path}', {
    branch,
    path: 'value',
    message: 'Set value',
    committer,
    content: bytesToBase64(bytes),
    sha: repository.emptyBlob
  }).then((response) => response.commit.sha);
};

// Params: refUpdates <Array of <refUpdate>>
// Each <refUpdate> is an object, ! means required:
//  { beforeOid: hex <string>, afterOid: hex <string> | 'empty' | 0, name: <string>! }
// Ref: https://docs.github.com/en/graphql/reference/mutations#updaterefs
repository.updateRefs = async function ([...refUpdates]) {
  refUpdates.forEach((refUpdate) => {
    const { afterOid, name } = refUpdate;

    // If afterOid is falsy (undefined, null, false, or 0), format ref for deletion
    // If afterOid includes the string `empty`, format ref to point to the 'empty' tag
    if (! afterOid) {
      refUpdate.afterOid = '0000000000000000000000000000000000000000';
    } else if (afterOid.toLowerCase().includes('empty')) {
      refUpdate.afterOid = repository.emptyCommit;
    };

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

export default repository;
