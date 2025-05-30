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

  // Note: undefined in undefined out
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

  // Note: For val = undefined, create() with overwrite is equivalent to delete()
  // Note: overwrite: true (key must pre-exist), false (key must not pre-exist), undefined (create key anyway)
  async create (key, val, { overwrite, ttl, oldValue } = {}) {
    let pushKey, existingKeyCommitHash;
    switch (overwrite) {
      case true:
        pushKey = false;
        break;
      case false:
        if (oldValue !== undefined) throw new Error('Cannot have oldValue when overwrite: false');
        existingKeyCommitHash = null;
        // Using fall-through to achieve default behavior
      default:
        pushKey = true;
    }
    
    let expiry, expiryId;
    if (ttl) {
      expiry = x.getExpiry(ttl);
      expiryId = x.dateToId(expiry);
    }

    // Using Promise.all to parallelize network IO
    let [
      { uuid, commitHash: keyCommitHash },
      { commitHash: valBytesCommitHash, type: valType, cdnLinks },
      { commitHash: expiryCommitHash },
      { commitHash: oldValBytesCommitHash, type: oldValType }
    ] = await Promise.all([
      this.keyToUuid(key, { push: pushKey }),
      this.commitTyped(val, { push: true }),
      this.commitTyped(expiryId, { push: true, encrypt: false }),
      // Not encrypting expiryId allows it to be read as text using GraphQL in #read()
      this.commitTyped(oldValue, { push: false })
    ]);
    
    // Prep for deletion if val === undefined
    if (valType === undefined) {
      keyCommitHash = null;
      expiryCommitHash = null;
    } else {
      if (overwrite === true) existingKeyCommitHash = keyCommitHash;
    }

    try {
      await this.repository.updateRefs([
        { beforeOid: existingKeyCommitHash, afterOid: keyCommitHash, name: `refs/tags/kv/${uuid}` },
        { beforeOid: oldValBytesCommitHash, afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { beforeOid: typesToCommitHash.get(oldValType), afterOid: typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` },
        { afterOid: expiryCommitHash, name: `kv/${uuid}/expiry` }
      ]);

      return { uuid, cdnLinks, expiry };
    } catch (err) {
      if (overwrite === false && await this.has(key) === true) throw new Error('Key exists');
      if (overwrite === true && await this.has(key) === false) throw new Error('Nothing to overwrite');
      if (valType && await this.repository.hasCommit(typesToCommitHash.get(valType)) === false) {
        throw new Error('Database not initialized. Run db.init()');
      }
      throw new Error('Failed', { cause: err });
    }
  }

  async has (key) {
    const { uuid } = await this.keyToUuid(key);
    return this.repository.hasRef(`refs/tags/kv/${uuid}`);
    // TODO: Also check for stale keys, that haven't been garbage-collected (GC) yet
  }

  // Returns: <object>
  async #read (key) {
    const { uuid } = await this.keyToUuid(key);
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

    if (valBytesCommitHash === undefined) return {};

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
    if (x.isStale(expiryId)) return {}; // Return undefined value for expired data

    return {
      value: types.bytesToTyped({
        bytes: await valBytesPromise,
        type: valType,
        mimeType
      }),
      expiry: expiryId ? x.idToDate(expiryId) : undefined
    };
  }

  async read (key) {
    const { value } = await this.#read(key);
    return value;
  }

  // Brief: modifier(oldValue) => newValue. Deletes the key if newValue is undefined.
  //   No-op, i.e. doesn't update, if modifier throws error.
  // Params: modifier <function>, async or not
  // Returns: { oldValue, currentValue, cdnLinks } <object>
  // Note: keepTtl takes precedence over ttl, if both truthy
  async update (key, modifier, { keepTtl=false, ttl } = {}) {
    const { value: oldValue, expiry: oldExpiry } = await this.#read(key);

    let newValue;
    try {
      // If old value is an object, modifier() might modify it in place.
      // To return the old value as is, clone it.
      // null is also recognized as object by JavaScript, so take that into account.
      if (typeof oldValue === 'object' && oldValue !== null) {
        newValue = await modifier(structuredClone(oldValue));
      } else {
        newValue = await modifier(oldValue);
      }
    } catch (err) {
      throw new Error('modifier() threw error. See "cause" for details.', { cause: err });
    }

    // Override the provided ttl, if any, in case keepTtl is opted for
    if (keepTtl) ttl = x.getTtlDays(oldExpiry);

    const obj = this.create(key, newValue, { overwrite: true, ttl, oldValue });
    return { ...obj, oldValue, newValue };
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

  // Note: If val is provided delete key only if key => val
  async delete (key, val = undefined) {
    return this.create(key, undefined, { oldValue: val });
  }
}
