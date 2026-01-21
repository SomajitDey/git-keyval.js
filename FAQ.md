# FAQ

### If Git-blobs represent data and -refs represent KV maps, why not simply point refs to blobs, instead of commits?

Although Git technically allows refs to point to arbitrary object types, including blobs, Git-KeyVal deliberately restricts refs to target commits. Using blobs as ref targets would break several core requirements of the protocol:

- **Reusing data-bytes across data-types**: Git-KeyVal store raw data-bytes and data-type (metadata) in separate blobs. This allows identical byte content to be reused across multiple data-types or encodings. For example, the data types `strings`, `JSON` and `Blob` with MIME-type `text/json` may have the same content. Consequently, the assumption that a single blob referenced by a ref represents the complete value (bytes and type) is false. Expressing this separation requires an object that can reference multiple blobs in a structured, immutable manner — which Git provides via commits (and trees), not blobs.

- **External object storage and shared blob stores**: Git-KeyVal relies on git mktree --missing to allow bulk data blobs to be stored externally or in shared object stores across repositories. Blob refs would require blobs to be present and reachable in the repository, defeating this scalability mechanism.

- **Deterministic IPFS integration**: Blob OIDs alone are not deterministically mappable to stable IPFS CIDs without additional context, whereas commit objects provide a stable, verifiable envelope for IPFS integration.

- **CDN compatibility**: Public CDNs such as jsDelivr, Statically, and raw.githack are optimized around URLs versioned by commits and addressed by trees. Blob-only refs would break or complicate these fetch paths.

- **Provider and tooling compatibility**: Many Git hosting providers and maintenance tools assume refs resolve to commits. Blob refs are not universally supported and often lead to undefined or degraded behavior.

- **Collision resistance and auditability**: Commits provide an additional cryptographic envelope around payloads. Even in the presence of a blob hash collision, distinct commits (and corresponding IPFS CIDs) remain verifiable.

- **Support for containers**: Git-KeyVal encodes containers as commits with multiple parents referencing member objects, which cannot be expressed using blob-only refs.

- **Branch semantics and atomicity**: Git branches are defined as pointers to commits. Many providers expose only branch-oriented APIs for atomic compare-and-swap updates. Using blobs as ref targets would make such atomic updates impossible or provider-specific.

- **Provider API constraints**: Providers may restrict ref mutation APIs to commits only. Restricting ref targets to commits ensures Git-KeyVal remains compatible with existing provider APIs and does not require special-case support.

For these reasons, while blob refs may appear simpler, they are incompatible with Git-KeyVal’s goals of scalability, interoperability, atomicity, and alignment with Git’s operational model.