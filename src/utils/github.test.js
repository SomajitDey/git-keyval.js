// Export your GitHub access-token as env var: GITHUB_PAT before running this script

import * as github from './github.js';
import assert from 'assert';

await github.init({ owner: 'SomajitDey', repo: 'git-keyval.js', auth: process.env.GITHUB_PAT });

describe('Testing utils/github', () => {
  describe('init', () => {
    it('repository node id', async () => {
      assert.equal(github.repository.id, 'R_kgDOOUU7Ig');
    })
    
    it('empty blob sha', async () => {
      assert.equal(github.repository.emptyBlob, 'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
    })
  })
})
