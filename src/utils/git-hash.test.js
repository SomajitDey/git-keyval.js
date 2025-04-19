import * as git from './git-hash.js';
import assert from 'assert';

describe('Testing utils/git-hash', () => {
it('blobHash', async () => {
  const blobSHA = 'bd9dbf5aae1a3862dd1526723246b20206e5fc37';
  assert.equal(await git.blobHash('what is up, doc?'), blobSHA);
})

it('treeHash', async () => {
  const treeSHA = '6b455df2c7121a4f23578ca35cdbdf5089e35b8f';
  const entries = {
    ".gitignore": {
      type: "blob", hash: "c2658d7d1b31848c3b71960543cb0368e56cd4c7"
    },
    "LICENSE": {
      type: "blob", hash: "ff6bd914de60ddd61b72600de4c50cafd14a16a5"
    },
    "README.md": {
      type: "blob", hash: "7bedddc70e910ac884ce12f51e461b0ba9a0e1e4"
    },
    "implementation.md": {
      type: "blob", hash: "7b4e7b68909921715a7e1851fe9b7f533cb045db"
    },
    "package-lock.json": {
      type: "blob", hash: "d82357be0a391739abec53d01e74315b4be6e171"
    },
    "package.json": {
      type: "blob", hash: "e55a9b7f8a8c6fe2810446d46594e4bfb43276b5"
    },
    "src": {
      type: "tree", hash: "3107a19614d70e58c4a4b7fa8d183bc9725d5fe4"
    },
}
  assert.equal(await git.treeHash(entries), treeSHA);
})

it('commitHash', async () => {
  const commitSHA = 'e9ace96e2ca6a2186a0c8a65b1b925f79a6d2ad2';
  const input = {
    treeHash: 'cf0c2fd8ac653287b3bc1a8f988a580a8f512703',
    parentCommitHashes: ['4550780e201f452725b2a06f42a74ade28a89db4'],
    author: {
      name: 'Somajit Dey',
      email: '73181168+SomajitDey@users.noreply.github.com',
      date: '1744389816 +0530'
    },
    committer: {
      name: 'Somajit Dey',
      email: '73181168+SomajitDey@users.noreply.github.com',
      date: '1744389816 +0530'
    },
    message: 'hi there'
  }
  assert.equal(await git.commitHash(input), commitSHA);
})

it('annotatedTagHash', async () => {
  const annotatedTagSHA = '5a0e776cd195b704188508dbd54146f06a2994ec';
  const input = {
    object: { hash: 'd9ecde7f619917f2c0fb88e74ddf35bac4e6ec40', type: 'commit' },
    tagger: {
      name: 'Somajit Dey',
      email: '73181168+SomajitDey@users.noreply.github.com',
      date: '1744395850 +0530'
    },
    message: 'Hello\nthere',
    tag: 'annotated'
  }
  assert.equal(await git.annotatedTagHash(input), annotatedTagSHA);
})  
})
