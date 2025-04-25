// Export your GitHub access-token as env var: GITHUB_PAT before running this script

import repository from './github.js';
import { textToBytes, bytesToText } from './utils/conversions.js';
import assert from 'assert';
import { config } from 'dotenv';

config(); // Sourcing .env
await repository.init({ owner: 'SomajitDey', repo: 'git-keyval.js', auth: process.env.GITHUB_PAT });

describe('Testing utils/github', () => {
  describe('init', () => {
    it('node id', () => {
      assert.equal(repository.id, 'R_kgDOOUU7Ig');
    });

    it('is public', () => {
      assert.equal(repository.isPublic, true);
    });

    it('is authenticated', () => {
      assert.equal(repository.authenticated, true);
    });

    it('unencrypted', () => {
      assert.equal(Boolean(repository.encryptSecret), false);
    });
  });

  describe('commitBytes, bytesToCommitHash and fetchCommitContent', () => {
    const bytes = textToBytes(JSON.stringify({ Hello: 'World!' }));

    it('commitBytes hash agree with bytesToCommitHash', async () => {
      const hash = await repository.commitBytes(bytes);
      assert.equal(await repository.bytesToCommitHash(bytes), hash);
    });

    it('fetchCommitContent', async () => {
      const hash = await repository.bytesToCommitHash(bytes);
      // console.log('commit sha:', hash);
      assert.deepStrictEqual(await repository.fetchCommitContent(hash), bytes);
    });
  });

  describe('updateRefs and branchToCommitHash', () => {
    const commitHash = '16f951c4f2e683da2891f78358b6cda51e7492a0';
    const branch = 'test/target/' + commitHash;
    it('Point branch to commit then retrieve commit from branch', async () => {
      await repository.updateRefs([{ afterOid: commitHash, name: branch }]);
      assert.equal(await repository.branchToCommitHash(branch), commitHash);
    });

    it('Delete branch', async () => {
      await repository.updateRefs([{ name: branch }]);
      assert.equal(await repository.branchToCommitHash(branch), undefined);
    });
  });
});
