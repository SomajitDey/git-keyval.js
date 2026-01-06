# Git-KeyVal (v1.0.0)
A Git-native protocol for a content-addressed key–value store that uses atomic `ref` updates for consistency and CDN-cached immutable objects for scalable reads, without requiring local clones or Git-as-a-Service APIs.

## Audience
This protocol is meant for only those users who 
- can afford infrequent high-latency writes with optimistic concurrency control
- need frequent, high-volume, fast, cheap reads
- preferably, reuse both keys and values
- do not mind reusing ciphers encrypted with a repo-scoped salt (prevents only cross-repo correlation)
- rarely, if at all, need to list all key-value pairs

## Non-Goals
- low-latency, high-volume writes such as required by ratelimiters or counters
- version control / logging of all writes
- handling data meant for single use only, e.g. nonces, single-download-files

## Fair Use Policy
Users, if not self-hosting, may use their personal repositories hosted by various Git-as-a-Service providers (e.g. GitHub, GitLab, BitBucket) as the KV store. For reads, also, they may use public CDNs (e.g. jsDelivr, statically, raw.githack). 

    Using this protocol implies that the user agrees not to abuse the public GaaS/CDN infra (such as with excessive `ref` churns, frequent cache-misses, disputed/illegal content) and to stay within the (soft-) limits specified in the respective Terms of Service or Usage Policies of those services.
  
## Core Features
- Provider-agnostic; works with any Git server implementing Git's smart HTTP protocol (v2 or newer)
- Key expiry (even if with a bounded TTL)
- Support for native data types (e.g. JSON, strings, ArrayBuffer etc. for JavaScript implementations)
- Optional encryption with custom encryption-decryption methods (codec) provided by the user, along with a built-in codec for accessibility
- Custom blob-retrieval method, including self-hosted CDNs

## Specifications
In the following, JavaScript (JS) is used as the reference implementation.

### Object Model (v1.0.0)
    Object Model (OM) is versioned independently of the Protocol
Single logical object (data + metadata) must be retrievable from a deduplicated, self-contained Git commit. 
- Data refers to the raw bytes of encrypted cipher (if user provides codec) or plaintext (default). This is stored as a reusable Git blob.
- Metadata is stored as a sorted and minified JSON in another reusable Git blob. It is formatted as
```JSON
{
    "omVersion": <OM version>,
    "implementation": <string>,
    "type": {
        "name": <string>,
        ...
    },
    "dataPaths": [
        "raw",
        ...
    ],
    "encrypted": <boolean>
}
```
For example, metadata for a `Blob`-type in JS:
```JSON
{
    "omVersion": "1.0.0",
    "implementation": "JS",
    "type": {
        "name": "Blob",
        "mimeType": "image/jpeg"
    },
    "dataPaths": [
        "raw",
        "data.jpeg"
    ],
    "encrypted": false
}
```
    For any given implementation, the set of possible metadata blobs MUST be finite or otherwise bounded, and is therefore suitable for permanent caching.
- Data and metadata are packed inside a Git tree containing only the following paths
    - `package.json` => metadata-blob
    - `raw` => data-blob
    - Any custom pathname listed in `dataPaths` key in metadata => data-blob
- This tree is enveloped in a root Git commit that
    - contains only this tree
    - has no parents, hence root
    - has invariant committer, author and commit message
    ```JSON
    {
        "author-committer" : {
            "name": "Git KeyVal",
            "email": "kv@git",
            "timestamp": "2025-01-01T00:00:00Z"
        },
        "commit-message": {
            "omVersion": <OM Version>, 
            "size": <number of bytes in data blob>,
            "dataOid": <hex OID of data blob>,
            "metaOid": <hex OID of metadata blob>
        }
    }
    ```
    **Note:** Commit message is stringified from the above JSON after minification and sorting by its keys.

### Key-Value Mapping
- Key object is identified with its commit OID (`keyOid`)
- Value object is identified with its commit OID (`valOid`)
- A Git ref derived from `keyOid` points to `valOid`
```JSON
{
    "refs/kv/<keyOid_shard>/kv-<keyOid_trail>": <valOid>
}
```
    - keyOid and valOid must be encoded as lowercase hexadecimal
    - keyOid_shard is derived from the N leading hex characters of keyOid
    - Shard-length (N) may be repo-scoped

For example, for
- keyOid: `4a8f050a786cc81c4682a902720db6376d0709c6`
- valOid: `ea3011a26435f23031e0c81ed34a143aed732575`
- shard-length: `2`

the corresponding ref is
```JSON
{
    "refs/kv/4a/kv-8f050a786cc81c4682a902720db6376d0709c6": "ea3011a26435f23031e0c81ed34a143aed732575"
}
```

### Key-Expiry Mapping
- A key can either be persistent or have an expiry
- TTL granularity is intentionally limited to days, along with a bounded maximum TTL (implementation dependent), to keep active expiry metadata small, deduplicable, and CDN-cacheable
- The following elucidates the computation of `expiryWindow` and `expiryIndex` for a given expiry (`expireAt`), the invariant timestamp used by all logical object commits in the repository (`commitAt`), and number of windows (`M`, implementation dependent)
```
Let Δ = expireAt − commitAt   (both in days since Unix Epoch)

expiryWindow = Δ mod M
expiryIndex  = floor(Δ / M)

Reconstruction:
expireAt = commitAt + expiryIndex * M + expiryWindow
```
- `expiryIndex` and `expiryWindow` are stored as standard logical objects of type `Number` or `Integer` or `String` (implementation dependent) with a deduplicated commit OID.
- With `commitAt = 01-01-2026`, selecting `M = 250` and capping `expiryIndex` at ~1000 allows expiries up to ~250,000 days (~686 years) in the future, which is more than sufficient for practical TTLs.
- A Git ref derived from `keyOid` points to `expiryWindowOid`
```JSON
{
    "refs/kv/<keyOid_shard>/kx-<keyOid_trail>": <expiryWindowOid>
}
```
- A Git ref prefixed with `expiryWindowOid` and otherwise derived from `keyOid` points to `expiryIndexOid`
```JSON
{
    "refs/kv/<keyOid_shard>/exp-<expiryWindowOid>-<keyOid_trail>": <expiryIndexOid>
}
```
- **Stale key removal:** Implementations may perform a lazy, daily scan of refs grouped or prefixed by the current day’s `expiryWindowOid`. In addition, implementations may randomly select one or more other `expiryWindowOid` values for scanning, in order to tolerate missed or delayed scans. Keys whose reconstructed `expiryAt` is less than or equal to the current day may have their key–value and expiry refs deleted.
- Persistent keys do not have any expiry refs.

### Key Retention
To support key retrieval (such as during key–value listing), implementations may create a Git ref derived from `keyOid` that points to `keyOid`, thereby keeping the key object reachable and preventing garbage collection.
```JSON
{
    "refs/kv/<keyOid_shard>/key-<keyOid_trail>": <keyOid>
}
```

### Atomic Writes with Optimistic Concurrency Control
- All writes are atomic
- Implementations must provide methods for both conditional and unconditional writes with the following schema (illustrative only):
```JS
function write (
    [
        {
            key: <required>,
            newValue: <optional>,
            oldValue: <optional>,
            overwrite: <optional boolean>,
            ttl: <optional non-negative integer>
        },
        ...
    ]
) {

}
```
- This schema allows users to pack multiple key updates in a single atomic transaction
- If `oldValue` is provided, `overwrite` is ignored
- If the key does not exist and `overwrite: true` or `oldValue` is present, it would not be created
- If `ttl` is absent, the write operation keeps the existing expiry, if any, unchanged
- If `ttl` is 0, key is made persistent
- If the key does not yet exist and `ttl` is absent, the key is created without an expiry
- If no `newValue` is provided, key is deleted
- If any conditional check fails, the entire write operation is aborted with no observable side-effects
- The actual writes to the Git server are achieved internally using Git `receive-pack` requests with `atomic` capability. The Git CLI equivalent is 
```bash
git push --atomic \
 --force-with-lease=<kv-ref>:<oldValOid> \
 <newValOid>:<kv-ref> \
 <expiryWindowOid>:<kx-ref> \
 <expiryIndexOid>:<exp-ref>
```
- If a user-provided codec is supplied, the `newValue` must be encrypted before being written to any Git object
- In this case, the corresponding metadata object MUST include `encrypted: true`
- If no codec is supplied, `newValue` must be stored in plaintext, and metadata must include `encrypted: false`.

### Reads
- Reading a value is performed in the following steps
    1. Resolution of the `kv`-prefixed ref derived from the `keyOid` (itself derived from the logical key). This yields `valueOid`. Resolution is performed using Git's smart HTTP protocol v2 via the `ls-refs` command with the appropriate prefix(es).
    2. Retrieve the corresponding object (data + metadata) using a CDN or a user-provided custom retrieval method, based on `valueOid`.
    3. If the retrieved metadata indicates `encrypted: true`, decrypt the data using the user-provided codec.
- Reading an expiry is also done in three steps
    1. Resolve the `kx`-prefixed ref derived from the `keyOid`, yielding `expiryWindowOid`, using `ls-refs` over Git's smart HTTP protocol v2.
    2. Resolve the `exp-<expiryWindowOid>`-prefixed ref derived from the same `keyOid`, yielding `expiryIndexOid`, again using `ls-refs`.
    3. Retrieve the integer values represented by the commits `expiryWindowOid` and `expiryIndexOid`, preferably from a local cache. On cache miss, retrieve them from a CDN or via a user-provided custom method, and reconstruct `expiryAt`.
- If CDN-based or user-provided retrieval methods fail, implementations may retrieve objects directly from the Git server using `upload-pack`. This, however, adds latency and server load.
- Implementations must provide separate methods for value and expiry reads, each supporting multiple keys.
- Multi-key reads are not atomic. Ref resolution via `ls-refs` does not guarantee that all returned refs correspond to a single repository snapshot. As a result, concurrent writes may cause different keys to be resolved against different repository states. This protocol intentionally uses a single ref per key for key–value mapping in order to guarantee single-key read consistency, even in the presence of concurrent writes.

## Cheap Migration and Forkability
Because logical objects and key–value mappings co-exist within a single Git repository, migrating a Git-KeyVal registry is primarily a matter of copying objects and refs. A fork or mirror clone yields a complete, self-contained snapshot of the registry. Implementations may rewrite, delete, or reorganize refs to construct a fresh registry without rewriting object data, making migrations, backups, and experimental ref layouts inexpensive and reversible.

## Example Use Cases
See [example-use-cases.md](./example-use-cases.md)