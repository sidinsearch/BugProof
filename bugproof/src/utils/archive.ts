import * as fs from 'fs';
import archiver from 'archiver';
import extract from 'extract-zip';

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
    await extract(zipPath, { dir: destDir });
  } catch (err) {
    throw new Error(`Failed to extract artifact: ${err instanceof Error ? err.message : err}`);
  }
}
