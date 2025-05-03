// Brief: Key-Value Database hosted as a GitHub Repo

import * as types from './types.js';
import Repository from './github.js';
import { hexToBase64Url, base64ToHex } from './utils/conversions.js';

export default class Database {
  repository;

  // Await this static method to get a class instance
  // Params: Same as that of Repository.constructor() in ./github.js
  static async instantiate (obj) {
    const repository = await Repository.instantiate(obj);
    return new Database(repository);
  }

  // Params: repository <Repository>, instance of the Repository class exported by ./github.js
  constructor (repository) {
    this.repository = repository;
  }

  async keyToUuid (key, { push = false } = {}) {
    const { type, bytes } = await types.typedToBytes(key);
    let commitHash;
    if (push) {
      commitHash = await this.repository.commitBytes(bytes);
    } else {
      commitHash = await this.repository.bytesToCommitHash(bytes);
    }
    return { uuid: `${type}/${hexToBase64Url(commitHash)}`, type, commitHash };
  }

  async create (key, val, { overwrite = false } = {}) {
    const { type: valType, bytes: valBytes } = await types.typedToBytes(val);
    // Using Promise.all to parallelize network IO
    const [
      { uuid, commitHash: keyCommitHash },
      valBytesCommitHash
    ] = await Promise.all([
      this.keyToUuid(key, { push: true }),
      this.repository.commitBytes(valBytes)
    ]);
    const beforeOid = overwrite ? undefined : '0000000000000000000000000000000000000000';
    await this.repository.updateRefs([
      { beforeOid, afterOid: keyCommitHash, name: `refs/tags/kv/${uuid}` },
      { afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
      { afterOid: types.typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` }
    ]).catch(async (err) => {
      if (!overwrite) {
        const { bytes: valBytesCommitHash } = await this.valCommitHash(key);
        if (valBytesCommitHash !== undefined) throw new Error('Key exists');
      }
      throw err;
    });
    return this.repository.cdnLinks(valBytesCommitHash);
  }

  async valCommitHash (key) {
    const { uuid } = await this.keyToUuid(key);
    const bytesBranch = `kv/${uuid}/value/bytes`;
    const typeBranch = `kv/${uuid}/value/type`;

    let valBytesCommitHash, valTypeCommitHash;

    if (this.repository.authenticated) {
      // GraphQL consumes only one ratelimit point for querying two branches!
      const { bytes, type } = await this.repository.graphql(
        `
          query($id: ID!, $bytesBranch: String!, $typeBranch: String!) {
            node(id: $id) {
              ... on Repository {
                bytes: ref(qualifiedName: $bytesBranch) {
                  target {
                    oid
                  }
                }
                type:ref(qualifiedName: $typeBranch) {
                  target {
                    oid
                  }
                }
              }
            }
          }
        `,
        {
          id: this.repository.id,
          bytesBranch: `refs/heads/${bytesBranch}`,
          typeBranch: `refs/heads/${typeBranch}`
        }
      )
        .then((response) => response.node);

      valBytesCommitHash = bytes?.target?.oid;
      valTypeCommitHash = type?.target?.oid;
    } else {
      [valBytesCommitHash, valTypeCommitHash] = await Promise.all([
        this.repository.branchToCommitHash(bytesBranch),
        this.repository.branchToCommitHash(typeBranch)
      ]);
    }

    return { bytes: valBytesCommitHash, type: valTypeCommitHash };
  }

  async read (key) {
    const { bytes: valBytesCommitHash, type: valTypeCommitHash } = await this.valCommitHash(key);
    if (valBytesCommitHash === undefined) return;
    const valBytes = await this.repository.fetchCommitContent(valBytesCommitHash);

    return types.bytesToTyped({
      bytes: valBytes,
      type: types.commitHashToTypes.get(valTypeCommitHash)
    });
  }

  async update (key, modifier) {

  }

  async delete ([...keys]) {
    const input = [];
    for (const key of keys) {
      const { uuid } = await this.keyToUuid(key);
      input.push({ name: `refs/tags/kv/${uuid}` });
      input.push({ name: `kv/${uuid}/value/bytes` });
      input.push({ name: `kv/${uuid}/value/type` });
    }
    return this.repository.updateRefs(input);
  }
}
