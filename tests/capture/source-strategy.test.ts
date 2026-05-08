import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { determineSourceStrategy } from '../../src/capture/source-strategy.js';

describe('Source Strategy', () => {
  let tempDir: string;

  function runGit(args: string[]): void {
    const result = spawnSync('git', args, { cwd: tempDir, encoding: 'utf-8' });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
  }

  function initGitRepoWithCommit(): void {
    runGit(['init']);
    runGit(['config', 'user.name', 'BugProof Test']);
    runGit(['config', 'user.email', 'bugproof-test@example.com']);
    runGit(['add', '.']);
    runGit(['commit', '-m', 'init']);
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-srcstrat-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should use full-copy strategy for non-git dir with small codebase', () => {
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'console.log("hello");');
    fs.writeFileSync(path.join(tempDir, 'config.json'), '{"port": 3000}');

    const result = determineSourceStrategy({
      workingDir: tempDir,
    });

    expect(result.strategy).toBe('full-copy');
    expect(result.filesToInclude.length).toBeGreaterThan(0);
    expect(result.filesToInclude).toContain('app.js');
    expect(result.filesToInclude).toContain('config.json');
    expect(result.shouldAbort).toBe(false);
    expect(result.totalSize).toBeGreaterThan(0);
  });

  it('should abort with exceeded strategy when codebase exceeds limit', () => {
    // Create files totalling > 1KB (using a very low limit for testing)
    fs.writeFileSync(path.join(tempDir, 'big.txt'), 'x'.repeat(2000));

    const result = determineSourceStrategy({
      workingDir: tempDir,
      maxCodebaseSize: 1024, // 1KB limit for test
    });

    expect(result.strategy).toBe('exceeded');
    expect(result.shouldAbort).toBe(true);
    expect(result.reason).toContain('Install git');
  });

  it('should exclude node_modules and .git directories', () => {
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'code');
    fs.mkdirSync(path.join(tempDir, 'node_modules', 'express'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'node_modules', 'express', 'index.js'), 'module');
    fs.mkdirSync(path.join(tempDir, '.git', 'objects'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, '.git', 'HEAD'), 'ref');

    const result = determineSourceStrategy({
      workingDir: tempDir,
    });

    expect(result.strategy).toBe('full-copy');
    expect(result.filesToInclude).toContain('app.js');
    expect(result.filesToInclude.some(f => f.includes('node_modules'))).toBe(false);
    expect(result.filesToInclude.some(f => f.includes('.git'))).toBe(false);
  });

  it('should skip binary file extensions', () => {
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'code');
    fs.writeFileSync(path.join(tempDir, 'image.png'), 'binary');
    fs.writeFileSync(path.join(tempDir, 'app.exe'), 'binary');

    const result = determineSourceStrategy({
      workingDir: tempDir,
    });

    expect(result.strategy).toBe('full-copy');
    expect(result.filesToInclude).toContain('app.js');
    expect(result.filesToInclude.some(f => f.endsWith('.png'))).toBe(false);
    expect(result.filesToInclude.some(f => f.endsWith('.exe'))).toBe(false);
  });

  it('should use git-files strategy in a git repo with forced include', () => {
    runGit(['init']);
    runGit(['config', 'user.name', 'BugProof Test']);
    runGit(['config', 'user.email', 'bugproof-test@example.com']);
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'hello');
    runGit(['add', '.']);
    runGit(['commit', '-m', 'init']);

    const result = determineSourceStrategy({
      workingDir: tempDir,
      forceIncludeFiles: true,
    });

    expect(result.strategy).toBe('git-files');
    expect(result.shouldAbort).toBe(false);
  });

  it('should use git-full strategy for clean git repo', () => {
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'hello');
    initGitRepoWithCommit();

    const result = determineSourceStrategy({
      workingDir: tempDir,
    });

    expect(result.strategy).toBe('git-full');
    expect(result.commit).toBeDefined();
    expect(result.filesToInclude).toHaveLength(0);
    expect(result.shouldAbort).toBe(false);
  });

  it('should use git-patch strategy for dirty git repo', () => {
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'hello');
    initGitRepoWithCommit();
    // Make dirty
    fs.writeFileSync(path.join(tempDir, 'file.txt'), 'hello world');

    const result = determineSourceStrategy({
      workingDir: tempDir,
    });

    expect(result.strategy).toBe('git-patch');
    expect(result.commit).toBeDefined();
    expect(result.patch).toBeDefined();
    expect(result.patch).toContain('hello world');
    expect(result.shouldAbort).toBe(false);
  });

  it('should respect custom exclude patterns', () => {
    fs.writeFileSync(path.join(tempDir, 'app.js'), 'code');
    fs.mkdirSync(path.join(tempDir, 'logs'));
    fs.writeFileSync(path.join(tempDir, 'logs', 'debug.log'), 'log data');

    const result = determineSourceStrategy({
      workingDir: tempDir,
      excludePatterns: ['logs'],
    });

    expect(result.strategy).toBe('full-copy');
    expect(result.filesToInclude).toContain('app.js');
    expect(result.filesToInclude.some(f => f.includes('logs'))).toBe(false);
  });
});
