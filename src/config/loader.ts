/**
 * Project-level configuration loader.
 * Reads .bugproofrc (JSON) from the project root or any parent directory.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BugProofConfig {
  /** Glob patterns to exclude from artifact file capture */
  exclude: string[];
  /** Default artifact output directory (relative to cwd) */
  outputDir: string;
  /** Default timeout in ms */
  timeout: number;
  /** Whether to skip secret scanning */
  skipSecrets: boolean;
  /** Whether to include untracked files */
  includeUntracked: boolean;
  /** Watch mode: auto-capture only on failure (vs always capture) */
  watchOnlyOnFailure: boolean;
  /** Maximum artifact size in MB */
  maxArtifactSizeMB: number;
  /** Custom name template for artifacts (supports {timestamp}, {command}, {exit_code}) */
  nameTemplate: string;
}

const DEFAULTS: BugProofConfig = {
  exclude: ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'coverage/**', '*.bug'],
  outputDir: '.',
  timeout: 300000,
  skipSecrets: false,
  includeUntracked: false,
  watchOnlyOnFailure: true,
  maxArtifactSizeMB: 50,
  nameTemplate: 'bug_{timestamp}',
};

const CONFIG_FILENAME = '.bugproofrc';

/**
 * Searches for .bugproofrc from the given directory upwards.
 * Returns the merged config (file values override defaults).
 */
export function loadConfig(startDir: string = process.cwd()): BugProofConfig {
  const configPath = findConfigFile(startDir);
  if (!configPath) {
    return { ...DEFAULTS };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      // Merge arrays (user's exclude adds to defaults, not replaces)
      exclude: parsed.exclude
        ? [...new Set([...DEFAULTS.exclude, ...parsed.exclude])]
        : DEFAULTS.exclude,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Finds the nearest .bugproofrc file by walking up from startDir.
 */
export function findConfigFile(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;

  while (true) {
    const candidate = path.join(dir, CONFIG_FILENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === root) {
      return null;
    }
    dir = parent;
  }
}

/**
 * Generates a default .bugproofrc content for `bugproof init`.
 */
export function generateDefaultConfig(): string {
  const config = {
    exclude: ['node_modules/**', '.git/**', 'dist/**', 'build/**', 'coverage/**', '*.bug'],
    outputDir: '.',
    timeout: 300000,
    skipSecrets: false,
    includeUntracked: false,
    watchOnlyOnFailure: true,
    maxArtifactSizeMB: 50,
    nameTemplate: 'bug_{timestamp}',
  };
  return JSON.stringify(config, null, 2) + '\n';
}

/**
 * Applies a name template to generate an artifact filename.
 */
export function applyNameTemplate(
  template: string,
  vars: { timestamp: number; command: string; exit_code: number },
): string {
  return template
    .replace('{timestamp}', String(vars.timestamp))
    .replace('{command}', vars.command.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30))
    .replace('{exit_code}', String(vars.exit_code));
}
