import { getGitContext } from '../../src/utils/git';

describe('Git Context Utility', () => {
  it('should return a valid context object from the current repo', () => {
    const ctx = getGitContext(process.cwd());

    expect(ctx).toHaveProperty('commit');
    expect(ctx).toHaveProperty('branch');
    expect(ctx).toHaveProperty('dirty');
    expect(ctx).toHaveProperty('repo');
    expect(ctx).toHaveProperty('tags');
    expect(Array.isArray(ctx.tags)).toBe(true);
    expect(ctx.commit).toMatch(/^[a-f0-9]{40}$/);
  });

  it('should return undefined fields for a non-repo directory', () => {
    const ctx = getGitContext('/tmp');
    expect(ctx.commit).toBeUndefined();
    expect(ctx.branch).toBeUndefined();
    expect(ctx.dirty).toBe(false);
    expect(ctx.tags).toEqual([]);
  });

  it('should return a defined branch name (not detached)', () => {
    const ctx = getGitContext(process.cwd());
    expect(ctx.branch).toBeDefined();
    expect(typeof ctx.branch).toBe('string');
  });

  it('should return a remote origin URL', () => {
    const ctx = getGitContext(process.cwd());
    expect(ctx.repo).toBeDefined();
    expect(ctx.repo).toMatch(/^https?:\/\//);
  });

  it('should report dirty status correctly (boolean)', () => {
    const ctx = getGitContext(process.cwd());
    expect(typeof ctx.dirty).toBe('boolean');
  });

  it('should return tags as an array', () => {
    const ctx = getGitContext(process.cwd());
    expect(Array.isArray(ctx.tags)).toBe(true);
    ctx.tags.forEach(t => expect(typeof t).toBe('string'));
  });

  it('should not throw when given a non-existent directory', () => {
    expect(() => getGitContext('Z:\\nonexistent\\path\\that\\does\\not\\exist')).not.toThrow();
  });

  it('should not throw when git is not installed (simulated via empty string cwd edge case)', () => {
    expect(() => getGitContext('')).not.toThrow();
  });
});
