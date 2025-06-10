![JavaScript](https://img.shields.io/badge/ECMAScriptModule-black?logo=javascript&logoColor=F7DF1E)
[![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg)](https://github.com/standard/semistandard)

# 💁 git-keyval
A lightweight, portable, modern JavaScript (ESM) SDK to transform your GitHub repository into a global Key-Value DataBase (CRUD), JSON bin and files store with powerful features like optional encryption, expiry and CDN 💪

🚀 Uses your GitHub repository as a global key-value database, supporting multi-region CRUD (`create`-`read`-`update`-`delete`) operations 🌐

🚀 All writes are atomic! Allows concurrent writes alongwith overwrite protection.

🚀 Keys and values can be any of multiple JavaScript types -- `String`, `Number`, `Boolean`, `null`, `Object`, `Array`, `Uint8Array`, `ArrayBuffer`, `Blob`. Future versions may support more datatypes.

🚀 Optional encryption with user-defined `encrypt` and `decrypt` methods on top of separate access-control managed by GitHub 🔐

🚀 For public repositories, data is cached and served by multiple CDNs enabling lightning-fast reads across the globe, even at places where GitHub is not accessible ⚡

🚀 Database may be repurposed as JSON bin or files store, by storing JSON and file blobs against string-typed keys, respectively. For unencrypted, public repositories, the `create` and `update` operations provide CDN links to download the stored JSON or file with the proper `Content-Type` header 📁

🚀 Allows setting custom expiry for your keys. TTL is counted in days 

🚀 Uses in-memory LRU cache for performance, also minimizing rate-limited requests to GitHub APIs.

🚀 Designed not to abuse GitHub or the public CDNs. Data is reused as much as possible with deleted data available for `git gc` at GitHub's end ♻️

🚀 Uses GitHub Actions/CI for automated tasks such as periodic removal of expired/stale keys.

🚀 Can be implemented with standard Git commands only; does not depend heavily on anything exclusive to GitHub.

🚀 Loosely coupled to GitHub's API (REST and GraphQL). Can be used with other Git-servers, like GitLab, Bit-bucket or self-hosted, by replacing a single module in this codebase.

🚀 SDK supports specifying a custom `fetch` method. Using this, custom hooks may be implemented 💡

> ⚠️ This project is currently under heavy development, and therefore, should be treated as incomplete and unstable. **However, I hope to release an alpha-version pretty soon 🤞**. If it piqued your interest, I request you to [watch this repository](https://github.com/SomajitDey/git-keyval.js "Hit the Watch button of this repository, if you're logged in GitHub") and ⭐ it to encourage me.

## Setup GitHub repository
Simply create a GitHub repository from the template available at https://github.com/SomajitDey/git-keyval.js. The newly created repository should be setup automatically. You may check on the setup progress at the `Actions` tab in the homepage of your repository.

## JS SDK usage
Use the JavaScript SDK to access and interact with your newly setup GitHub repository.

### Install and import
For browsers:
```html
<script type="module">
    import DB from 'https://unpkg.com/git-keyval@latest/dist/index.min.js';
    // Replace 'latest' above with the desired version, if not using the latest version
    
    // Your code here ...
</script>
```

For Node.js:

Install as
```bash
npm install git-keyval
```

Import as
```javascript
import DB from 'git-keyval';
```

### API

# Contribute
[Bug-reports, feature-requests](https://github.com/SomajitDey/git-keyval.js/issues), [comments, suggestions, feedbacks](https://github.com/SomajitDey/git-keyval.js/discussions) and [pull-requests](https://github.com/SomajitDey/git-keyval.js/pulls) are very much welcome. Let's build a community around this project 👐

If you need help using this project, do not hesitate to [ask](https://github.com/SomajitDey/git-keyval.js/discussions/categories/q-a).

If you built something using or inspired from this project, you're welcome to advertise it [here](https://github.com/SomajitDey/git-keyval.js/discussions/categories/show-and-tell).

If you like this project, you can show your appreciation by
- [giving it a star](https://github.com/SomajitDey/git-keyval.js/stargazers) ⭐
- sharing it with your peers or writing about it in your blog or developer forums 
- sponsoring me through 👇

[![Sponsor](https://www.buymeacoffee.com/assets/img/custom_images/yellow_img.png)](https://buymeacoffee.com/SomajitDey)

Thank you 💚
