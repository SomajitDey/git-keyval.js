// Export your GitHub access-token as env var: GITHUB_PAT before running this script

import repository from './github.js';
import { textToBytes, bytesToText } from './conversions.js';
import assert from 'assert';
import { config } from 'dotenv';

config(); // Sourcing .env
await repository.init({ owner: 'SomajitDey', repo: 'git-keyval.js', auth: process.env.GITHUB_PAT });

describe('Testing utils/github', () => {
  describe('init', () => {
    it('repository node id', () => {
      assert.equal(repository.id, 'R_kgDOOUU7Ig');
    });

    it('empty blob sha', () => {
      assert.equal(repository.emptyBlob, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    });

    it('empty tree sha', () => {
      assert.equal(repository.emptyTree, '0ce6f237fbe0a6cbb5b2aaca25b169537087c041');
    });

    it('empty commit sha', () => {
      assert.equal(repository.emptyCommit, '3319b4a12fac5b964ca2a122d1b19797f212efaf');
    });
  });

  describe('commitBytes, bytesToCommitHash and fetchCommitContent', () => {
    const bytes = textToBytes(JSON.stringify({ Hello: 'World!'}));

    it('commitBytes hash agree with bytesToCommitHash', async () => {
      const hash = await repository.commitBytes(bytes);
      assert.equal(await repository.bytesToCommitHash(bytes), hash);
    });

    it('fetchCommitContent', async () => {
      const hash = await repository.bytesToCommitHash(bytes);
      //console.log('commit sha:', hash);
      assert.deepStrictEqual(await repository.fetchCommitContent(hash), bytes);
    });
  });
  
  describe('updateRefs and branchToCommitHash', () => {
    const commitHash = '16f951c4f2e683da2891f78358b6cda51e7492a0';
    const branch = 'test-target-' + commitHash;
    it('Point branch to commit then retrieve commit from branch', async () => {
      await repository.updateRefs([{ afterOid: commitHash, name: branch }]);
      assert.equal(await repository.branchToCommitHash(branch), commitHash);
    })

    it('Delete branch', async () => {
      await repository.updateRefs([{ name: branch }]);      
      assert.equal(await repository.branchToCommitHash(branch), undefined);
    })
  })
});
