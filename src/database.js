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
    try {
      await this.repository.updateRefs([
        { beforeOid, afterOid: keyCommitHash, name: `refs/tags/kv/${uuid}` },
        { afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { afterOid: types.typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` }
      ]);
      return this.repository.cdnLinks(valBytesCommitHash);
    } catch (err) {
      if (!overwrite && await this.has(key)) throw new Error('Key exists');
      throw err;
    }
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

  async has (key) {
    const { bytes: valBytesCommitHash } = await this.valCommitHash(key);
    return valBytesCommitHash !== undefined;
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

  // Brief: modifier(oldVal) => newVal
  // Params: modifier <function>, async or not
  async update (key, modifier) {
    const oldVal = await this.read(key);
    const { commitHash: oldValBytesCommitHash } = await this.keyToUuid(oldVal);
    // modifier may have side-effects, like modifying the oldVal itself.
    // Hence, running modifier as the last function on oldVal, after keyToUuid(oldVal).
    const val = await modifier(oldVal);
    const { type: valType, bytes: valBytes } = await types.typedToBytes(val);
    const valBytesCommitHash = await this.repository.commitBytes(valBytes);
    const { uuid } = await this.keyToUuid(key);
    return this.repository.updateRefs([
      { beforeOid: oldValBytesCommitHash, afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
      { afterOid: types.typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` }
    ])
      .then(() => this.repository.cdnLinks(valBytesCommitHash))
      .catch((err) => {
        throw err;// new Error('Update failed');
      });
  }

  async increment (key, incr = 1) {
    const modifier = (num) => {
      if (types.getType(num) !== 'Number') throw new Error('Old value must be a Number');
      return num + incr;
    };

    return this.update(key, modifier);
  }

  async toggle (key) {
    const modifier = (bool) => {
      if (types.getType(bool) !== 'Boolean') throw new Error('Old value must be a Boolean');
      return !bool;
    };

    return this.update(key, modifier);
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
