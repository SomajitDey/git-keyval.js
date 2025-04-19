// Export your GitHub access-token as env var: GITHUB_PAT before running this script

import repository from './github.js';
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
  });
});
