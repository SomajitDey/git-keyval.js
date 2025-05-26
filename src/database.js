// Brief: Key-Value Database hosted as a GitHub Repo

import * as types from './types.js';
import Repository from './utils/github.js';
import { hexToBase64Url, base64ToHex } from './utils/conversions.js';

const defaultPaths = [ 'bytes', 'view.txt', 'view.json' ];

function encodeCommitMsg ({ mimeType, extension } = {}) {
  if (mimeType && extension) {
    return `${mimeType};extension=${extension}`;
  } else {
    return mimeType ?? '';
  }
}

function decodeCommitMsg (message) {
  if (!message) return {};
  const [ mimeType, rest ] = message.split(';');
  const extension = rest?.split('=').pop();
  return { mimeType, extension };
}

export default class Database {
  repository;

async commitTyped (input, { push = true }={}) {
  const { type, mimeType, bytes, extension } = await types.typedToBytes(input);
  const paths = [ ...defaultPaths ];
  if (mimeType && extension) paths.push(`view.${extension}`);
  const message = encodeCommitMsg({ mimeType, extension });
  const commitHash = await this.repository.commitBytes(bytes, { message, paths, push });
  const viewPath = extension ? `view.${extension}` : `bytes`;
  return { commitHash, type, viewPath };
}

  // Await this static method to get a class instance
  // Params: Same as that of Repository.constructor() in ./github.js
  static async instantiate (obj) {
    const repository = await Repository.instantiate(obj);
    await repository.request('GET /repos/{owner}/{repo}/git/ref/{ref}', {
        ref: 'tags/kv/types/ArrayBuffer'
      })
        .then((response) => {
          if (
            response.data.object.sha !== types.typesToCommitHash.get('ArrayBuffer')
          ) throw new Error('Mismatched');
        })
        .catch((err) => {
          if (err.status === 404 || err.message === 'Mismatched') { throw new Error('Run init workflow in the GitHub repo first!'); }
          throw err;
        })
    return new Database(repository);
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
    const [ bytes, commitMessage ] = await Promise.all([
      this.repository.fetchCommitContent(commitHash),
      type === 'Blob'? this.repository.fetchCommitMessage(commitHash) : ''
    ]);
    const { mimeType } = decodeCommitMsg(commitMessage);
    return types.bytesToTyped({ type, mimeType, bytes });
  }

  async create (key, val, { overwrite = false } = {}) {
    // Using Promise.all to parallelize network IO
    const [
      { uuid, commitHash: keyCommitHash },
      { commitHash: valBytesCommitHash, type: valType, viewPath: valViewPath }
    ] = await Promise.all([
      this.keyToUuid(key, { push: true }),
      this.commitTyped(val)
    ]);
    const beforeOid = overwrite ? undefined : '0000000000000000000000000000000000000000';
    try {
      await this.repository.updateRefs([
        { beforeOid, afterOid: keyCommitHash, name: `refs/tags/kv/${uuid}` },
        { afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
        { afterOid: types.typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` }
      ]);
      return { uuid, cdnLinks: this.repository.cdnLinks(valBytesCommitHash, valViewPath) };
    } catch (err) {
      if (!overwrite && await this.has(key)) throw new Error('Key exists');
      throw err;
    }
  }

  async has (key) {
    const { uuid } = await this.keyToUuid(key);
    const bytesBranch = `kv/${uuid}/value/bytes`;
    const valBytesCommitHash = await this.repository.branchToCommitHash(bytesBranch);
    return valBytesCommitHash !== undefined;
  }

  async read (key) {
    const { uuid } = await this.keyToUuid(key);
    const bytesBranch = `kv/${uuid}/value/bytes`;
    const typeBranch = `kv/${uuid}/value/type`;

    let valBytesCommitHash, valBytesCommitMessage, valBytesBlobHash, valTypeCommitHash;

    if (this.repository.authenticated) {
      // GraphQL consumes only one ratelimit point for all the following queries!
      const { bytes, type } = await this.repository.graphql(
        `
          query($id: ID!, $bytesBranch: String!, $typeBranch: String!, $path: String!) {
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
              }
            }
          }
        `,
        {
          id: this.repository.id,
          bytesBranch: `refs/heads/${bytesBranch}`,
          typeBranch: `refs/heads/${typeBranch}`,
          path: 'bytes'
        }
      )
        .then((response) => response.node);

      valBytesCommitHash = bytes?.target?.oid;
      valBytesCommitMessage = bytes?.target?.message;
      valBytesBlobHash =  bytes?.target?.file?.oid;
      valTypeCommitHash = type?.target?.oid;

    } else {
      [valBytesCommitHash, valTypeCommitHash] = await Promise.all([
        this.repository.branchToCommitHash(bytesBranch),
        this.repository.branchToCommitHash(typeBranch)
      ]);
    }

    if (valBytesCommitHash === undefined) return;

    const valType = types.commitHashToTypes.get(valTypeCommitHash);
    if (valType === 'Blob' && valBytesCommitMessage === undefined) {
      valBytesCommitMessage = await this.repository.fetchCommitMessage(valBytesCommitHash);
    }
    const mimeType = valBytesCommitMessage ? valBytesCommitMessage.split(';')[0] : undefined;

    let valBytes;
    // Compare fetchCommitContent() in ./github.js
    if (this.repository.isPublic) {
      // Use CDN to fetch
      valBytes = await this.repository.fetchCommitContent(valBytesCommitHash);
    } else {
      // Use GitHub REST API to fetch directly from the blob
      valBytes = await this.repository.fetchBlobContent(valBytesBlobHash);
    }

    return types.bytesToTyped({
      bytes: valBytes,
      type: valType,
      mimeType
    });
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
    return this.repository.updateRefs([
      { beforeOid: oldValBytesCommitHash, afterOid: valBytesCommitHash, name: `kv/${uuid}/value/bytes` },
      { afterOid: types.typesToCommitHash.get(valType), name: `kv/${uuid}/value/type` }
    ]).catch((err) => {
        new Error('Update failed');
      });

    return {
          oldValue: oldValClone,
          currentValue: val,
          cdnLinks: this.repository.cdnLinks(valBytesCommitHash, valViewPath)
        };
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
