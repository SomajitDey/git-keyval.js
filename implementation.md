# Implementation

### Git and GitHub features to use to our advantage
- Commit SHAs may be made a function of tree (which in turn is a function of blob contents and filenames and modes) only, by using the same committer and author details (name, email, date), as well as the same parent commit (if any), for every new commit.
- GitHub REST API provides a method to [create/update text files](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents). Allows us to specify committer and author details, [unlike the GraphQL API or the web-interface](https://docs.github.com/en/graphql/reference/mutations#authorship). Also one can create blobs, trees and commits separately using the [REST API for git database](https://docs.github.com/en/rest/git?apiVersion=2022-11-28).
- GitHub [REST API provides a method to list all branches pointing to a given commit](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-branches-for-head-commit)
- GitHub GraphQL API allows packing multiple queries in a single request
- GitHub [GraphQL API allows updateRefs mutation to update multiple refs **atomically**](https://docs.github.com/en/graphql/reference/mutations#updaterefs). Deletion and forced-updates are also allowed. Forced updates do not require `beforeOid` parameter.
- Tags in Git can point to any object by its SHA, not only commits. Tags pointing to trees are resolvable similar to tags pointing to commits by raw.githubusercontents.com and CDNs like jsDelivr. Tags can also point to blobs.
- jsDelivr stores files by commit SHAs effectively forever in permanent S3 storage. Also cache time is 1 year for those. Similarly for other CDNs like statically.io, raw.githacks.com etc.
- If renaming a repository in GitHub, the old name can still be used to access the repo, until a new repo with the old name is created.
- For Public repositories, free-tier is more generous.
- For Public repositories, most REST API GET/HEAD requests do not necessitate authentication. Unauthenticated requests are rate-limited based on IP only.
- GraphQL API doesn't accept unauthenticated requests.
- For authenticated requests, the GraphQL rate-limit is more generous than the REST API.

### Our scheme
- Any JavaScript value, that is of a primitive type or is an Object or Array, is represented as two **deduplicated commit**s, one containing its bytes value, and the other, its type. Type can be one of:
  - Number
  - Boolean
  - String
  - JSON, for `<Array>`, `<Object>` and `<Null>` types
- **Deduplicated commit** refers to a commit that is based on its blob-contents only. All deduplicated commits share the same commit message, committer and author details (including commit dates), and the same parent commit, if any. Here, we choose not to have any parent commit at all. Also, we choose commits not to have any subtrees. Two different deduplicated commits, i.e. differing in their commit SHAs, cannot share the same blob or tree. Deduplicated commits from different repositories, should have the exact same blob contents, if their commit SHAs are equal.
- We recognize 3 types of records
  - key, can be of any type
  - value, can be of any type
  - expiry-date, `<Number>`
- Commit SHA of key, along with its type is used as the DB index, also called uuid. Format: `<type>/<sha>`
- Bytes commit for a key's value is pointed to by branch: `kv/<uuid>/value/bytes`
- Type commit for a key's value is pointed to by branch: `kv/<uuid>/value/type`
- Expiry commit for a key's value is pointed to by branch: `kv/<uuid>/expiry`
- Client during `set`, (i.e. C or U from CRUD) simply
  - adds the key's bytes commit, if it didn't exist. A *tag* named `refs/tags/kv/<uuid>` may point to the commit to save it from garbage-collection. This tag is to be removed upon expiry or key deletion.
  - adds expiry commit, if non-existent. An expiry-commit can be reused by other `set`s, expiring on the same date, thanks to commit-deduplication.
  - **atomically** force updates the relevant refs (i.e. all the below operations are performed together, atomically; all fail if one fails): (`=>` means "points to")
    - `refs/heads/kv/<uuid>/value/bytes` => value-bytes-commit
    - `refs/heads/kv/<uuid>/value/type` => value-type-commit
    - `refs/heads/kv/<uuid>/expiry` => expiry-bytes-commit
- 64-bit or 8 byte numbers are saved as bytes. However numbers requiring less than 8 characters in their string representation, is stored as the string.
- A maximum expiry time - integer - is allowed beyond which the key is treated as persistent forever and no expiry is undertaken. This helps keep the number of expiry-commits finite and manageable and reusable in cycles. E.g. for a max expiry of 9 days, an expiry date of 4 means (9+1) +4 -6 = 8 days from now if today is 6.
- A CDN is hosted to aid rapid branch retrieval with max-age = 5 mins. raw.githubusercontents.com caches for the same time but its not guaranteed to be a CDN.
- If all blobs, apart from type-commit-blobs, are to be password protected, use a ref to point to a blob containing the hash of the password. This tells the client if password has been used or not, and also if the provided password is incorrect.
- During retrieval (i.e. R from CRUD), first try our hosted CDN. If unavailable, use abort signal controlled `Promise.race()` to retrieve from mutliple sources parallely - GitHub's GraphQL API, raw.github and CDNs, noting the age from the headers returned by raw.github and CDNs. If maximum 5 min old data is allowed, do not waste a ratelimited request by using the GraphQL API.

### Upstream repository maintenance
- Overtime too many unreachable or dangling commits will pile up in the GitHub repository. Requesting a garbage collection through GitHub support is one way to clean it up.
- Alternatively, inspired by [this](https://stackoverflow.com/a/78392060), make a scheduled WorkFlow do the following
  - Using GitHub CLI, rename the upstream repo (old name can still access the repo)
  - git clone --mirror renamedRepo
  - Using GitHub CLI, create an empty repo with the old name (old name points to new repo now)
  - git remote update (final sync)
  - git push --mirror newRepo
  - Using GitHub CLI, delete the renamed repo
- 
