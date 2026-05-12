/**
 * Diff engine: compares two .bug artifacts and produces a structured diff report.
 */

import { ArtifactManifest } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';
import { FileEntry } from '../capture/packager.js';

interface DiffChange {
  field: string;
  left: unknown;
  right: unknown;
}

interface FileChanges {
  added: string[];
  removed: string[];
  modified: string[];
}

export interface DiffResult {
  identical: boolean;
  changes: DiffChange[];
  fileChanges?: FileChanges;
}

export interface ArtifactSnapshot {
  manifest: ArtifactManifest;
  failure: FailureRecord;
  files: FileEntry[];
}

export function diffArtifacts(left: ArtifactSnapshot, right: ArtifactSnapshot): DiffResult {
  const changes: DiffChange[] = [];

  // Compare exit code
  if (left.failure.exit_code !== right.failure.exit_code) {
    changes.push({ field: 'exit_code', left: left.failure.exit_code, right: right.failure.exit_code });
  }

  // Compare fingerprint
  if (left.failure.fingerprint !== right.failure.fingerprint) {
    changes.push({ field: 'fingerprint', left: left.failure.fingerprint, right: right.failure.fingerprint });
  }

  // Compare command
  const leftCmd = left.manifest.command.join(' ');
  const rightCmd = right.manifest.command.join(' ');
  if (leftCmd !== rightCmd) {
    changes.push({ field: 'command', left: leftCmd, right: rightCmd });
  }

  // Compare OS
  if (left.manifest.captured_on.os !== right.manifest.captured_on.os) {
    changes.push({ field: 'os', left: left.manifest.captured_on.os, right: right.manifest.captured_on.os });
  }

  // Compare architecture
  if (left.manifest.captured_on.arch !== right.manifest.captured_on.arch) {
    changes.push({ field: 'arch', left: left.manifest.captured_on.arch, right: right.manifest.captured_on.arch });
  }

  // Compare Node version
  if (left.manifest.captured_on.node_version !== right.manifest.captured_on.node_version) {
    changes.push({
      field: 'node_version',
      left: left.manifest.captured_on.node_version,
      right: right.manifest.captured_on.node_version,
    });
  }

  // Compare error patterns
  const leftPatterns = JSON.stringify(left.failure.error_patterns);
  const rightPatterns = JSON.stringify(right.failure.error_patterns);
  if (leftPatterns !== rightPatterns) {
    changes.push({
      field: 'error_patterns',
      left: left.failure.error_patterns,
      right: right.failure.error_patterns,
    });
  }

  // Compare duration (only if significantly different, >20%)
  const durationDiff = Math.abs(left.failure.duration_ms - right.failure.duration_ms);
  const avgDuration = (left.failure.duration_ms + right.failure.duration_ms) / 2;
  if (avgDuration > 0 && durationDiff / avgDuration > 0.2) {
    changes.push({ field: 'duration_ms', left: left.failure.duration_ms, right: right.failure.duration_ms });
  }

  // Compare file lists
  const fileChanges = diffFileEntries(left.files, right.files);
  const hasFileChanges =
    fileChanges.added.length > 0 || fileChanges.removed.length > 0 || fileChanges.modified.length > 0;

  return {
    identical: changes.length === 0 && !hasFileChanges,
    changes,
    fileChanges: hasFileChanges ? fileChanges : { added: [], removed: [], modified: [] },
  };
}

function diffFileEntries(leftFiles: FileEntry[], rightFiles: FileEntry[]): FileChanges {
  const leftMap = new Map(leftFiles.map(f => [f.path, f]));
  const rightMap = new Map(rightFiles.map(f => [f.path, f]));

  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  // Files in right but not in left => added
  for (const [path] of rightMap) {
    if (!leftMap.has(path)) {
      added.push(path);
    }
  }

  // Files in left but not in right => removed
  for (const [path] of leftMap) {
    if (!rightMap.has(path)) {
      removed.push(path);
    }
  }

  // Files in both but with different hashes => modified
  for (const [path, leftEntry] of leftMap) {
    const rightEntry = rightMap.get(path);
    if (rightEntry && leftEntry.sha256 !== rightEntry.sha256) {
      modified.push(path);
    }
  }

  return { added, removed, modified };
}
