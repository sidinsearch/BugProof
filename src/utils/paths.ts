import * as path from 'path';

/**
 * Normalizes a path to consistently use forward slashes (/) across all platforms.
 * This ensures artifact portability between Windows, Linux, and macOS.
 */
export function normalizeArtifactPath(p: string): string {
  // Use posix-style normalization for the artifact internal representations
  return p.split(path.sep).join(path.posix.sep);
}

/**
 * Converts a portable artifact path back to the platform-specific path separator.
 * Useful during replay on a host machine.
 */
export function toPlatformPath(artifactPath: string): string {
  return artifactPath.split(path.posix.sep).join(path.sep);
}

/**
 * Reconstructs the absolute path on the host during replay,
 * mapping the original absolute path to a temporary replay directory.
 * 
 * @param originalPath The absolute path captured in the artifact
 * @param tempReplayRoot The root of the temporary replay environment
 */
export function mapToReplayEnvironment(originalPath: string, tempReplayRoot: string): string {
  // Strip the leading root from the original path (e.g. C:\ or /)
  // so it can be appended safely to the temp root.
  
  // Handle Windows absolute paths (e.g., D:\path\to\file or C:/path/to/file)
  // regardless of the current platform, since artifact paths may be cross-platform
  const windowsAbsolutePattern = /^[A-Z]:[/\\]/i;
  if (windowsAbsolutePattern.test(originalPath)) {
    // Strip the drive letter and colon (e.g., "D:\" -> "")
    const pathWithoutRoot = originalPath.slice(2);
    // Normalize to forward slashes for cross-platform consistency
    const normalized = pathWithoutRoot.split(path.sep).join(path.posix.sep);
    return path.posix.join(tempReplayRoot, normalized);
  }
  
  // Handle Unix absolute paths
  const parsed = path.parse(originalPath);
  const pathWithoutRoot = originalPath.slice(parsed.root.length);
  return path.join(tempReplayRoot, pathWithoutRoot);
}
