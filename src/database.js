// Brief: Key-Value Database hosted as a GitHub Repo

import * as types from './types.js';
import * as x from './expiry.js';
import Ambimap from './utils/ambimap.js';
import Repository from './utils/github.js';
import { hexToBase64Url, base64ToHex } from './utils/conversions.js';

const defaultPaths = ['bytes', 'view.txt', 'view.json'];

const typesToCommitHash = new Ambimap();
const commitHashToTypes = typesToCommitHash.inv;

function encodeCommitMsg ({ mimeType, extension } = {}) {
  if (mimeType && extension) {
    return `${mimeType};extension=${extension}`;
  } else {
    return mimeType ?? '';
  }
}

function decodeCommitMsg (message) {
  if (!message) return {};
  const [mimeType, rest] = message.split(';');
  const extension = rest?.split('=').pop();
  return { mimeType, extension };
}

export default class Database {
  repository;

  async commitTyped (input, { encrypt, push } = {}) {
    if (input === undefined) return {};
    const { type, mimeType, bytes, extension } = await types.typedToBytes(input);
    const paths = [...defaultPaths];
    if (mimeType && extension) paths.push(`view.${extension}`);
    // If extension is undefined, but mimeType exists, `paths` is same as `defaultPaths`.
    // Ensures git-tree object reuse between commits that differ only in commit-message(s).
    const message = encodeCommitMsg({ mimeType, extension });
    const commitHash = await this.repository.commitBytes(bytes, { message, paths, encrypt, push });
    let cdnLinks;
    if (extension) cdnLinks = this.repository.cdnLinks(commitHash, `view.${extension}`);
    return { commitHash, type, cdnLinks };
  }

  async init () {
    const refUpdates = [];
    for (const type of types.types) {
      const { commitHash } = await this.commitTyped(type, { encrypt: false });
      refUpdates.push({ afterOid: commitHash, name: `refs/tags/kv/types/${type}` });
    }
    await this.repository.updateRefs(refUpdates);
  }

  // Await this static method to get a class instance
  // Params: Same as that of Repository.constructor() in ./github.js
  static async instantiate (obj) {
    const repository = await Repository.instantiate(obj);
    const instance = new Database(repository);
    if (typesToCommitHash.size === 0) {
      for (const type of types.types) {
        const { commitHash } = await instance.commitTyped(type, { encrypt: false, push: false });
        typesToCommitHash.set(type, commitHash);
      }
    }
    return instance;
  }

  // Params: repository <Repository>, instance of the Repository class exported by ./utils/github.js
  constructor (repository) {
    this.repository = repository;
  }

  async keyToUuid (key, { push = false } = {}) {
    const { commitHash, type } = await this.commitTyped(key, { push });
    return { uuid: `${type}/${hexToBase64Url(commitHash)}`, type, commitHash };
  }

  async uuidToKey (uuid) {
    const [type, base64CommitHash] = uuid.split('/');
    const commitHash = base64ToHex(base64CommitHash);
    const [bytes, commitMsg] = await Promise.all([
      this.repository.fetchCommitContent(commitHash),
      type === 'Blob' ? this.repository.fetchCommitMessage(commitHash) : ''
    ]);
    const { mimeType } = decodeCommitMsg(commitMsg);
    return types.bytesToTyped({ type, mimeType, bytes });
  }

  //Note: For val = undefined, create() with overwrite is equivalent to delete()
  async create (key, val, { overwrite = false, ttl } = {}) {
    if (val === undefined) {
      if (overwrite) {
        await this.delete(key);
      } else {
        if (await this.has(key)) throw new Error('Key exists');
      }
      return {};
    } 

    const expiryId = ttl !== undefined ? x.dateToId(x.getExpiry(ttl)) : undefined;
    // Using Promise.all to parallelize network IO
    const [
      { uuid, commitHash: keyCommitHash },
      { commitHash: valBytesCommitHash, type: valType, cdnLinks },
      { commitHash: expiryCommitHash }
    ] = await Promise.all([
      this.keyToUuid(key, { push: true }),
      this.commitTyped(val),
      this.commitTyped(expiryId, { encrypt: false })
      // Not encrypting expiryId allows it to be read as text using GraphQL in #read()
    ]);
    const existingKeyCommitHash = overwrite ? undefined : '0000000000000000000000000000000000000000';
    try {
      await this.repository.updateRefs([
        { beforeOid: existingKeyCommitHash, afterOid: keyCommitHash, name: `refs/tags/kv/${uuid}` },
        { afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { afterOid: typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` },
        { afterOid: expiryCommitHash, name: `kv/${uuid}/expiry` }
      ]);
      return { uuid, cdnLinks };
    } catch (err) {
      if (!overwrite && await this.has(key)) throw new Error('Key exists');
      if (await this.repository.hasCommit(typesToCommitHash.get(valType)) === false) {
        throw new Error('Database not initialized. Run db.init()');
      }
      throw err;
    }
  }

  async has (key) {
    const { uuid } = await this.keyToUuid(key);
    return this.repository.hasRef(`refs/tags/kv/${uuid}`);
    // TODO: Also check for stale keys, that haven't been garbage-collected (GC) yet
  }

  // Returns: <object>
  async #read (key) {
    const { uuid, commitHash: keyCommitHash } = await this.keyToUuid(key);
    const bytesBranch = `kv/${uuid}/value/bytes`;
    const typeBranch = `kv/${uuid}/value/type`;
    const expiryBranch = `kv/${uuid}/expiry`;

    let valBytesCommitHash, valBytesCommitMessage, valBytesBlobHash, valTypeCommitHash;
    let expiryCommitHash, expiryId;
    if (this.repository.authenticated) {
      // GraphQL consumes only one ratelimit point for all the following queries!
      // Not encrypting expiryId allows it to be read as text using GraphQL!
      const { bytes, type, expiry } = await this.repository.graphql(
        `
          query($id: ID!, $bytesBranch: String!, $typeBranch: String!, $expiryBranch: String!, $path: String!) {
            node(id: $id) {
              ... on Repository {
                bytes: ref(qualifiedName: $bytesBranch) {
                  target {
                    oid
                    ... on Commit {
                      message
                      file(path: $path){
                        oid
                      }
                    }
                  }
                }
                type:ref(qualifiedName: $typeBranch) {
                  target {
                    oid
                  }
                }
                expiry:ref(qualifiedName: $expiryBranch) {
                  target {
                    oid
                    ... on Commit {
                      file(path: $path){
                        object {
                          ... on Blob {
                            text
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        {
          id: this.repository.id,
          bytesBranch: `refs/heads/${bytesBranch}`,
          typeBranch: `refs/heads/${typeBranch}`,
          expiryBranch: `refs/heads/${expiryBranch}`,
          path: 'bytes'
        }
      )
        .then((response) => response.node);

      valBytesCommitHash = bytes?.target?.oid;
      valBytesCommitMessage = bytes?.target?.message;
      valBytesBlobHash = bytes?.target?.file?.oid;
      valTypeCommitHash = type?.target?.oid;
      expiryId = expiry?.target?.file?.object?.text;
    } else {
      [valBytesCommitHash, valTypeCommitHash, expiryCommitHash] = await Promise.all([
        this.repository.refToCommitHash(bytesBranch),
        this.repository.refToCommitHash(typeBranch),
        this.repository.refToCommitHash(expiryBranch)
      ]);
    }

    if (valBytesCommitHash === undefined) return { uuid };

    const valType = commitHashToTypes.get(valTypeCommitHash);
    if (valType === 'Blob' && valBytesCommitMessage === undefined) {
      valBytesCommitMessage = await this.repository.fetchCommitMessage(valBytesCommitHash);
    }
    const mimeType = valBytesCommitMessage ? valBytesCommitMessage.split(';')[0] : undefined;

    let valBytesPromise;
    // Compare fetchCommitContent() in ./github.js
    if (this.repository.isPublic) {
      // Use CDN to fetch
      valBytesPromise = this.repository.fetchCommitContent(valBytesCommitHash);
    } else {
      // Use GitHub REST API to fetch directly from the blob
      valBytesPromise = this.repository.fetchBlobContent(valBytesBlobHash);
    }

    if (expiryId === undefined && expiryCommitHash) {
      const expiryBytes = await this.repository.fetchCommitContent(expiryCommitHash, { decrypt: false });
      expiryId = types.bytesToTyped({
        bytes: expiryBytes,
        type: 'Number'
      });
    };
    if (x.isStale(expiryId)) return { uuid }; // Return undefined value for expired data

    return {
      uuid,
      keyCommitHash,
      value: types.bytesToTyped({
        bytes: await valBytesPromise,
        type: valType,
        mimeType
      }),
      valBytesCommitHash,
      expiryId,
      expiryCommitHash
    };
  }

  async read (key) {
    const { value } = await this.#read(key);
    return value;
  }

  // Brief: modifier(oldVal) => newVal. Deletes the key if newVal is undefined.
  //   No-op, i.e. doesn't update, if modifier throws error.
  // Params: modifier <function>, async or not
  // Returns: { oldValue, currentValue, cdnLinks } <object>
  // Note: keepTtl takes precedence over ttl, if both truthy
  async update (key, modifier, { keepTtl=false, ttl } = {}) {
    const expiryId = ttl !== undefined ? x.dateToId(x.getExpiry(ttl)) : undefined;
    const {
      uuid,
      keyCommitHash,
      value: oldVal,
      valBytesCommitHash: oldValBytesCommitHash,
      expiryCommitHash: oldExpiryCommitHash
    } = await this.#read(key);
    if (oldVal === undefined) throw new Error('Nothing to update. Use create method instead.');

    // If old value is an object, (null is also erroneously recognized as object) modifier() might
    // modify it in place. To return the old value as is, in that case, clone it.
    const oldValClone = typeof oldVal === 'object' && oldVal !== null ?
      structuredClone(oldVal) : oldVal;

    const val = await modifier(oldVal);

    const [
      { commitHash: valBytesCommitHash, type: valType, cdnLinks },
      { commitHash: newExpiryCommitHash }
    ] = await Promise.all([
      this.commitTyped(val),
      this.commitTyped(expiryId, { encrypt: false })
      // Not encrypting expiryId allows it to be read as text using GraphQL in #read()
    ]);
    
    let expiryCommitHash, newKeyCommitHash;
    if (valBytesCommitHash) {
      expiryCommitHash = keepTtl ? oldExpiryCommitHash : newExpiryCommitHash;
      newKeyCommitHash = keyCommitHash;
    }

    try {
      await this.repository.updateRefs([
        { beforeOid: oldValBytesCommitHash, afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { afterOid: typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` },
        { afterOid: expiryCommitHash, name: `kv/${uuid}/expiry` },
        { afterOid: newKeyCommitHash, name: `refs/tags/kv/${uuid}` }
      ]);

      return {
        uuid,
        oldValue: oldValClone,
        currentValue: val,
        cdnLinks
      };
    } catch (error) {
      throw new Error('Update failed', { cause: error });
    }
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

  async delete (...keys) {
    const input = [];
    for (const key of keys) {

      // This is a hack without which delete() fails often
      if (! await this.has(key)) continue;
      // Might be due to a bug in the GitHub APIs

      const { uuid } = await this.keyToUuid(key);
      input.push(
        { name: `kv/${uuid}/value/bytes` },
        { name: `kv/${uuid}/value/type` },
        { name: `kv/${uuid}/expiry` },
        { name: `refs/tags/kv/${uuid}` }
      );
    }
    await this.repository.updateRefs(input);
  }
}
