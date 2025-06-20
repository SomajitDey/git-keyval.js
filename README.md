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
Use the JavaScript SDK to access and interact with your newly [setup GitHub repository](#setup-github-repository).

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

### Instantiate
To create an instance of the [imported](#install-and-import) class,
```javascript
const kv = await DB.instantiate(ownerRepo, options);
```

<details>
<summary> Parameters ... </summary>


**`ownerRepo`**

Repository identifier in the format `<owner>/<repo>`.
- Type: String
- Example: `'somajitdey/git-keyval.js'`
- Required: Yes

**`options`**

Plain old JavaScript object containing optional values.
- Type: Object
- Example: `{ auth: 'token', readOnly: true }`
- Required: No

**`options.readOnly`**

Disables all write operations when set to `true`.
- Type: Boolean
- Required: No
- Default: `false`

**`options.auth`**

GitHub access token for authenticated read/write. For read-only operations, no write permission is needed for the token.
- Type: String
- Example: `'github_pat_XXXXXXXXXX'`
- Required: No

**`options.fetch`**

Custom fetch method. Useful when hooks are needed.
- Type: Async Function
- Example:
    ```javascript
    async (...args) => {
        const request = new Request(...args);
        const modifiedRequest = await preHook(request.headers);
        const response = await fetch(modifiedRequest);
        await postHook(response.headers); // For side-effects
        return response;
    }
    ```
- Required: No

**`options.crypto`**

Define a password or encrypt/decrypt methods.
- Type: String | Object
- Example: `password`
- Required: No

**`options.crypto.encrypt`**

Method to transform plain bytes `<Uint8Array>` input to cipher bytes `<Uint8Array>`.
- Type: Async Function
- Example:
    ```javascript
    async (plain) => {
        // encryption plain => cipher ...
        return cipher;
    }
    ```
- Required: No

**`options.crypto.decrypt`**

Method to transform cipher bytes `<Uint8Array>` input to plain bytes `<Uint8Array>`.
- Type: Async Function
- Example:
    ```javascript
    async (cipher) => {
        // decryption cipher => plain...
        return plain;
    }
    ```
- Required: No
</details>

### API
The CRUD API is implemented using the following instance methods. There are also a few convenience methods like `increment` and `toggle`. Additionally, an `expire` method is provided.

👉 `key` and `value` in the following can be of any JavaScript type including, `String`, `Number`, `Boolean`, `null`, `Object`, `Array`, `Uint8Array`, `ArrayBuffer`, `Blob`.

<details>
<summary><h4><code>kv.create(key, value, options)</code></h4></summary>

#### Parameters
**`options`**

Plain old JavaScript object containing optional values.
- Type: Object
- Example: `{ overwrite: true }`
- Required: No

**`options.overwrite`**

When `undefined`, overwrites existing data, if any. If set to true, `create` succeeds only if data is being overwritten. If set to false, `create` fails if data would be overwritten.
- Type: Boolean
- Required: No

**`options.ttl`**

TTL in days.
- Type: Number
- Required: No

**`options.oldValue`**

`create` succeeds only if existing data (being overwritten) equals this.
- Type: Any
- Required: No

#### Returns `<Object>`
Returned object may have the following properties.

**`cdnLinks`**

List of CDN URLs to directly download the `value` stored against `key`.
- Type: Array
- Required: No

**`expiry`**

Expiry date.
- Type: Date
- Required: No
</details>

<details>
<summary><h4><code>kv.has(key)</code></h4></summary>

Returns `<Boolean>`
</details>

<details>
<summary><h4><code>kv.read(key)</code></h4></summary>

Returned `<Object>` may have the following properties.

**`value`**

Is `undefined` if key doesn't exist.
- Type: Any
- Required: Yes

**`expiry`**

Is `undefined` if key is persistent.
Expiry date.
- Type: Date
- Required: No
</details>

<details>
<summary><h4><code>kv.update(key, modifier, options)</code></h4></summary>

#### Parameters

**`modifier`**

Function, synchronous or not, to transform the existing value into the new value.
- Type: Function, may be async
- Example:
    ```javascript
    (oldValue) => {
        const newValue = oldValue + 1;
        return newValue;
    }
    ```
- Required: Yes

**`options`**

Plain old JavaScript object containing optional values.
- Type: Object
- Example: `{ keepTtl: true }`
- Required: No

**`options.ttl`**

TTL in days.
- Type: Number
- Required: No

**`options.keepTtl`**

Retains the existing expiry. Overrides `options.ttl`, in case of conflict.
- Type: Boolean
- Required: No
</details>

<details>
<summary><h4><code>kv.delete(key, value)</code></h4></summary>

`value` is optional. If provided, deletes `key` only if it points to `value`.

Employs `kv.create(key, undefined, { oldValue: value, overwrite: true })` under the hood.

Returns `<Object>` same as `kv.create()`.
</details>

<details>
<summary><h4><code>kv.expire(key, ttl)</code></h4></summary>

**`ttl`**

TTL in days.
- Type: Number
- Required: Yes
</details>

<details>
<summary><h4><code>kv.increment(key, stepSize)</code></h4></summary>

Increments the number stored in `key` by `stepSize <Number>`. Throws error if existing value is not a number.

Employs `kv.update()` under the hood.
</details>

<details>
<summary><h4><code>kv.toggle(key)</code></h4></summary>

Toggles the Boolean flag stored in `key`. Throws error if existing value is not a Boolean.

Employs `kv.update()` under the hood.
</details>

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
