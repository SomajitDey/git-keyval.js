// Brief: Key-Value Database hosted as a GitHub Repo

import * as types from './types.js';
import * as x from './expiry.js';
import Ambimap from './utils/ambimap.js';
import Repository from './utils/github.js';
import { hexToBase64Url, base64ToHex } from './utils/conversions.js';
import { LRUCache } from 'lru-cache';

// Global in-memory cache to minimise ratelimited requests to GitHub APIs.
const cache = {};

// LRU cache to hold [commitHash, bytes] pairs
cache.bytes = new LRUCache({
  max: 500, // Maximum this many entries to be retained past which LRU eviction is triggered
  maxSize: 100000, // in bytes
  maxEntrySize: 500, // in bytes
  sizeCalculation: (bytes, commitHash) => bytes.length
});

// LRU cache to hold [commitHash, msg] pairs
cache.msg = new LRUCache({
  max: 10000
});

const defaultPaths = ['bytes', 'view.txt', 'view.json'];
const txtView = 'view.txt'; // Safer than `bytes` because it has plain/text extension.
// Using `bytes` breaks the esm.sh CDN link.

const typesToCommitHash = new Ambimap();
const commitHashToTypes = typesToCommitHash.inv;

// Brief: Get git-references for the given key-uuid.
// Param: uuid <string>
function getRefs (uuid) {
  // Designed such that listing these refs using `git` command or the GitHub REST API is performant.
  // Pattern is matched from the tail of the ref with: `git ls-remote --branches|--tags <pattern>`
  //   Therefore, better use a suffix instead of a prefix for glob-less (for performance) patterns
  // GitHub REST and GraphQL APIs, in contrast, only take a prefix to list the matching refs.
  // All the following refs thus have both a unique suffix (e.g. <uuid>/key) and
  //   a unique prefix (e.g. kv/keys) to cater to both git CLI and GitHub APIs respectively.
  // Both git CLI and GitHub API can be asked to limit search for matching refs to branches or tags.
  //   Therefore, keeping only the keys in tags to keep the tag space less populated and facilitate
  //   performance while listing all keys.
  // Also respecting Git semantics: branches represent dynamic references and tags, static.
  // Avoiding non-standard custom refs (i.e. refs/<custom>) for portability and future-proofing.

  // Ref name format: refs/heads|tags/kv/<type prefix>/<uuid>/<type suffix>
  return {
    bytes: `refs/heads/kv/values/${uuid}/bytes`,
    type: `refs/heads/kv/values/${uuid}/type`,
    expiry: `refs/heads/kv/expiries/${uuid}/dayID`,
    key: `refs/tags/kv/keys/${uuid}/key`
  };
}

// Brief: Inverse of getRefs(uuid)
function refToUuid (ref) {
  if (!ref.startsWith('refs/')) ref = 'refs/heads/' + ref;
  return ref.split('/').slice(4, -1).join('/');
}

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

  // Note: Returns expiry instead of ttl, as ttl is meaningful only w.r.t the exact time it is returned.
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
    const isEncrypted = encrypt ?? this.repository.encrypted;
    if (extension && isEncrypted === false) {
      cdnLinks = this.repository.cdnLinks(commitHash, `view.${extension}`);
    }
    return { commitHash, type, cdnLinks };
  }

  // Brief: Inverse of commitTyped().
  // Note: Makes extensive use of in-memory LRU-cache to minimize non-CDN fetches.
  async fetchTyped (commitHash, type, { decrypt, blobHash, commitMsg } = {}) {
    // undefined in undefined out
    if (commitHash === undefined) return;

    // Fetching bytes
    // Evoking async fetch as early as possible, storing the pending promise in a variable
    let bytesPromise;
    if (this.repository.isPublic) { // Fast and unlimited fetch from CDN
      // No point in caching the fetched data increasing footprint
      // Note: Browsers will already be using http-cache
      bytesPromise = this.repository.fetchCommitContent(commitHash, { decrypt, path: txtView });
    } else if (cache.bytes.has(commitHash)) { // Fastest, from local cache
      bytesPromise = cache.bytes.get(commitHash);
    } else if (blobHash) { // Economic, single ratelimited request to GitHub
      // Cache for future use.
      bytesPromise = this.repository.fetchBlobContent(blobHash, { decrypt })
        .then((bytes) => {
          cache.bytes.set(commitHash, bytes);
          return bytes;
        });
    } else { // Expensive, multiple ratelimited requests to GitHub
      // Cache for future use.
      bytesPromise = this.repository.fetchCommitContent(commitHash, { decrypt, path: txtView })
        .then((bytes) => {
          cache.bytes.set(commitHash, bytes);
          return bytes;
        });
    }

    // Obtain commit message from passed option or local cache. Fetch from GitHub otherwise.
    commitMsg = commitMsg ?? cache.msg.get(commitHash);
    if (type === 'Blob' && commitMsg === undefined) {
      commitMsg = await this.repository.fetchCommitMessage(commitHash)
        .then((msg) => {
          cache.msg.set(commitHash, msg);
          return msg;
        });
    }

    // Getting MIME-type
    const { mimeType } = decodeCommitMsg(commitMsg);

    return types.bytesToTyped({
      bytes: await bytesPromise,
      type,
      mimeType
    });
  }

  async init () {
    const refUpdates = [];
    for (const type of types.types) {
      const { commitHash } = await this.commitTyped(type, { encrypt: false });
      refUpdates.push({ afterOid: commitHash, name: `refs/tags/kv/types/${type}/type` });
      // In `name` using 'type' suffix alongwith 'kv/types' prefix. See comments for getRefs() above.
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
    return this.fetchTyped(commitHash, type);
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
    if (Number.isFinite(ttl)) {
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
      // Not encrypting expiryId allows it to be read as text using GraphQL in read()
      this.commitTyped(oldValue, { push: false })
    ]);

    // Prep for deletion if val === undefined
    if (val === undefined) {
      keyCommitHash = null;
      expiryCommitHash = null;
    } else {
      if (overwrite === true) existingKeyCommitHash = keyCommitHash;
    }

    const refs = getRefs(uuid);
    try {
      await this.repository.updateRefs([
        { beforeOid: existingKeyCommitHash, afterOid: keyCommitHash, name: refs.key },
        { beforeOid: oldValBytesCommitHash, afterOid: valBytesCommitHash, name: refs.bytes },
        { beforeOid: typesToCommitHash.get(oldValType), afterOid: typesToCommitHash.get(valType), name: refs.type },
        { afterOid: expiryCommitHash, name: refs.expiry }
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

  // Note: Also returns true for stale keys that haven't been garbage-collected yet. Needed for testing GC.
  async has (key) {
    const { uuid } = await this.keyToUuid(key);
    return this.repository.hasRef(getRefs(uuid).key);
  }

  // Returns: <object>
  async read (key) {
    const { uuid } = await this.keyToUuid(key);
    const refs = getRefs(uuid);
    const bytesRef = refs.bytes;
    const typeRef = refs.type;
    const expiryRef = refs.expiry;

    let valBytesCommitHash, valBytesCommitMessage, valBytesBlobHash, valTypeCommitHash;
    let expiryCommitHash, expiryId;
    if (this.repository.authenticated) {
      // GraphQL consumes only one ratelimit point for all the following queries!
      // Not encrypting expiryId allows it to be read as text using GraphQL!
      const { bytes, type, expiry } = await this.repository.graphql(
        `
          query($id: ID!, $bytesRef: String!, $typeRef: String!, $expiryRef: String!, $path: String!) {
            node(id: $id) {
              ... on Repository {
                bytes: ref(qualifiedName: $bytesRef) {
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
                type:ref(qualifiedName: $typeRef) {
                  target {
                    oid
                  }
                }
                expiry:ref(qualifiedName: $expiryRef) {
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
          bytesRef,
          typeRef,
          expiryRef,
          path: txtView
        }
      )
        .then((response) => response.node);

      valBytesCommitHash = bytes?.target?.oid;
      valBytesCommitMessage = bytes?.target?.message;
      valBytesBlobHash = bytes?.target?.file?.oid;
      valTypeCommitHash = type?.target?.oid;
      expiryId = Number(expiry?.target?.file?.object?.text);
    } else {
      [valBytesCommitHash, valTypeCommitHash, expiryCommitHash] = await Promise.all([
        this.repository.refToCommitHash(bytesRef),
        this.repository.refToCommitHash(typeRef),
        this.repository.refToCommitHash(expiryRef)
      ]);
    }

    const valPromise = this.fetchTyped(
      valBytesCommitHash,
      commitHashToTypes.get(valTypeCommitHash),
      {
        blobHash: valBytesBlobHash,
        commitMsg: valBytesCommitMessage
      }
    );

    expiryId = expiryId ?? await this.fetchTyped(expiryCommitHash, 'Number', { decrypt: false });
    if (x.isStale(expiryId)) return {}; // Return undefined value for expired data

    return {
      value: await valPromise,
      expiry: expiryId ? x.idToDate(expiryId) : undefined
    };
  }

  // Brief: modifier(oldValue) => newValue. Deletes the key if newValue is undefined.
  //   No-op, i.e. doesn't update, if modifier throws error.
  // Params: modifier <function>, async or not
  // Returns: { oldValue, currentValue, cdnLinks } <object>
  // Note: keepTtl takes precedence over ttl, if both truthy
  async update (key, modifier, { keepTtl = false, ttl } = {}) {
    const { value: oldValue, expiry: oldExpiry } = await this.read(key);

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

  async expire (key, ttl) {
    const expiryId = x.dateToId(x.getExpiry(ttl));

    const [{ uuid, commitHash: keyCommitHash }, { commitHash: expiryCommitHash }] = await Promise.all([
      this.keyToUuid(key),
      this.commitTyped(expiryId, { push: true, encrypt: false })
    ]);

    const refs = getRefs(uuid);
    try {
      await this.repository.updateRefs([
        { beforeOid: keyCommitHash, afterOid: keyCommitHash, name: refs.key },
        { afterOid: expiryCommitHash, name: refs.expiry }
      ]);
    } catch (err) {
      if (await this.has(key) === false) throw new Error('Nothing to expire');
      throw new Error('Failed', { cause: err });
    }
  }

  // Brief: Delete all refs related to the given UUIDs atomically at once.
  // Params: uuids <array or iterator>
  async deleteUUIDs (uuids) {
    const refUpdates = [];
    for (const uuid of uuids) {
      const refs = Object.values(getRefs(uuid)); // Array of all refs for the given UUID
      refs.forEach((ref) => {
        refUpdates.push({ name: ref, afterOid: null });
      });
    }
    return this.repository.updateRefs(refUpdates);
  }

  // Brief: Garbage Collection
  // Param: now <Date>, optional. If passed, consider the given time as now.
  // Param: Options.batchSize <integer>, max no. of UUIDs to be deleted atomically in a single batch.
  // Returns: <integer>, number of stale keys removed
  async gc (now = new Date(), { batchSize = 10 } = {}) {
    const { commitHash: expiryCommitHash } = await this.commitTyped(x.yesterdayId(now), {
      encrypt: false,
      push: false
    });

    if (!await this.repository.hasCommit(expiryCommitHash)) return 0;

    const expiryRefs = await this.repository.listBranchesTo(expiryCommitHash);

    // Deleting too many refs at once may fail.
    // Hence deleting small batches atomically at once, and multiple batches in parallel.
    const promises = [];
    for (let i = 0; i < expiryRefs.length; i += batchSize) {
      promises.push(
        this.deleteUUIDs(
          expiryRefs.slice(i, i + batchSize)
            .map((ref) => refToUuid(ref))
        )
      );
    }
    await Promise.all(promises);
    return expiryRefs.length;
  }
}
