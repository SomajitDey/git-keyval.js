// Brief: Exports default class Repository
// Usage: await Repository.instantiate({...}) returns a complete instance of the class

// Note: Using variables instead of template literals in GraphQL to avoid query injection attacks
// Ref: https://github.com/octokit/graphql.js/issues/2

import { request } from '@octokit/request';
import { withCustomRequest } from '@octokit/graphql';
import * as git from './git-hash.js';
import { bytesToBase64, base64ToBytes } from './conversions.js';
import { typesToCommitHash } from '../types.js';

export default class Repository {
  // Declaring properties to be initialized by constructor() or init()
  committer;
  author;
  owner;
  name;
  authenticated;
  request;
  graphql;
  id;
  isPublic;
  created;

  async encrypt (bytes) {
    return bytes;
  }

  async decrypt (bytes) {
    return bytes;
  }

  encrypted = false;

  // Await this static method to get a class instance
  // Params: Same as that of constructor() below
  static async instantiate (obj) {
    const instance = new Repository(obj);
    await instance.init();
    return instance;
  }

  constructor ({ owner, repo, auth, encrypt, decrypt, committer, author }) {
    this.owner = owner;
    this.name = repo;
    this.authenticated = Boolean(auth);
    if (encrypt) this.encrypt = encrypt;
    if (decrypt) this.decrypt = decrypt;
    if (encrypt || decrypt) this.encrypted = true;
    this.committer = committer ?? {
      // Name and email uses the same letter(s) for better compression
      name: 'a a',
      email: 'a@a.a',
      date: '2025-01-01T00:00:00Z'
    };
    this.author = author ?? this.committer;

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
    const { node_id, visibility, created_at } = await this.request('GET /repos/{owner}/{repo}')
      .then((response) => response.data);

    this.id = node_id;
    this.isPublic = visibility === 'public';
    this.created = new Date(created_at).getTime();
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
        if (err.status === 404) {
          return false;
        } else {
          throw new Error(`GitHub API network error: ${err.status}`);
        }
      });
  }

  // Brief: Put provided bytes in a git-commit and push to upstream repo.
  // Note: Defaults for the options are selected to make the commit deduplicated and reproducible.
  // Params: bytes <Uint8Array>
  // Params: optional, { message: <String> }, commit message, if any
  // Params: optional, { encrypt: <Boolean> }, to disable encryption on a case-by-case basis
  // Returns: hex <string> commit hash
  // Ref: https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents
  async commitBytes (bytes, {
    message = '',
    encrypt = this.encrypted,
    paths = ['bytes'],
    author = this.author,
    committer = this.committer,
    parentCommitHashes = [],
    push = 'true'
  } = {}
  ) {
    // First, check if the desired commit already exists using GitHub REST API
    // To that aim, derive the commitHash without actually committing anything!
    const cipher = encrypt ? await this.encrypt(bytes) : bytes;
    const blobHash = await git.blobHash(cipher);

    // Prep the following inputs
    const treeObject = {}; // Required as input to ./utils/git-hash.js => treeHash()
    const treeArray = []; //  Required as input to github REST API for git-trees
    for (const path of paths) {
      treeObject[path] = { type: 'blob', hash: blobHash };
      treeArray.push({
        path,
        type: 'blob',
        mode: '100644',
        sha: blobHash
      });
    }

    const treeHash = await git.treeHash(treeObject);
    const commitHash = await git.commitHash({
      treeHash,
      message,
      committer,
      author,
      parentCommitHashes
    });
    // Return the computed hash either if push isn't required or repo already has the commit
    if (!push || await this.hasCommit(commitHash)) return commitHash;

    // Undertake the expensive process of commit creation using authenticated GitHub API requests
    const content = bytesToBase64(cipher);

    // Push blob object to repo
    await this.request('POST /repos/{owner}/{repo}/git/blobs', {
      content,
      encoding: 'base64'
    });

    // Push tree object to repo
    await this.request('POST /repos/{owner}/{repo}/git/trees', {
      tree: treeArray
    });

    // Push commit object to repo
    return await this.request('POST /repos/{owner}/{repo}/git/commits', {
      message,
      tree: treeHash,
      author,
      committer,
      parents: parentCommitHashes
    }).then((response) => response.data.sha);
  }

  // Brief: Equivalent to CLI: git push --atomic --force-with-lease <name>:<beforeOid> origin +<afterOid>:<name>
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
        if (err.status === 404) return;
        throw err;
      });
  }

  // Brief: Fetch bytes content for the given blob.
  // Params: blobHash <string>
  // Params: optional, { decrypt: <Boolean> }, to disable encryption on a case-by-case basis
  // Returns: bytes <Uint8Array> | undefined (if fails)
  async fetchBlobContent (blobHash, { decrypt = this.encrypted } = {}) {
    return this.request('GET /repos/{owner}/{repo}/git/blobs/{blobHash}', {
      blobHash
    })
      .then((response) => base64ToBytes(response.data.content))
      .catch((err) => {
        if (err.status === 404) return;
        throw err;
      })
      .then((bytes) => {
        if (decrypt) return this.decrypt(bytes);
        return bytes;
      });
  }

  // Brief: Fetch bytes content for the given commit.
  // Params: commitHash <string>
  // Params: optional, { decrypt: <Boolean> }, to disable encryption on a case-by-case basis
  // Returns: bytes <Uint8Array> | undefined (if fails)
  async fetchCommitContent (commitHash, { decrypt = this.encrypted, path = 'bytes' } = {}) {
    // For private repositories fetch from GitHub REST API
    // REST API for repo contents gives anomalous base64 encoding for arbitrary bytes content.
    // Instead, therefore, we take the blob hash from the API for repo contents.
    // Using REST API for blobs subsequently, gives the correct base64 encoding of content.
    if (!this.isPublic) {
      return this.request('GET /repos/{owner}/{repo}/contents/{path}', {
        path,
        ref: commitHash
      })
        .then((response) => response.data.sha)
        .catch((err) => {
          if (err.status === 404) return;
          throw err;
        })
        .then((blobHash) => this.fetchBlobContent(blobHash, { decrypt }));
    }

    // For public repositories fetch from a CDN. Tries multiple CDNs as fail-safe
    for (const url of this.cdnLinks(commitHash, path)) {
      try {
        const bytes = await fetch(url, { redirect: 'follow' })
          .then((response) => {
            if (!response.ok) throw new Error(response.status);
            return response.bytes();
          });
        if (decrypt) return this.decrypt(bytes);
        return bytes; // Error handler below is designed to skip this step in case of error
      } catch (err) {
        if (err.message === '404') {
        // If 404 for one CDN, no use trying other CDNs as commit might not exist in GitHub origin
          return;
        } else {
          continue; // Try other CDNs in case current CDN is down
        }
      }
    }
    // Would never reach the following if any CDN worked in the above loop
    throw new Error('Unexpected failure with CDNs');
  }

  // Params: commitHash <string>
  // Returns: <String> | undefined, if commit doesn't exist
  async fetchCommitMessage (commitHash) {
    return this.request('HEAD /repos/{owner}/{repo}/git/commits/{ref}', {
      ref: commitHash
    })
      .then((response) => response.data.message)
      .catch((err) => {
        if (err.status !== 404) throw err;
      });
  }

  // Brief: Returns CDN URLs for viewing content for the provided commit
  // Params: commitHash <string>
  cdnLinks (commitHash, path = 'bytes') {
    if (typeof path !== 'string' || path.startsWith('./')) {
      throw new Error(
        'Pass proper path parameter'
      );
    }
    // CDN doesn't exist for private repos
    if (!this.isPublic) return;
    const user = this.owner;
    const repo = this.name;
    return [
    `https://cdn.jsdelivr.net/gh/${user}/${repo}@${commitHash}/${path}`,
    `https://cdn.statically.io/gh/${user}/${repo}/${commitHash}/${path}`,
    `https://rawcdn.githack.com/${user}/${repo}/${commitHash}/${path}`,
    `https://raw.githubusercontents.com/${user}/${repo}/${commitHash}/${path}`
    ];
  }
}
