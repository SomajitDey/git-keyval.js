// Note: Using a timeout before reads after an update to allow changes take effect across upstream

import Repository from './github.js';
import assert from 'assert';
import { setTimeout } from 'node:timers/promises';
import { config } from 'dotenv';

config(); // Sourcing .env

const repository = await Repository.instantiate(process.env.GH_REPO, {
  auth: process.env.GH_TOKEN,
  committer: {
    name: 'First Last',
    email: 'user@host.tld'
  }
});

describe('Testing github', () => {
  describe('Has async prototype', () => {
    assert.throws(() => new Repository(), { cause: 'async constructor' });
  });

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

  it('fetchCommitContent and fetchBlobContent return undefined if object is non-existent',
    async () => {
      const randomHash = '3ac5ed658d05ac06b6584af5a4fa8fd7784c2119';
      assert.equal(await repository.fetchBlobContent(randomHash), undefined);
      assert.equal(await repository.fetchCommitContent(randomHash), undefined);
    }
  );

  it(
      `commitBytes, bytesToCommitHash, fetchCommitContent, cdnLinks, updateRefs,
      refToCommitHash, hasCommit, hasRef, listBranchesTo`,
      async () => {
        const bytes = crypto.getRandomValues(new Uint8Array(14));
        const commitMsg = 'Test commit';
        const commitHash = await repository.commitBytes(bytes, { message: commitMsg });
        assert.ok(await repository.hasCommit(commitHash));
        assert.deepStrictEqual(await repository.fetchCommitContent(commitHash), bytes);
        const [cdnLink] = repository.cdnLinks(commitHash);
        if (cdnLink) {
          assert.deepStrictEqual(await fetch(cdnLink).then((res) => res.bytes()), bytes);
        }
        assert.equal(await repository.fetchCommitMessage(commitHash), commitMsg);
        const branch = 'test/target/' + commitHash;
        await repository.updateRefs([{ afterOid: commitHash, name: branch }]);
        await setTimeout(2000);
        assert.deepStrictEqual(await repository.listBranchesTo(commitHash), [branch]);
        assert.ok(await repository.hasRef(branch));
        assert.equal(await repository.refToCommitHash('refs/heads/' + branch), commitHash);
        assert.equal(await repository.refToCommitHash(branch), commitHash);
        // Delete the branch
        await repository.updateRefs([{ name: branch }]);
        await setTimeout(2000);
        assert.equal(await repository.refToCommitHash(branch), undefined);
        assert.equal(await repository.hasRef('refs/heads/' + branch), false);
      }
  );
});
