# Implementation

### Git and GitHub features to use to our advantage
- Commit SHAs may be made a function of tree (which in turn is a function of blob contents and filenames and modes) only, by using the same committer and author details (name, email, date), as well as the same parent commit (if any), for every new commit.
- GitHub [REST API provides a method to create/update text files](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents). Allows us to specify committer and author details, [unlike the GraphQL API or the web-interface](https://docs.github.com/en/graphql/reference/mutations#authorship).
- GitHub [REST API provides a method to list all branches pointing to a given commit](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-branches-for-head-commit)
- GitHub GraphQL API allows packing multiple queries in a single request
- GitHub [GraphQL API allows updateRefs mutation to update multiple refs **atomically**](https://docs.github.com/en/graphql/reference/mutations#updaterefs). Deletion and forced-updates are also allowed. Forced updates do not require `beforeOid` parameter.
- Tags in Git can point to any object by its SHA, not only commits. Tags pointing to trees are resolvable similar to tags pointing to commits by raw.githubusercontents.com and CDNs like jsDelivr. Tags can also point to blobs.
- jsDelivr stores files by commit SHAs effectively forever in permanent S3 storage. Also cache time is 1 year for those. Similarly for other CDNs like statically.io, raw.githacks.com etc.

### Our scheme
- Every element (such as key, value or expiry date) is a commit, that is based on content **only**. This is achieved by using a common (meaning shared by all, or constant) parent commit, called null-commit, and with common committer and author details (name, email and date, notice date is constant now). This achieves deduplication and reusability, even across repositories, helping CDNs cache more aggresively based on commit SHAs only! Two keys using the same value, for example, can reuse a single value-commit! Multiple keys expiring on the same day, can use the same expiry-commit!
- 3 types of elements - key, value, expiry-date
- commit sha of key is used as the DB index, also called uuid
- The 3 types of elements are pointed to by branches with names in the format: type-uuid where type = stage | value | expiry
- Client during `set`, (i.e. C or U from CRUD) simply
  - adds key commit on top of null-commit, if key-commit didn't exist. Existence is conveniently checked by using CDNs like jsDelivr. A tag named `<uuid>` may point to the key-commit to save it from garbage-collection. This tag is to be removed upon expiry
  - adds branch named `stage-<uuid>`, if non-existent (checked using CDN), pointing to null-commit
  - adds expiry date commit on top of null-commit, if non-existent (checked using CDN). Can be reused by other `set`s
  - adds value commit on top of null-commit in the `stage-<uuid>` branch
  - **atomically** force updates refs as (all the below ops are performed together, atomically...i.e. all fail if one fails): (=> means points to)
    - `value-<uuid>` => `stage-<uuid>`'s HEAD, this performs atomic shift of the DB index (i.e. `value-<uuid>`) to new value
    - `stage-<uuid>` => null-commit, readies stage branch to accept new value
    - `expiry-<uuid>` => new expiry date commit
- 64-bit numbers are converted into base64-url before storing to compress their textual representation
- `null`, `undefined`, `+infinity`, `-infinity`, `NaN` refer to special value-commits of their own, common accross all repos
- A maximum expiry time - integer - is allowed beyond which the key is treated as persistent forever and no expiry is undertaken. This helps keep the number of expiry-commits finite and manageable and reusable in cycles. E.g. for a max expiry of 9 days, a expiry date of 4 means (9+1) +4 -6 = 8 days from now if today is 6. Expiry is stored as n-bit base64URL expressed number if n-bits are sufficient to store the max expiry.
- A CDN is hosted to aid rapid branch retrieval with max-age = 5 mins. raw.githubusercontents.com caches for the same time but its not guaranteed to be a CDN.
- During retrieval (i.e. R from CRUD), first try our hosted CDN. If unavailable, use abort signal controlled `Promise.race()` to retrieve from mutliple sources parallely - GitHub's GraphQL API, raw.github and CDNs, noting the age from the headers returned by raw.github and CDNs. If maximum 5 min old data is allowed, do not waste a ratelimited request by using the GraphQL API.
