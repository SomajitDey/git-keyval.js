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

  it('commitBytes, bytesToCommitHash, fetchCommitContent, updateRefs and branchToCommitHash', async () => {
    const bytes = textToBytes(JSON.stringify({ Hello: 'World!' }));
    const commitHash = await repository.commitBytes(bytes);
    assert.equal(await repository.bytesToCommitHash(bytes), commitHash);
    assert.deepStrictEqual(await repository.fetchCommitContent(commitHash), bytes);
    const branch = 'test/target/' + commitHash;
    await repository.updateRefs([{ afterOid: commitHash, name: branch }]);
    assert.equal(await repository.branchToCommitHash(branch), commitHash);
    // Delete the branch
    await repository.updateRefs([{ name: branch }]);
    assert.equal(await repository.branchToCommitHash(branch), undefined);
  });
});
