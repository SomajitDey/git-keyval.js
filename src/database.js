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
    const viewPath = extension ? `view.${extension}` : 'bytes';
    return { commitHash, type, viewPath };
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

  async create (key, val, { overwrite = false, ttl } = {}) {
    const expiryId = ttl !== undefined ? x.dateToId(x.getExpiry(ttl)) : undefined;
    // Using Promise.all to parallelize network IO
    const [
      { uuid, commitHash: keyCommitHash },
      { commitHash: valBytesCommitHash, type: valType, viewPath: valViewPath },
      { commitHash: expiryCommitHash }
    ] = await Promise.all([
      this.keyToUuid(key, { push: true }),
      this.commitTyped(val),
      this.commitTyped(expiryId)
    ]);
    const existingKeyCommitHash = overwrite ? undefined : '0000000000000000000000000000000000000000';
    try {
      await this.repository.updateRefs([
        { beforeOid: existingKeyCommitHash, afterOid: keyCommitHash, name: `refs/tags/kv/${uuid}` },
        { afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { afterOid: typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` },
        { afterOid: expiryCommitHash, name: `kv/${uuid}/expiry` }
      ]);
      return { uuid, cdnLinks: this.repository.cdnLinks(valBytesCommitHash, valViewPath) };
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
    const bytesBranch = `kv/${uuid}/value/bytes`;
    const valBytesCommitHash = await this.repository.branchToCommitHash(bytesBranch);
    return valBytesCommitHash !== undefined;
  }

  // Returns: { value: , expiry:, ttl: }
  async #read (key) {
    const { uuid } = await this.keyToUuid(key);
    const bytesBranch = `kv/${uuid}/value/bytes`;
    const typeBranch = `kv/${uuid}/value/type`;
    const expiryBranch = `kv/${uuid}/expiry`;

    let valBytesCommitHash, valBytesCommitMessage, valBytesBlobHash, valTypeCommitHash, expiryCommitHash, expiryBlobHash;
let expiryId;
    if (this.repository.authenticated) {
      // GraphQL consumes only one ratelimit point for all the following queries!
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
        this.repository.branchToCommitHash(bytesBranch),
        this.repository.branchToCommitHash(typeBranch),
        this.repository.branchToCommitHash(expiryBranch)
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
      const expiryBytes = await this.repository.fetchCommitContent(expiryCommitHash);
      expiryId = types.bytesToTyped({
        bytes: expiryBytes,
        type: 'Number'
      });
    };
    const expiry = expiryId !== undefined ? x.idToDate(expiryId) : undefined;
    const ttl = expiry !== undefined? x.getTtlDays(expiry) : undefined;
    if (ttl === 0) return {}; // Return undefined for expired data

    return {
      value: types.bytesToTyped({
        bytes: await valBytesPromise,
        type: valType,
        mimeType
      }),
      ttl
    };
  }

  async read (key) {
    const { value } = await this.#read(key);
    return value;
  }

  // Brief: modifier(oldVal) => newVal
  // Params: modifier <function>, async or not
  // Returns: { oldValue, currentValue, cdnLinks } <object>
  async update (key, modifier) {
    const oldVal = await this.read(key);
    // Clone (deep copy) instead of returning (reference to) oldVal as
    //  modifier() might modify oldVal in place
    const oldValClone = structuredClone(oldVal);
    const [
      { commitHash: oldValBytesCommitHash },
      val
    ] = await Promise.all([
      this.keyToUuid(oldValClone),
      modifier(oldVal)
    ]);
    const { commitHash: valBytesCommitHash, type: valType, viewPath: valViewPath } = await this.commitTyped(val);
    const { uuid } = await this.keyToUuid(key);
    try {
      await this.repository.updateRefs([
        { beforeOid: oldValBytesCommitHash, afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { afterOid: typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` }
      ]);

      return {
        oldValue: oldValClone,
        currentValue: val,
        cdnLinks: this.repository.cdnLinks(valBytesCommitHash, valViewPath)
      };
    } catch (error) {
      if (await this.repository.hasCommit(typesToCommitHash.get(valType)) === false) {
        throw new Error('Database not initialized. Run db.init()');
      }
      throw new Error('Update failed');
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

  async delete ([...keys]) {
    const input = [];
    for (const key of keys) {
      const { uuid } = await this.keyToUuid(key);
      input.push({ name: `refs/tags/kv/${uuid}` });
      input.push({ name: `kv/${uuid}/value/bytes` });
      input.push({ name: `kv/${uuid}/value/type` });
      input.push({ name: `kv/${uuid}/expiry` });
    }
    return this.repository.updateRefs(input);
  }
}
