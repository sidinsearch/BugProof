import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  createSandbox,
  SandboxOptions,
  SandboxResult,
  cleanupSandbox,
} from '../../src/replay/sandbox';

describe('Replay Sandbox', () => {
  let createdDirs: string[] = [];

  afterEach(() => {
    // Cleanup any sandboxes created during tests
    for (const dir of createdDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // may already be cleaned up
      }
    }
    createdDirs = [];
  });

  describe('createSandbox (mode=current)', () => {
    it('should return cwd as the working directory with no temp dir', async () => {
      const result = await createSandbox({
        mode: 'current',
        originalWorkingDir: process.cwd(),
        artifactPath: '',
      });

      expect(result.workingDirectory).toBe(process.cwd());
      expect(result.tempDir).toBeUndefined();
      expect(result.needsCleanup).toBe(false);
    });
  });

  describe('createSandbox (mode=strict)', () => {
    it('should create a temp directory when a git commit is specified', async () => {
      // Use the current repo's HEAD commit so the checkout will succeed
      const { spawnSync } = require('child_process');
      const headResult = spawnSync('git', ['rev-parse', 'HEAD'], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
      const commit = headResult.stdout.trim();

      const result = await createSandbox({
        mode: 'strict',
        originalWorkingDir: process.cwd(),
        artifactPath: '',
        gitCommit: commit,
      });

      if (result.tempDir) createdDirs.push(result.tempDir);

      expect(result.tempDir).toBeDefined();
      expect(result.needsCleanup).toBe(true);
      expect(result.workingDirectory).not.toBe(process.cwd());
      expect(fs.existsSync(result.workingDirectory)).toBe(true);
    }, 30000);

    it('should fall back to artifact files when git commit is unavailable', async () => {
      // Create a fake artifact with files
      const tmpArtifact = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-test-'));
      createdDirs.push(tmpArtifact);

      const filesDir = path.join(tmpArtifact, 'files');
      fs.mkdirSync(filesDir, { recursive: true });
      fs.writeFileSync(path.join(filesDir, 'test.txt'), 'hello');

      const result = await createSandbox({
        mode: 'strict',
        originalWorkingDir: '/nonexistent/path',
        artifactPath: tmpArtifact,
        gitCommit: 'deadbeef1234567890deadbeef1234567890dead',
      });

      if (result.tempDir) createdDirs.push(result.tempDir);

      expect(result.tempDir).toBeDefined();
      expect(result.needsCleanup).toBe(true);
      expect(result.usedFallback).toBe(true);
      // The files from the artifact should have been copied
      expect(fs.existsSync(path.join(result.workingDirectory, 'test.txt'))).toBe(true);
    });
  });

  describe('createSandbox (mode=branch)', () => {
    it('should create a worktree for the specified branch', async () => {
      const { spawnSync } = require('child_process');
      const branchResult = spawnSync('git', ['branch', '--show-current'], {
        cwd: process.cwd(),
        encoding: 'utf-8',
      });
      const currentBranch = branchResult.stdout.trim();

      const result = await createSandbox({
        mode: 'branch',
        originalWorkingDir: process.cwd(),
        artifactPath: '',
        gitBranch: currentBranch,
      });

      if (result.tempDir) createdDirs.push(result.tempDir);

      expect(result.tempDir).toBeDefined();
      expect(result.needsCleanup).toBe(true);
      expect(fs.existsSync(result.workingDirectory)).toBe(true);
    }, 30000);

    it('should fall back to current mode when no branch is specified', async () => {
      const result = await createSandbox({
        mode: 'branch',
        originalWorkingDir: process.cwd(),
        artifactPath: '',
      });

      // No branch given, so it should behave like current
      expect(result.workingDirectory).toBe(process.cwd());
      expect(result.needsCleanup).toBe(false);
    });
  });

  describe('cleanupSandbox', () => {
    it('should remove the temp directory when needsCleanup is true', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-cleanup-'));
      expect(fs.existsSync(tmpDir)).toBe(true);

      cleanupSandbox({ workingDirectory: tmpDir, tempDir: tmpDir, needsCleanup: true });

      expect(fs.existsSync(tmpDir)).toBe(false);
    });

    it('should not throw when tempDir does not exist', () => {
      expect(() =>
        cleanupSandbox({
          workingDirectory: '/nonexistent',
          tempDir: '/nonexistent',
          needsCleanup: true,
        }),
      ).not.toThrow();
    });

    it('should do nothing when needsCleanup is false', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-noclean-'));
      createdDirs.push(tmpDir); // manual cleanup

      cleanupSandbox({ workingDirectory: tmpDir, tempDir: tmpDir, needsCleanup: false });

      expect(fs.existsSync(tmpDir)).toBe(true);
    });
  });
});
