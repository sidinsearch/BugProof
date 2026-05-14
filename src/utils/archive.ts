import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import archiver from 'archiver';
import extract from 'extract-zip';
import { isPathWithinBoundary } from './security.js';

const MAX_ARCHIVE_FILES = 10000;
const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
const MAX_SINGLE_FILE_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;

export function validateArchiveEntryPath(entryName: string, destDir: string): void {
  if (!entryName || path.isAbsolute(entryName) || entryName.includes('\0')) {
    throw new Error(`Invalid archive entry path: ${entryName}`);
  }

  const normalized = path.resolve(destDir, entryName);
  if (!isPathWithinBoundary(normalized, destDir)) {
    throw new Error(`Path traversal attempt detected: ${entryName}`);
  }
}

/**
 * Compresses a directory into a ZIP archive.
 * @param sourceDir The directory to compress.
 * @param outPath The destination path for the ZIP file.
 */
export async function zipDirectory(sourceDir: string, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 }, // Maximum compression
    });

    const stream = fs.createWriteStream(outPath);

    stream.on('close', () => {
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(stream);
    archive.directory(sourceDir, false); // false means put contents at root of zip
    archive.finalize();
  });
}

/**
 * Extracts a ZIP archive to a destination directory.
 * @param zipPath The path to the ZIP file.
 * @param destDir The target extraction directory (must be absolute).
 */
export async function extractZip(zipPath: string, destDir: string): Promise<void> {
  try {
    const resolvedDest = path.resolve(destDir);
    let fileCount = 0;
    let totalSize = 0;

    await extract(zipPath, {
      dir: resolvedDest,
      onEntry: (entry) => {
        fileCount += 1;
        if (fileCount > MAX_ARCHIVE_FILES) {
          throw new Error('Archive contains too many files');
        }

        const entryName = entry.fileName || '';
        validateArchiveEntryPath(entryName, resolvedDest);

        const size = typeof entry.uncompressedSize === 'number' ? entry.uncompressedSize : 0;
        if (size > MAX_SINGLE_FILE_UNCOMPRESSED_BYTES) {
          throw new Error(`Archive entry too large: ${entryName}`);
        }
        totalSize += size;
        if (totalSize > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
          throw new Error('Archive uncompressed size limit exceeded');
        }

        if (entry.externalFileAttributes !== undefined) {
          const mode = (entry.externalFileAttributes >> 16) & 0o170000;
          if (mode === 0o120000) {
            throw new Error(`Symbolic links are not allowed in archives: ${entryName}`);
          }
        }
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const extractError = new Error(`Failed to extract artifact: ${error.message}`);
    extractError.cause = error;
    throw extractError;
  }
}

export interface ExtractedArtifact {
  targetDir: string;
  cleanup: () => void;
}

export async function extractArtifactIfNeeded(artifactPath: string): Promise<ExtractedArtifact> {
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact not found: ${artifactPath}`);
  }

  const stat = fs.statSync(artifactPath);
  if (!stat.isFile()) {
    return { targetDir: artifactPath, cleanup: () => {} };
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bugproof-extract-'));
  try {
    await extractZip(artifactPath, tempDir);
  } catch (err) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    const error = err instanceof Error ? err : new Error(String(err));
    const extractError = new Error(`Failed to extract artifact: ${error.message}`);
    extractError.cause = error;
    throw extractError;
  }
  return {
    targetDir: tempDir,
    cleanup: () => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}
