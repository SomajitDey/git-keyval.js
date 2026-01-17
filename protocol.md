# Git-KeyVal (v1.0.0)
A Git-native, provider-agnostic, IPFS-aware protocol defining a content-addressed key–value registry with atomic writes, optional encryption, TTL-based lifecycle management and highly-scalable read-heavy access.

## Audience
This protocol is designed for those end-users who
- require low-cost, durable object storage with scalable, globally distributed, low-latency reads at minimal operational complexity
- need an unrestricted-read, access-controlled-write registry usable by stateless backends and backendless frontends
- want to avoid vendor lock-in and require low-friction migration via standard Git forks, mirrors, clones 
- can afford infrequent high-latency writes with optimistic concurrency control. Some vendors, however, may provide low-latency writes through a managed REST API built atop this protocol
- accepts eventual consistency and reasonable staleness during reads. Multi-key reads are not guaranteed to be transactional. Some providers, however, may provide atomic multi-key reads with freshness guarantees, albeit gated behind stricter ratelimits or higher subscription tiers
- preferably, reuse both keys and values
- do not mind optionally encrypting their data with a repo-scoped salt for optimal intra-repo reuse (prevents only cross-repo correlation)
- accept versioning, if required, via persistent immutable CDN-cacheable Git tags instead of mutable branches with linear histories
- rarely, if at all, need to list all the key-value pairs

Although this protocol is designed to work over any Git-hosting provider&mdash; including GitHub, GitLab, Bitbucket, and self-hosted or on-premise Git servers&mdash; providers that align their infrastructure with this protocol can offer low-cost, durable object storage with access-controlled, atomic writes, scalable globally distributed CDN-backed reads, optional encryption, optional read atomicity and TTL-based lifecycle management.

## Non-Goals
The protocol is not optimized for
- ephemeral or single use data (e.g. nonces, one-time download artifacts)
- version control using append-only log-semantics (e.g. single Git branch with a linear history)
- low-latency, high-throughput write workloads such as counters, metrics or ratelimiters
- containers such as arrays or dictionaries
- atomic multi-key reads
- any TTL granularity other than day(s)

While these use cases fall outside the protocol’s design goals, providers may support or optimize for them via higher-level REST APIs built atop the protocol, without extending or weakening its core guarantees.

## Fair Use Policy
This protocol requires a Git repository. Users who do not opt for self-hosting may utilize personal repositories managed by third-party hosting providers (e.g., GitHub, GitLab, or Bitbucket). For scalable delivery, public CDNs such as jsDelivr, Statically, or raw.githack may be employed. Users must ensure their activities comply with the respective providers' acceptable use policies and fair usage limits.

## Core Assumptions
- Git uses reftables as ref-backend. Although this protocol works with the files-backend, reftables provide maximum performance and scalability. Reftables are specifically designed for high ref-counts and high ref-churn.

- Git tags are immutable. All other refs, including branches, may be treated as mutable pointers. All refs, including tags, must point to Git commits only. Note: none of these rules, except branches pointing to commit-objects only, is enforced by Git itself.

- Even with the SHA1 algorithm used for hashing, Git's root-commit objects are extremely collision-resistant when they differ only in structured low-entropy commit messages.

- All core client operations, such as read, atomic writes and scan, must be implementable with Git's wire-transfer-protocol v2 alone. This wire-protocol exposes only three modes:
    - `upload-pack` with `ls-refs` command for listing refs with given prefix(es)
    - `upload-pack` with `fetch` command for object-delivery. This can be optimized with `depth 1` and `filter=combine:blob:none+tree:0` for shallow, partial (treeless, blobless) cloning
    - `receive-pack` for pushing objects and atomic compare-and-swap ref-updates to the Git server (remote)

    Although a Git server can expose this v2-wire-protocol over smart HTTP(s), some client implementations may not be able to avail this transport for a given provider, e.g. browsers block smart-HTTP-wire-protocol for GitHub due to the absence of CORS-headers. To tackle such exceptions, as well as to comply with desired usage patterns, client implementations must access the upstream Git database through a web-API whenever such is provided by the respective vendor (e.g. GitHub's REST and GraphQL APIs, GitLab's REST API - all ratelimited).

- Downloading a Git blob from a CDN requires passing its path along with the version in the form of an immutable tag or commit OID. Additionally, if the path has a known extension, the `Content-Type` header in the CDN's response reflects the corresponding MIME-type. This aligns with popular public CDNs such as jsDelivr, statically and raw.githack.

- TTL-based lifecycle management requires periodically deleting key-value mappings for expired keys. This must be implemented preferably using the provider's native CI tooling, such as GitHub Actions and GitLab CI. If such tools are absent or infeasible, stale-cleanup workflows may be scheduled using external CI tools.

- Git objects, being deduplicated and content addressed, may be stored and fetched efficiently using IPFS. This requires mapping Git's OID to IPFS's CID. The IPFS CID can be deterministically derived from a Git OID, provided IPFS stores the object, without chunking, as raw bytes&mdash; i.e. the exact bytes that Git hashes to get the OID. If the object is big and cannot be shared optimally without chunking, the mapping must be computed using the raw bytes.

- Client implementations must support and encode for atleast the following data-types: integer, boolean, string, JSON, binary-BLOB with any media-type, raw bytes. In addition, any serializable data-type may be supported. For MIME-type to file-extension mapping, use may be made of a CDN-backed MIME-database such as [mime-db-cdn](https://github.com/somajitdey/mime-db-cdn).

- Users should be allowed to provide encryption(decryption) logic, if any, as pre-write(post-read) hooks.

- Post-write hooks may preferably be configured server-side as post-receive hooks for a Git-server and as push-trigerred-webhooks for providers such as GitHub, GitLab etc. Otherwise, client-side post-write hooks may be provided by the user.

- Fetching Git objects from upstream using Git wire-protocol creates intense load on the server and increases latency due to have-want negotiation, reachability checks and the mandatory pack-file generation per-request. If public CDNs are not available, and Git wire-protocol is not viable as a fallback (such as in browsers), the user must provide a fetch route with the following signature: 
    ```JS
    fetch<array>(
        repo<string>,
        address<string>,
        path<string!>
    ){
        ...
    }
    ```
    - `repo` passes the repository URL

    - `address` may either refer to a ref in the form `<fully qualified ref name>` or `<prefix>*` or `commit|tree|blob/<OID>`. The glob(*) format requests fetching for all refs with the matching prefix.

    - `path`, if present, must be of the form `tree|blob@<path>` or `peel@`. Along with `address`, this `path` format fully qualifies the Git-object to be fetched. If `path` is absent, the Git object referred to by `address` must be fetched (fetches tag-object if `address` is an annotated tag and commit-object if it is a light-weight tag or ref). If `path` passes `peel@`, the ref(s) in `address` are peeled and only the commit OIDs are returned.

    This fetch-route also helps with ref-resolutions for clients that cannot use Git's `upload-pack` with the `ls-refs` command.

    User-provided fetch-route always takes precedence over the defaults (public CDN > well-known provider API > Git-wire-protocol-v2).

## Design Overview
This protocol does not see Git as a mere version control system for source-codes. Instead it reimagines Git as an optimal (deduplicated and delta-compressed) object storage with an extremely efficient key-value based index (Git refs with reftables). In this approach:

- A Git-blob contains the raw bytes of data
- A Git-tree points to data-bytes and data-type (encoded in another blob) at canonical paths
- A Git-commit packs metadata through the commit-message and contains the data-packing tree as its root tree

Together, they encode a logical object (data + metadata).

To keep commit-graphs leanest and therefore boost `upload-pack` performance, commits may not have any parent commit(s).

For maximum deduplication and therefore reusability (even across repos), all these root commits may share the same invariant committer and author details and timestamps.

Key-value mapping may be manifested as a unique Git-ref, derived from the key object, pointing to the value object.

For storing expiry timestamps, key-expiry mappings may be implemented using additional refs with appropriate prefix (designed for optimal listing of refs during the periodic stale-cleanup operations).

Reads amount to ref-resolutions, followed by object-fetches.

Writes and deletions amount to atomic ref-updates with the following compare-and-swap schema:
```
atomic {
    <keyRefA> <oldValueA> <newValueA>,
    <keyRefB> <oldValueB> <newValueB>,
    <keyRefC> <oldValueC> <newValueC>,
    ...
}
```

## Specifications
In the following, JavaScript (JS) is used as the reference implementation.

### Object Model (v1.0.0)
    Object Model (OM) is versioned independently of the Protocol
A single logical object (data + metadata) must be retrievable from a deduplicated, self-contained Git commit. 
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
        "authorCommitter" : {
            "name": "Git KeyVal",
            "email": "no-reply@git.kv",
            "timestamp": <epoch>
        },
        "commitMessage": {
            "omVersion": <OM version>,
            "objectType": "generic", 
            "size": <number of bytes in data blob>,
            "dataOid": <hex OID of data blob>,
            "metaOid": <hex OID of metadata blob>
        }
    }
    ```
- Commit message description is canonically serialized from the above JSON (stringification after minification and sorting by its keys).
- Commit message header contains the string: `See README.md for description and disclaimer`
- Commit message description explicitly records the size of the data blob and all the reachable blob OIDs for cacheability and integrity checks
- Epoch is chosen to be `2025-01-01T00:00:00Z`
- Expiry objects are special objects with the following differences from the generic objects described above
    - data is an unencrypted integer
    - no metadata blob is stored
    - root tree contains only the `raw` path
    - epoch is rolling (to be defined below)
    - commit message reads
    ```JSON
    "commitMessage": {
            "omVersion": <OM version>,
            "objectType": "expiry", 
            "size": <number of bytes in data blob>,
            "dataOid": <hex OID of data blob>
        }
    ```

### Key-Value Mapping
- Key is stored as a generic object with a deduplicated commit OID (`keyOid`)
- Key is identified, however, with a key-ID (`kid`) derived as follows
```
kid = SHA1(metadata.type || plaintextBlobOid)

plaintextBlobOid => OID of Git Blob containing the key-object's raw bytes before encryption, if any

metadata.type => stringified and minified JSON value of the "type" field in the metadata JSON
```

- Value object is identified with its commit OID (`valOid`)
- A Git ref derived from `kid` points to `valOid`
```JSON
{
    "refs/<namespace>/key-<kid_shard>/<kid_trail>-kv": <valOid>
}
```
    - default namespace is implementation dependent. User can choose a custom namespace
    - kid and valOid must be encoded as lowercase hexadecimal
    - kid_shard is derived from the first two hexadecimal characters of kid
    - scalability may be achieved via repository-level sharding, for example, by distributing keys across multiple repositories using a deterministic function of `kid` (e.g. suffix-based partitioning), rather than relying on deep ref hierarchies

For example, for
- namespace: kv
- kid: `4a8f050a786cc81c4682a902720db6376d0709c6`
- valOid: `ea3011a26435f23031e0c81ed34a143aed732575`

the corresponding ref is
```JSON
{
    "refs/kv/key-4a/8f050a786cc81c4682a902720db6376d0709c6-kv": "ea3011a26435f23031e0c81ed34a143aed732575"
}
```

### Key-Expiry Mapping
- A key can either be persistent or have an expiry
- TTL granularity is intentionally limited to days, along with a bounded maximum TTL (1800 days), to keep active expiry metadata small, deduplicable, and CDN-cacheable
- The following elucidates the computation of `expiryWindow` and `expiryIndex` for a given expiry (`expireAt`), the epoch (`epoch`), and number of windows (`M`= 60)
```
Let Δ = expireAt − epoch (both in days since the Unix Epoch)

expiryWindow = Δ mod M
expiryIndex  = floor(Δ / M)

Reconstruction:
expireAt = epoch + expiryIndex * M + expiryWindow
```
- `expiryIndex` and `expiryWindow` are stored as expiry objects with deduplicated commit OIDs.
- A Git ref derived from `keyOid` points to `expiryWindowOid`
```JSON
{
    "refs/<namespace>/key-<kid_shard>/<kid_trail>-kx": <expiryWindowOid>
}
```
- A Git ref prefixed with `expiryWindow` (the integer, not the commit OID) and otherwise derived from `keyOid` points to `expiryIndexOid`. Here, sharding is achieved with `expiryWindow`-based partitioning
```JSON
{
    "refs/<namespace>/exp-<expiryWindow>/<kid>": <expiryIndexOid>
}
```
- Persistent keys do not have any expiry refs.

#### Rolling epochs for expiry objects
To keep expiry related objects bounded in long-lived repositories, the epoch is rotated every 5 years as follows. The generic objects however may continue to use the first epoch as their committer or author timestamps, enabling timeless reusability.

An epoch is defined as `YYYY-01-01T00:00:00Z` where the year `YYYY` must be divisible by 5. The active epoch is the most recent such year less than or equal to the current year. E.g. in 2043 the epoch would be `2040-01-01T00:00:00Z`.

Because TTL is capped at 1800 days and epoch is rotated every 5 years, unexpired keys can only have been set either in the active epoch or its previous epoch. Which epoch an expiry object belongs to may be derived as follows (without reading the commit timestamp). Upon retrieving the integer from the expiry object, compute the expiry object's commit OID for both the active epoch and its previous epoch. Whichever matches the actual commit OID indicates the appropriate epoch. If none matches, the key is considered stale.

With 5 yearly epoch rotation, `M`=60 and a TTL cap at 1800 days, `expiryIndex` is capped at ~ 60. Both `expiryWindow` and `expiryIndex` therefore can use expiry objects from the same active set of ~ 60 Git commits.

#### Stale key removal
Implementations may perform a lazy, daily scan of refs grouped or prefixed by the current day’s `expiryWindowOid`. This way, for `M`=60, each window is scanned every 2 months. In addition, implementations may randomly select one or more other `expiryWindowOid` values for scanning, in order to tolerate missed or delayed scans. Keys whose reconstructed `expiryAt` is less than or equal to the current day may have their key–value and expiry refs deleted.

### Key Retention
To support key retrieval (such as during key–value listing), implementations may create a Git ref derived from `kid` that points to `keyOid`, thereby keeping the key object reachable and preventing garbage collection.
```JSON
{
    "refs/<namespace>/key-<kid_shard>/<kid_trail>": <keyOid>
}
```

### Listing of Keys
Listing all refs matching the prefix `refs/<namespace>/key-<shard>/` yields all key-value pairs along with which keys are not persistent, shard-wise.

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
            ttl: <optional non-negative integer>,
            listable: <optional boolean>,
            typeSafe: <optional boolean>
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
 --force-with-lease=<key-ref-kv>:<oldValOid> \
 <newValOid>:<key-ref-kv> \
 <expiryWindowOid>:<key-ref-kx> \
 <expiryIndexOid>:<exp-ref>
```
- If a user-provided codec is supplied, the `newValue` must be encrypted before being written to any Git object
- In this case, the corresponding metadata object MUST include `encrypted: true`
- If no codec is supplied, `newValue` must be stored in plaintext, and metadata must include `encrypted: false`.

### Reads
- Unlike the write method which requires the key as a parameter, the read method can also take `kid` instead of a key.
- Reading a value is performed in the following steps
    1. Resolution of the `kv`-suffixed ref derived from the `kid` (itself derived from the logical key). This yields `valueOid`. Resolution is performed using Git's smart HTTP protocol v2 via the `ls-refs` command with the appropriate prefix(es).
    2. Retrieve the corresponding object (data + metadata) using a CDN or a user-provided custom retrieval method, based on `valueOid`.
    3. If the retrieved metadata indicates `encrypted: true`, decrypt the data using the user-provided codec.
- Reading an expiry is also done in three steps
    1. Resolve the `kx`-suffixed ref derived from the `kid`, yielding `expiryWindowOid`, using `ls-refs` over Git's smart HTTP protocol v2.
    2. Resolve the `exp-<expiryWindowOid>`-prefixed ref derived from the same `kid`, yielding `expiryIndexOid`, again using `ls-refs`.
    3. Retrieve the integer values represented by the commits `expiryWindowOid` and `expiryIndexOid`, preferably from a local cache. On cache miss, retrieve them from a CDN or via a user-provided custom method, and reconstruct `expiryAt`.
- If CDN-based or user-provided retrieval methods fail, implementations may retrieve objects directly from the Git server using `upload-pack`. This, however, adds latency and server load.
- Implementations must provide separate methods for value and expiry reads, each supporting multiple keys. For efficiency, value reads may yield stale values for expired keys unless user specifically opts for non-stale values.
- Multi-key reads are not atomic. Ref resolution via `ls-refs` does not guarantee that all returned refs correspond to a single repository snapshot. As a result, concurrent writes may cause different keys to be resolved against different repository states. This protocol intentionally uses a single ref per key for key–value mapping in order to guarantee single-key read consistency, even in the presence of concurrent writes.

### Public CDN URLs
If encryption is absent, implementations may derive or expose a public CDN URL for directly downloading the value for any given key, with appropriate CORS and Content-Type headers. A path with an extension (other than `raw` and `package.json`) exists inside the root tree (as specified in the Object Model) so that a CDN can set the proper Content-Type headers when serving that path.

## Implementation Roadmap

## Migration and Forkability
Because logical objects and key–value mappings co-exist within a single Git repository, migrating a Git-KeyVal registry is primarily a matter of copying objects and refs. A fork or mirror clone yields a complete, self-contained snapshot of the registry. Implementations may rewrite, delete, or reorganize refs to construct a fresh registry without rewriting object data, making migrations, backups, and experimental ref layouts inexpensive and reversible.

## Example Use Cases
See [example-use-cases.md](./example-use-cases.md)