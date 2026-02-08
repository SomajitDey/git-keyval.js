# Git-KeyVal
A Git-native, provider-agnostic, IPFS-aware protocol defining a content-addressed, deduplicated key–value registry with atomic writes, fast, scalable, trustless reads, optional encryption, TTL-based lifecycle management, key-aliasing and version-logs.

It can turn even an existing Git repository into a key-value store without requiring any server-side configuration and without corrupting, rewriting or deleting any existing repository data.

Git-KeyVal is not a hack. It is designed from the ground up to align with Git's core object model, storage optimizations, standard semantics and best practices, while deliberately avoiding known Git performance bottlenecks in indexing, traversal, and object retrieval. Git-KeyVal does not fight or coerce Git. With Git-KeyVal, Git *naturally* evolves from a *version-control repository for source-code* to an *indexed, deduplicated repository for typed and structured data*.

**Quick Links**: [Specifications](./specifications.md) | Reference Implementation (JS) | [Glossary](./glossary.md)

## Audience
This protocol is designed for those end-users who
- require low-cost, durable object storage with scalable, globally distributed, low-latency, verifiable reads at minimal operational complexity
- need an unrestricted-read, access-controlled-write registry usable by stateless backends and backendless frontends
- want to avoid vendor lock-in and require low-friction migration via standard Git forks, mirrors, clones 
- can afford infrequent high-latency writes with optimistic concurrency control. Some vendors, however, may provide low-latency writes through a managed REST API built atop this protocol
- accepts eventual consistency and reasonable staleness during reads. Multi-key reads are not guaranteed to be transactional. Some providers, however, may provide atomic multi-key reads with freshness guarantees, albeit gated behind stricter ratelimits or higher subscription tiers
- preferably, reuse both keys and values
- do not mind optionally encrypting their data with a repo-scoped salt for optimal intra-repo reuse (prevents only cross-repo correlation)
- may need to use existing Git repository for storing key-value registry without corrupting existing data

Although this protocol is designed to work over any Git-hosting provider&mdash; including GitHub, GitLab, Bitbucket, and self-hosted or on-premise Git servers&mdash; providers that align their infrastructure with this protocol can offer durable object storage with [useful features](#commercial-provider-adoption) at extremely competitive pricing.

For a quick appreciation of scope, refer to the [example-use-cases](./example-use-cases.md).

## Non-Goals
The protocol is not optimized for
- ephemeral or single use data (e.g. nonces, one-time download artifacts)
- version control using a globally unique commit per version (e.g. single Git branch with a linear history)
- low-latency, high-throughput write workloads such as counters, metrics or ratelimiters
- atomic multi-key reads
- any TTL granularity lower than a day

While these use cases fall outside the protocol’s design goals, providers may support or optimize for them via a REST API built atop the protocol, without extending or weakening its core guarantees.

## Fair Use Policy
This protocol requires a Git repository. Users who do not opt for self-hosting may utilize repositories managed by third-party hosting providers (e.g., GitHub, GitLab, or Bitbucket). For scalable delivery, public CDNs such as jsDelivr, Statically, or raw.githack may be employed. Users must ensure their activities comply with their respective providers' Acceptable Use Policies, Terms of Service and fair usage limits.

## Core Assumptions
- Git uses reftables as ref-backend. Although this protocol works with the files-backend, reftables provide maximum performance and scalability. Reftables are specifically designed for high ref-counts and high ref-churn.

- Git tags are immutable. All other refs, including branches, may be treated as mutable pointers. All refs, including tags, must point to Git commits only. Note: none of these rules, except branches pointing to commit-objects only, is enforced by Git itself.

- Even with the SHA1 algorithm used for hashing, Git's root-commit objects are extremely collision-resistant when they differ only in structured low-entropy commit messages.

- All core client operations, such as read, atomic writes and scan, must be implementable with Git's wire-transfer-protocol v2 alone. This wire-protocol exposes only three modes:
    - `upload-pack` with `ls-refs` command for listing refs with given prefix(es)
    - `upload-pack` with `fetch` command for object-delivery. This can be optimized with `depth 1` and `filter=combine:blob:none+tree:0` for shallow, partial (treeless, blobless) cloning
    - `receive-pack` for pushing objects and atomic compare-and-swap ref-updates to the Git server (remote)

    Although a Git server can expose this v2-wire-protocol over smart HTTP(s), some client implementations may not be able to avail this transport for a given provider, e.g. browsers block smart-HTTP-wire-protocol for GitHub due to the absence of CORS-headers. To tackle such exceptions, as well as to comply with desired usage patterns, client implementations must access the upstream Git database through a web-API whenever such is provided by the respective vendor (e.g. GitHub's REST and GraphQL APIs).

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
This section assumes the reader have atleast basic understanding of [Git and its internals](https://git-scm.com/book/en/v2), and [content-addressed file-sharing in IPFS](https://docs.ipfs.tech/concepts/lifecycle/).

Design details that are out of the scope of this whitepaper may be found in [specifications.md](./specifications.md).

### Why Git
This protocol does not view Git as a mere version-control system for source-codes. Instead it reimagines Git as an *optimal object-storage* (i.e. deduplicated data and metadata with low-entropy contents aggressively delta-compressed and deflated) *with an extremely efficient key-value based index* (i.e. Git refs with reftables) *and object-retrieval* (i.e. pack-index).

Git can handle concurrent writes (pushes) and distributed reads (fetches).

Backups and migrations are trivial in Git (mirror clones). Syncing with source is standard and bandwidth-efficient (push by source to mirror or pull by mirror from source, both transferring single packfile containing all required objects).

Git is also attractive in its *built-in repository-maintenance* (GC or [prune](https://git-scm.com/docs/git-prune)) *and customizability* (hooks).

### Single Source of Truth (SSoT) repository
For strong consistency, all writes must operate only on a bare SSoT repository. Reads may be served from the SSoT (strong consistency) or mirrors (partial or full clones) and CDNs (eventual consistency).

### Object model: data-objects
With this perspective:

- A Git-blob contains only the raw bytes of data

- A Git-tree points to the
    1. data-bytes
    2. encryption-status (boolean) and data-type &mdash; such as `boolean`, `strings`, `binary-blob` etc.
    3. mime-type &mdash; equivalent to `Content-Type` http-header, such as `text/json`
    4. checksum &mdash; for collision-resistance and integrity checks

    each encoded in its own deduplicated (reusable) blob at canonical paths

- A Git-commit points to such a tree as its root-tree and encodes metadata in its commit-message

Performance optimization is achieved as follows:

- Because trees only appear as root-trees, and never as sub-trees, expensive tree-walks are eliminated. Also, to keep the commit-graphs leanest and therefore keep `upload-pack` performant, commits may not have any parent commit(s).

- For maximum deduplication and therefore reusability (even across repos), all these root commits may share the same invariant committer and author details and timestamps. These exclusive author-committer details also distinguish git-keyval commits from other commits in a
monorepo.

For any given data-object, therefore, its canonical git-keyval commit-OID may be derived deterministically. This enables trustless data fetching, as explained below.

### Fetching a data-object

A complete data-object may be retrieved from a commit-OID in two independent, trustless ways:

**Route A**

This route is the most efficient and requires a custom- or public-CDN (such as jsDelivr, Statically or raw.githack).

Step-1. Fetch the data-bytes, data-type, and mime-type blobs parallely (or concurrently) from a CDN using the commit-OID and the canonical paths.

Step-2. Reconstruct the data from the bytes, type and encryption-status.

Step-3. Verify the commit-OID by deriving it canonically from the data.

**Route B**

This route may be used only when Route A is unavailable. It requires either a provider-API (e.g. GitHub REST and GraphQL APIs) or the Git-wire-protocol-v2 over smart HTTP (`upload-pack` with `fetch`), and preferrably, IPFS. For example, the CDN-edge-nodes, forming a private IPFS cluster peer-to-peer, may use this route to fetch and cache data.

Step-1. Fetch a commit-object using Git with OID or using IPFS with the CID derived from the Git-OID. Parse commit-message which encodes
    
    - encryption-status
    - data-type signature
    - mime-type
    - data-bytes address (Git-blob-OID or IPFS-CID) 

Step-2. Fetch data-bytes from Git (using blob-OID) or IPFS (using CID)

Step-3. Reconstruct the data from the bytes, type and encryption-status

Step-4. Verify the commit-OID by deriving it canonically from the data.

Note: If Git-wire-protocol-v2 is needed for fetching the small commit-object only, then `upload-pack` with `fetch` may be passed `depth 1` and `filter=combine:tree:0+blob:none` for best performance.

### Object-model: data-containers

Data-containers represent collections of data-objects (members), of homogeneous or mixed types. Containers may be structured in one of the following modes:

- Array: members are mapped to unique integer indices.

- Dictionary: members are mapped to unique string indices (hashes).

- Multimap: a single string index (label) may map to multiple members.

- Set: members are unindexed and canonically ordered.

Multiple indices may reference the same member, enabling aliasing and reuse. Containers may also reference other containers as members, forming an acyclic object graph.

Explicit support for data-containers discourages users from implementing containers with data-objects, such as JSON strings. Such hacks lead to excessive object churn (a unique blob, tree and commit per container state) and cannot optimize by reusing the member objects.

A container may be encoded in a commit with multiple parents, each of which is a root commit.

- The parent commits point to the member objects. This design ensures that member commits remain reachable as long as the container commit itself is reachable.

- The `index => member` map may be efficiently encoded in the commit message.

- The root-tree lists the container's indices (not the `index => member` map) and encodes its cardinality and the members' shared data-type and encryption-status. Data-type and encryption-status may read `mixed` for heterogenous containers. A root-tree is reusable across all containers that share the same set of indices (hence cardinality), data-type and encryption-status.

In standard Git lingo, a container commit would be an octopus merge. However, in Git-KeyVal, an octopus merge only represents a collection of (parent) commits, not merged histories. Parent commits represent membership, not ancestry. No tree merging, conflict resolution, or history semantics are involved.

### Fetching a data-container

To retrieve a container, the corresponding commit-object and its root-tree may simply be fetched and parsed using Route B > Step-1
 - with `depth 1` and `filter=combine:tree:1+blob:none`, if using `upload-pack`

 - with commit-OID > tree-OID, if using IPFS
(CID derived from Git-OID)

The actual member-objects, pointed to by the indices, may then be fetched lazily from the parent commit-OIDs using Route A, as and when needed.

Efficient fetching of a container that includes other container(s) as member(s) is out of the scope of this whitepaper, and may be found [elsewhere](./specifications.md).

Note: If only type and cardinality are required for a container, the CDN-backed Route A may be used, without fetching the commit-object at all.

### Pushing data
Because data-objects and -containers are simply Git-objects (commits, trees and blobs), such may be pushed to the Git server using either

- provider-APIs (e.g. GitHub REST and GraphQL APIS), or
- as a packfile using Git-wire-protocol-v2 over smart HTTP (`receive-pack`).

### Keys and values
Any data-object may be a key or a value. Data-containers, however, can only be values.

A key-value map may be manifested as a unique Git ref that is canonically derived from the key object and points to the value object.

Note: Reftables optimize ref-storage with prefix-compression. String keys therefore benefit from sharing prefixes and non-string keys from sharding.

### KV reads
Reads amount to
1. ref-resolutions from the SSoT using
    - provider API (preferred)
    - Git-wire-protocol-v2 `upload-pack` with `fetch`

2. object-fetches via Route A or B as described above.

### KV writes
Writes amount to
1. Creating and pushing the required Git objects (blobs, trees and commits), if non-existent.

2. Pushing atomic (multi) ref-updates with the following compare-and-swap schema:
```
atomic {
    <keyRefA> <oldValueA> <newValueA>,
    <keyRefB> <oldValueB> <newValueB>,
    <keyRefC> <oldValueC> <newValueC>,
    ...
}
```

If using `receive-pack` for push, both objects (packfile) and ref-updates may be POSTed together in the same payload.

KV deletions are simply ref-updates with `000000000000000000000000000000000000000` as the new target commit-OID.

### Server-side setup (optional)
Self-hosted instances as well as providers aligned with Git-KeyVal may host a REST-API backend that can access the SSoT repository on local filesystem, using the powerful and performant Git CLI. For writes, ref-resolutions and commit-object fetches, clients may use this API directly, bypassing the Git-wire-protocol-v2 route and its corresponding performance bottlenecks and complexities. This enables, among other optimizations, high write throughput and transactional reads with multi-key consistency.

- For writes, the backend may accept the payload from client and perform fast (thanks to reftables), atomic updates on the repo in batches using
    ```bash
    git update-ref --stdin [--batch-updates] < transaction-script.txt
    ```
    New objects may be created from the payload using
    ```bash
    git hash-object -w --stdin

    git mktree --stdin [--missing]

    git commit-tree
    ```
        The `--missing` option in `git mktree` allows for tree creation without verifying that the referred blobs actually exist in the repo. For scalability therefore, the blob objects may be stored elsewhere, such as in a separate object store or IPFS block store that may be common across all repos.

- Ref lookup and prefix scans may be served using fast reftables:
    ```bash
    git show-ref

    git for-each-ref --format=
    ```
    Atomic ref lookups (for strong read consistency) may be performed using
    ```bash
    git update-ref --stdin < verify-script
    ```
    where verify-script contains commands of the form:
    ```text
    verify <ref> [<old-oid>]
    ```

- Commit objects and raw blobs may be served to clients or edge-nodes (CDN) using
    ```bash
    git cat-file -p <OID>
    ```

### Further reading
For further details, rationales and nuances including optional features such as

- TTL-based expiry,
- version-logging,
- key-aliasing and
- CDN-served canonical download URLs,

see the [protocol specifications](./specifications.md).

## Migration and Forkability
Because all data, mappings (such as `key => value`, `key => expiry`, `alias => key`) and logs co-exist within a single Git repository (SSoT), migrating a Git-KeyVal registry is simply a matter of cloning the repository.

If all blobs are permanently cached by a CDN (content-addressed and retrievable via commit OID and path, as is done by jsDelivr for example), IPFS or some other object-store (such as Amazon S3 or Cloudflare R2), one only needs to perform a blob-less partial clone when porting the repository, with blobs fetched lazily on demand. This preserves full verifiability of the object graph while minimizing transfer size.

For GitHub in particular, two registries that are supposed to share most data (keys and values) may benefit from being forks of each other. This is because, GitHub uses the same object pool for forks.

## Implementation Roadmap
A reference client implemented in JavaScript may be shipped with this whitepaper. Initial support may be limited to GitHub only, thanks to GitHub's extensive REST and GraphQL APIs.

Future iterations may also ship a Node.js backend to serve a REST-API wrapper for the Git-KeyVal operations. This backend would run on the server hosting the SSoT repository and operate locally on the repository using the powerful and performant Git-CLI. For self-hosted instances, this API enables clients to avoid the Git-wire-protocol entirely.

Implementations in other languages and support for specific providers may be developed by the community.

## Low-Cost Custom CDN
Production-grade public CDNs such as jsDelivr, Statically, and raw.githack currently serve only a limited set of well-known Git hosting providers, such as GitHub and GitLab. To enable efficient Route A fetches for other providers and for self-hosted Git servers, developers, organizations, and communities may deploy custom CDNs at very low cost.

Two practical deployment models are outlined below.

### Single Git-client behind Cloudflare Orange Cloud
- Host a lightweight REST-API backend on a low-cost VPS or home server. The backend fetches commits and blobs on demand using either:
    - git fetch, or
    - upload-pack over Git wire-protocol v2.

- Use Cloudflare as the reverse proxy and DNS provider for this backend.
Even the free tier may be sufficient and automatically provides:
    - global CDN caching,
    - DDoS mitigation,
    - and SSL/TLS termination.

- Cloudflare cache rules may be configured to:
    - cache HTTP 200 responses to `GET` requests indefinitely, and
    - cache non-200 `GET` responses (e.g. 404) for a limited duration only.
    
    Because Git objects are immutable and content-addressed, such aggressive caching is safe and requires no cache invalidation.

### Distributed peer-to-peer edge nodes
- Deploy multiple Git-aware, IPFS-enabled edge nodes across geographically distributed low-cost VPSs or home servers. Each node runs the same REST-API backend.

- Use GeoDNS to route client requests to the nearest available edge node.

- On cache miss:
    1. The edge node first attempts to retrieve the requested Git object from peer edge nodes via IPFS.
    2. Only if the object is unavailable in the peer network does the node request it from the SSoT using:
        - git fetch, or
        - upload-pack (wire-protocol v2).

- Once retrieved, objects are stored in the node’s local IPFS block store and become immediately available for future requests and peer sharing.

These designs minimize load on the SSoT, enable global deduplication, and provide scalable, trustless, CDN-like performance using commodity infrastructure.

## Adoption by Users and Providers
Git-KeyVal is intentionally designed so that adoption does not require coordinated rollout, provider cooperation, or changes to existing Git infrastructure or its downstream CDNs. The following suggestions outline how both users and commercial providers may adopt Git-KeyVal incrementally and economically.

### Client and community adoption

Users and developers may adopt Git-KeyVal immediately using existing Git hosting providers and standard Git tooling.

- Existing repositories may be used without modification. Git-KeyVal objects coexist safely with existing commits and refs, and do not rewrite or interfere with repository history.

- Client-side implementations can construct data-objects and containers deterministically and perform:
    - atomic multi-ref updates for KV writes, and
    - CDN-accelerated, trustless reads via Route A.

- Migrating to a new provider is rapid:
    - clone repo to new host
    - integrate provider API with client-side implementation using SDK shipped by the provider or developed by the community

- Self-hosting is straightforward:
    - a bare SSoT repository,
    - a lightweight backend operating locally via the Git CLI,
    - and custom CDN.

- By adopting open source clients, users require minimal trust in providers. Clients can verify integrity after each read, and users may independently inspect state by cloning the repository locally at any time. Due to such client-side verifiability and migration pressure (churn), providers are disincentivized from breaking protocol compatibility (for example, by using refs that point directly to blobs instead of commits).

This enables individual developers, open-source projects, and communities to deploy strongly consistent key–value storage at very low cost, without relying on specialized providers.

### Commercial provider adoption

Commercial providers may adopt Git-KeyVal as a low-cost, high-scale key–value service by leveraging Git’s native strengths and modern CDN infrastructure.

- Providers may operate shared Git object stores backing many Git-KeyVal repositories, benefiting from:
    - global content-addressed deduplication,
    - reuse across repositories and tenants,
    - and append-only storage patterns.
    
    Using techniques such as `git mktree --missing`, bulk data blobs may be stored in external or shared object stores, while Git repositories retain only lightweight metadata (commits, trees and refs).

- Multithreaded REST-API-backends operating locally on the SSoT may perform high-throughput, atomic KV writes using:
    - reftables,
    - batched ref updates,
    - and standard Git maintenance operations.

- Read scalability may be achieved by exposing canonical URLs for distributed, low-latency downloads via Route A.

- Monetization may target optional value-added services such as:
    - Higher ratelimits
    - Large blob storage using managed LFS
    - Availability and uptime SLAs
    - Managed CDN endpoints
    - Atomic multi-key reads with freshness guarantees
    - Extended write logs or version history via Git reflogs
    - Usage analytics
    - Custom TTL policies (e.g. sub-day granularity)
    - Ephemeral or single-use data storage
    - Containers with higher cardinality (larger commit objects)
    - Custom webhooks triggerred by writes
    - CI for (mono)repos containing both code (standard Git usage) and data (KV)

- Open-source SDKs may be published as reusable packages for rapid integration with existing client-side implementations of Git-KeyVal.

- Providers specializing exclusively in Git-KeyVal as a service may require all write operations and authoritative read operations to be performed via authenticated REST-API endpoints. In such deployments,
    - `receive-pack` may be disabled to prevent direct `git push` access.
    - `upload-pack` may be strictly rate-limited, permitting limited `git clone` and `git fetch` operations.

    The API must act as a thin, transparent wrapper over standard Git object creation and atomic ref updates, and must not introduce provider-specific semantics or non-canonical object encodings.
