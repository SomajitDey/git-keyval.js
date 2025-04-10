# Implementation

### Git and GitHub features to use to our advantage
- Commit SHAs may be made a function of tree (which in turn is a function of blob contents and filenames and modes) only, by using the same committer and author details (name, email, date), as well as the same parent commit (if any), for every new commit.
- GitHub [REST API provides a method to create/update text files](https://docs.github.com/en/rest/repos/contents?apiVersion=2022-11-28#create-or-update-file-contents). Allows us to specify committer and author details, [unlike the GraphQL API or the web-interface](https://docs.github.com/en/graphql/reference/mutations#authorship).
- GitHub [REST API provides a method to list all branches pointing to a given commit](https://docs.github.com/en/rest/commits/commits?apiVersion=2022-11-28#list-branches-for-head-commit)
- GitHub GraphQL API allows packing multiple queries in a single request
- GitHub [GraphQL API allows updateRefs mutation to update multiple refs atomically](https://docs.github.com/en/graphql/reference/mutations#updaterefs). Deletion and forced-updates are also allowed. Forced updates do not require `beforeOid` parameter.
- Tags in Git can point to any object by its SHA, not only commits. Tags pointing to trees are resolvable similar to tags pointing to commits by raw.githubusercontents.com and CDNs like jsDelivr. Tags can also point to blobs.
- jsDelivr stores files by commit SHAs effectively forever in permanent S3 storage. Also cache time is 1 year for those. Similarly for other CDNs like statically.io, raw.githacks.com etc.

- ### Our scheme
- - Every element is a commit, with a common parent commit, called null-commit, and with same committer and author details.
  - 3 types of elements - key, value, expiry-date
  - commit sha of key is used as the DB index, also called uuid
  - The 3 types of elements are pointed to by branches with names in the format: type-uuid where type = key | val | exp
  - Client during set simply
    - adds key commit on top of null-commit, if key-commit didn't exist. Existence is conveniently checked by using CDNs like jsDelivr
    - adds file on top of key in the key-uuid branch
    - adds expiry Date commit on top of null-commit
    - Then atomically force updates refs as :
      - branch-uuid => key-uuid's HEAD, atomic shift to new value
      - key-uuid => key commit, ready for a new file addition
      - exp-uuid => new expiry date commit
