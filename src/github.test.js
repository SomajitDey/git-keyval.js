// Export your GitHub access-token as env var: GITHUB_PAT before running this script

import Repository from './github.js';
import { typesToCommitHash } from './types.js';
import assert from 'assert';
import { config } from 'dotenv';

config(); // Sourcing .env

const repository = await Repository.instantiate({
  owner: process.env.GITHUB_OWNER,
  repo: process.env.GITHUB_REPO,
  auth: process.env.GITHUB_AUTH
});

describe('Testing github', () => {
  describe('init', () => {
    it('is public', () => {
      assert.equal(repository.isPublic, true);
    });

    it('is authenticated', () => {
      assert.equal(repository.authenticated, true);
    });

    it('unencrypted', async () => {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      assert.deepStrictEqual(await repository.encrypt(bytes), bytes);
      assert.deepStrictEqual(await repository.decrypt(bytes), bytes);
    });
  });

  it('hasCommit', async () => {
    assert.equal(await repository.hasCommit(typesToCommitHash.get('Blob')), true);
  });

  it('fetchCommitContent and fetchBlobContent return undefined if object is non-existent',
    async () => {
      const randomHash = '3ac5ed658d05ac06b6584af5a4fa8fd7784c2119';
      assert.equal(await repository.fetchBlobContent(randomHash), undefined);
      assert.equal(await repository.fetchCommitContent(randomHash), undefined);
    }
  );  
  
  it('commitBytes, bytesToCommitHash, fetchCommitContent, cdnLinks, updateRefs and branchToCommitHash', async () => {
    const bytes = crypto.getRandomValues(new Uint8Array(14));
    const commitHash = await repository.commitBytes(bytes);
    assert.equal(await repository.bytesToCommitHash(bytes), commitHash);
    assert.deepStrictEqual(await repository.fetchCommitContent(commitHash), bytes);
    const { 'octet-stream': cdnLinkBinary } = repository.cdnLinks(commitHash);
    if (cdnLinkBinary) {
      assert.deepStrictEqual(await fetch(cdnLinkBinary).then((res) => res.bytes()), bytes);
    }
    const branch = 'test/target/' + commitHash;
    await repository.updateRefs([{ afterOid: commitHash, name: branch }]);
    assert.equal(await repository.branchToCommitHash(branch), commitHash);
    // Delete the branch
    await repository.updateRefs([{ name: branch }]);
    assert.equal(await repository.branchToCommitHash(branch), undefined);
  });
});
