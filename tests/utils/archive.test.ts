import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { zipDirectory, extractZip } from '../../src/utils/archive';

describe('Archive Utilities', () => {
  let tempDir: string;
  let srcDir: string;
  let destDir: string;
  let zipPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-archive-test-'));
    srcDir = path.join(tempDir, 'src');
    destDir = path.join(tempDir, 'dest');
    zipPath = path.join(tempDir, 'test.bug');

    fs.mkdirSync(srcDir);
    fs.writeFileSync(path.join(srcDir, 'test.txt'), 'hello bugproof');
    
    const nested = path.join(srcDir, 'nested');
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, 'deep.txt'), 'deep content');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should compress a directory and extract it preserving structure', async () => {
    // 1. Zip it
    await zipDirectory(srcDir, zipPath);
    expect(fs.existsSync(zipPath)).toBe(true);

    const stats = fs.statSync(zipPath);
    expect(stats.size).toBeGreaterThan(0);

    // 2. Extract it
    await extractZip(zipPath, destDir);
    expect(fs.existsSync(destDir)).toBe(true);

    // 3. Verify contents
    const rootTxt = fs.readFileSync(path.join(destDir, 'test.txt'), 'utf-8');
    expect(rootTxt).toBe('hello bugproof');

    const deepTxt = fs.readFileSync(path.join(destDir, 'nested', 'deep.txt'), 'utf-8');
    expect(deepTxt).toBe('deep content');
  });
});
