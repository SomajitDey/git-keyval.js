# 💁 git-keyval.js
A global Git(Hub)-based Key-Value DataBase to empower you 💪

> ⚠️ This project is currently under heavy development, and therefore, should be treated as incomplete and unstable. **However, I hope to release an alpha-version pretty soon 🤞**. If it piqued your interest, I request you to [watch this repository](https://github.com/SomajitDey/git-keyval.js "Hit the Watch button of this repository, if you're logged in GitHub") and ⭐ it to encourage me.

# Design goals (and constraints) cum Features

### Database
- Global key-value database 🌐, with reads served by CDN
- A GitHub DB-repo upstream as the single source of truth
- Write concurrency
- Support for most, if not all, [JS primitives](https://developer.mozilla.org/en-US/docs/Glossary/Primitive "Javascript's elemental data types, e.g. number, string, boolean, null, undefined")
- Key expiry and automated removal of stale keys
- Aggressive compression, not to blow up the DB-repo. Sorry, no persistent version control 🙏. But can restore earlier versions till garbage-collection at the GitHub remote
- Automated repo maintenance not to abuse GitHub. Because, as users, we can't trigger a garbage-collection at the GitHub remote
- Cloudflare workers as CDN
- Respect Git semantics: tags are static, branches are dynamic
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

