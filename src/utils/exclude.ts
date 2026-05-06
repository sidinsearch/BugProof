/**
 * Filters a list of file paths by removing any that match the given exclude
 * glob patterns. Uses a simple glob matcher (no external dependency).
 *
 * Supported patterns:
 *   - `**`         matches everything
 *   - `dir/**`     matches any file under `dir/`
 *   - `*.ext`      matches files ending in `.ext` (at any depth)
 *   - `exact.file` matches the literal filename
 */
export function filterByExcludePatterns(files: string[], excludePatterns: string[]): string[] {
  if (excludePatterns.length === 0) return files;

  const matchers = excludePatterns.map(p => patternToMatcher(p));

  return files.filter(filePath => {
    return !matchers.some(match => match(filePath));
  });
}

/**
 * Converts a glob-like pattern string to a predicate function.
 */
function patternToMatcher(pattern: string): (filePath: string) => boolean {
  // Normalize separators
  const normalized = pattern.replace(/\\/g, '/');

  // "**" matches everything
  if (normalized === '**') {
    return () => true;
  }

  // "dir/**" matches anything under dir/
  if (normalized.endsWith('/**')) {
    const prefix = normalized.slice(0, -3); // strip "/**"
    return (filePath: string) => filePath.startsWith(prefix + '/') || filePath === prefix;
  }

  // "*.ext" matches any file with that extension (at any depth)
  if (normalized.startsWith('*.')) {
    const ext = normalized.slice(1); // e.g. ".json"
    return (filePath: string) => filePath.endsWith(ext);
  }

  // Exact match (e.g. ".env", ".env.local")
  return (filePath: string) => filePath === normalized;
}
