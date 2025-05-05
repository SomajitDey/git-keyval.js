// Brief: Exports default class Repository
// Usage: await Repository.instantiate({...}) returns a complete instance of the class

// Note: Using variables instead of template literals in GraphQL to avoid query injection attacks
// Ref: https://github.com/octokit/graphql.js/issues/2

import { request } from '@octokit/request';
import { withCustomRequest } from '@octokit/graphql';
import * as git from './utils/git-hash.js';
import { bytesToBase64, base64ToBytes } from './utils/conversions.js';
import { typesToCommitHash } from './types.js';

export default class Repository {
  // Declaring properties to be initialized by constructor() or init()
  committer;
  author;
  owner;
  name;
  authenticated;
  encryptSecret;
  request;
  graphql;
  id;
  isPublic;
  created;

  static committer = {
    // Name and email uses the same letter(s) for better compression
    name: 'a a',
    email: 'a@a.a',
    date: '2025-01-01T00:00:00Z'
  };

  // Await this static method to get a class instance
  // Params: Same as that of constructor() below
  static async instantiate (obj) {
    const instance = new Repository(obj);
    await instance.init();
    return instance;
  }

  constructor ({ owner, repo, auth, secret }) {
    this.committer = Repository.committer;
    this.author = Repository.committer;
    this.owner = owner;
    this.name = repo;
    this.authenticated = Boolean(auth);
    this.encryptSecret = secret;

    this.request = request.defaults({
      owner,
      repo,
      headers: {
        Authorization: auth ? `Bearer ${auth}` : undefined,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });

    this.graphql = withCustomRequest(this.request);
  }

  // Brief: Fetch repository info from GitHub API
  async init () {
  // Using REST API instead of GraphQL to support unauthenticated reads
    const [{ node_id, visibility, created_at }] = await Promise.all([
      this.request('GET /repos/{owner}/{repo}')
        .then((response) => response.data),
      this.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        ref: 'tags/kv/types/Blob'
      })
        .then((response) => {
          if (
            response.data.object.sha !== typesToCommitHash.get('Blob')
          ) throw new Error('Mismatched');
        })
        .catch((err) => {
          if (err.status == 404 || err.message === 'Mismatched') { throw new Error('Run init workflow in the GitHub repo first!'); }
          throw err;
        })
    ]);

    this.id = node_id;
    this.isPublic = visibility === 'public';
    this.created = new Date(created_at).getTime();
  }

  // Brief: Computes the hash of an orphan or root commit that contains the given bytes at ./value
  async bytesToCommitHash (bytes) {
    const blobHash = await git.blobHash(bytes);
    const treeHash = await git.treeHash({
      value: { type: 'blob', hash: blobHash },
      'value.txt': { type: 'blob', hash: blobHash },
      'value.json': { type: 'blob', hash: blobHash }
    });
    return git.commitHash({
      treeHash,
      committer: this.committer,
      author: this.author
    });
  }

  // Brief: Returns Boolean as to whether the provided commit exists in the repository
  // Params: commitHash <string>
  // Returns: <Boolean>
  async hasCommit (commitHash) {
    return this.request('HEAD /repos/{owner}/{repo}/git/commits/{ref}', {
      ref: commitHash
    })
      .then(() => true)
      .catch((err) => {
        if (err.status == 404) {
          return false;
        } else {
          throw new Error(`GitHub API network error: ${err.status}`);
        }
      });
  }

  // Brief: Put provided bytes in ./value path of a deduplicated commit
  // Params: bytes <Uint8Array>
  // Returns: hex <string> commit hash
  // Ref: https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
  async commitBytes (bytes) {
    // First, check if the desired commit already exists using GitHub REST API
    const commitHash = await this.bytesToCommitHash(bytes);
    if (await this.hasCommit(commitHash)) return commitHash; // Hooray!

    // Undertake the expensive process of commit creation using authenticated GitHub API requests
    const blobHash = await this.request('POST /repos/{owner}/{repo}/git/blobs', {
      content: bytesToBase64(bytes),
      encoding: 'base64'
    }).then((response) => response.data.sha);

    const treeHash = await this.request('POST /repos/{owner}/{repo}/git/trees', {
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
    return await this.request('POST /repos/{owner}/{repo}/git/commits', {
      message: '',
      tree: treeHash,
      author: this.author,
      committer: this.committer
    }).then((response) => response.data.sha);
  }

  // Params: refUpdates <[<refUpdate>]>;  [] means array
  // Each <refUpdate> is an object, ! means required:
  //  { beforeOid: hex <string>, afterOid: hex <string> | 0, name: <string>! }
  // Ref: https://docs.github.com/en/graphql/reference/mutations#updaterefs
  async updateRefs ([...refUpdates]) {
    refUpdates.forEach((refUpdate) => {
      const { afterOid, name } = refUpdate;

      // If afterOid is falsy (undefined, null, false, or 0), format ref for deletion
      if (!afterOid) refUpdate.afterOid = '0000000000000000000000000000000000000000';

      // If name is not a fully qualified name, format ref as branch
      if (!name.startsWith('refs/')) refUpdate.name = `refs/heads/${name}`;

      // Enable force update. This makes the `beforeOid` property optional.
      refUpdate.force = true;
    });
    return this.graphql(
  `
    mutation($repositoryId: ID!, $refUpdates: [RefUpdate!]!) {
      updateRefs(input: { repositoryId: $repositoryId, refUpdates: $refUpdates }) {
        clientMutationId
      }
    }
  `,
  {
    repositoryId: this.id,
    refUpdates
  });
  }

  // Brief: Fetch target commit hash for given branch. Returns undefined, if branch doesn't exist.
  // Params: branch <string>
  // Returns: hex <string> | <undefined>
  // Note: Can be used unauthenticated
  async branchToCommitHash (branch) {
    return this.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
      ref: `heads/${branch}`
    })
      .then((response) => response.data.object.sha)
      .catch((err) => {
        if (err.status == 404) return;
        throw err;
      });
  }

  // Brief: Fetch bytes content for the given commit.
  // Params: commitHash <string>
  // Returns: bytes <Uint8Array> | undefined (if fails)
  async fetchCommitContent (commitHash) {
    // For private repositories fetch from GitHub REST API
    if (!this.isPublic) {
      return this.request('GET /repos/{owner}/{repo}/contents/{path}', {
        path: 'value',
        ref: commitHash
      })
        .then((response) => base64ToBytes(response.data.content));
    }

    // For public repositories fetch from a CDN. Tries multiple CDNs as fail-safe
    const user = this.owner;
    const repo = this.name;
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
  }

  // Brief: Returns CDN URLs for viewing content for the provided commit
  // Params: commitHash <string>
  cdnLinks (commitHash) {
    const cdnBaseUrl = `https://cdn.jsdelivr.net/gh/${this.owner}/${this.name}@${commitHash}`;
    return {
      'octet-stream': cdnBaseUrl + '/value',
      text: cdnBaseUrl + '/value.txt',
      json: cdnBaseUrl + '/value.json'
    };
  }
}
