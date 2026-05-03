import { getGitContext } from '../../src/utils/git';

describe('Git Context Utility', () => {
  it('should return a valid context object from the current repo', () => {
    // We are running inside the BugProof repo, so git should work
    const ctx = getGitContext(process.cwd());
    
    // These should always be defined in a valid repo
    expect(ctx).toHaveProperty('commit');
    expect(ctx).toHaveProperty('branch');
    expect(ctx).toHaveProperty('dirty');
    expect(ctx).toHaveProperty('repo');
    expect(ctx).toHaveProperty('tags');
    expect(Array.isArray(ctx.tags)).toBe(true);
  });

  it('should return undefined fields for a non-repo directory', () => {
    const ctx = getGitContext('/tmp');
    expect(ctx.commit).toBeUndefined();
    expect(ctx.branch).toBeUndefined();
    expect(ctx.dirty).toBe(false);
  });
});
