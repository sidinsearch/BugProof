import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export function pruneTempDirectories(): { prunedCount: number; prunedBytes: number } {
  const tmpDir = os.tmpdir();
  let prunedCount = 0;
  let prunedBytes = 0;

  try {
    const entries = fs.readdirSync(tmpDir);
    const prefixes = ['bugproof-pkg-', 'bugproof-extract-', 'bugproof-diff-', 'bugbox-'];
    
    for (const entry of entries) {
      if (!prefixes.some(p => entry.startsWith(p))) continue;
      
      const fullPath = path.join(tmpDir, entry);
      try {
        // Skip files/folders created within the last 5 minutes to avoid deleting active sessions
        const stats = fs.statSync(fullPath);
        if (Date.now() - stats.mtimeMs < 5 * 60 * 1000) continue;
        
        const size = calculateSize(fullPath);
        
        fs.rmSync(fullPath, { recursive: true, force: true });
        prunedCount++;
        prunedBytes += size;
      } catch {
        // Ignore if unable to access/delete
      }
    }
  } catch {
    // Ignore tmp dir read errors
  }

  return { prunedCount, prunedBytes };
}

function calculateSize(dirPath: string): number {
  let size = 0;
  try {
    const stats = fs.statSync(dirPath);
    if (stats.isFile()) {
        return stats.size;
    }
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      size += calculateSize(fullPath);
    }
  } catch {
    // ignore
  }
  return size;
}
