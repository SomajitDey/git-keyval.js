# 💁 git-keyval.js
A global Git(Hub)-based Key-Value DataBase to empower you 💪

> ⚠️ This project is currently under heavy development, and therefore, should be treated as incomplete and unstable. **However, I hope to release an alpha-version pretty soon 🤞**. If it piqued your interest, I request you to [watch this repository](https://github.com/SomajitDey/git-keyval.js "Hit the Watch button of this repository, if you're logged in GitHub") and ⭐ it to encourage me.

# Design goals(and constraints)-cum-Features

### Database
- Global key-value database 🌐, with multi-region reads served and cached by CDN (hence global).
- A GitHub DB-repo upstream as the single source of truth
- Reads are also served by GitHub GraphQL API - fast and efficient compared to the REST API
- Data is read from multiple sources (viz. CDNs, GraphQL, raw.githubusercontents.com) concurrently, and the freshest is shown to the user. This ensures speed and availability as well as CDN-cache priming. Even if GitHub experiences a downtime, CDNs can serve previously seen records from cache.
- Writes are served by periodic, long-running Workflows that subscribe to a Redis PubSub topic (using Upstash Redis DB) or expose a webhook. User data is published to that topic or webhook when any CUD (from CRUD) method is called. The Workflow retries pushing to the remote periodically, in case GitHub is down temporarily
- Write concurrency
- Anything can be a key or value, as long as it is serializable with `JSON.stringify()`. Keys generate unique Base64 indices (UUIDs), based on which they can be lexicographically sorted. Records may be accessed by the key or its UUID. Last-mile CDNs may be picked based on the UUID as a 1-to-1 map, for better caching guarantees
- Scanning for all entries, i.e. key-val pairs, should be available and should be fast. To implement this, any given key generates a commit with constant commit-metadata for all keys. The UUID is the base64-URL of the commit-SHA. 
- Key expiry and automated removal of stale keys. Minimum TTL => 1 day. Garbage collection runs daily. Option to persist records. Expire day index (i.e. `floor(UnixTime/86400)`) is stored as a tag, named in the format `UUID-EXPIRE_DAY_INDEX`, pointing to the commit for that key (the one with SHA = hex(UUID)). Expiry for any given key may then be queried in two ways: listing pattern matching refs (UUID-*) or listing refs containing commit with SHA = hex(UUID).
- Having too many (unexpired) keys, means having too many branches. [This should not be an issue nowadays](https://stackoverflow.com/questions/28849302/impact-of-large-number-of-branches-in-a-git-repo). However, may not do git-fetch if not absolutely necessary. Even expiry works by calling `git ls-remote *--EXPIRE_DAY_INDEX`, so that only refs expiring that day are downloaded.
- Aggressive compression and deduplication, not to blow up the DB-repo with a huge object store and big packfiles, at the cost of version control and authentic commit metadata.
- Automated repo maintenance (through rename-(template)forking-delete cycles) not to abuse GitHub. Because, as users, we can't trigger a garbage-collection at the GitHub remote
- Cloudflare workers as CDN
  - Respects request cache-control headers such as no-cache (i.e. serve fresh) and max-age (i.e. serve data with age <= this)
  - Takes github read access tokens via authorization header. This keeps abusers at bay, if false tokens provided, request-ip gets blacklisted
  - Caches two things, branch => commit for n-minutes, commit => data or other CDN link to redirect, for eternity
- Respect Git semantics: tags are static, branches are dynamic. So branches should point to dynamic data, not tags, even though tags are attractive in that they can point to blobs holding data. Branch named `UUID`, corresponding to a key, points to the commit holding value for that key in root-blob at `./value.txt`.
- Different write strategies to accomodate the tradeoff between number of rate-limited REST-API calls and latencies, as well as different permissions:
  - Write directly; least latency; permission required: Contents (write)
  - Write using workflow; slightly greater latency; permission required: Actions
  - Write in batches using GitHub workflows; high latency but can handle too many writes in a very short span; permission required: Actions
- Optional password protection, through encryption

### NPM Package
- Runtime independence (atleast Node and V8), and a CDN-served single-script for Browsers
- Not to abuse public CDNs such as jsdelivr, raw.githacks and statically.io
- Caching priorities, lowest-rank to be used first:
  1. sessionStorage (Browser) or Map object (Node or V8, if not serverless)
  2. Self-deployed CDN
  3. Package author CDN
  4. raw.githubusercontents.com
  5. cdn.jsdelivr | raw.githacks.com | statically.io
  6. GitHub REST API

