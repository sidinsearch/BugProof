/**
 * Structured JSON output formatters for CI integration.
 * When --json is passed, the CLI prints these instead of human-readable output.
 */

import { ArtifactManifest } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';
import { Verdict } from '../replay/verdict.js';
import { FileEntry } from '../capture/packager.js';

// ─── Capture ─────────────────────────────────────────────────────────────────

export interface CaptureJsonInput {
  manifest: ArtifactManifest;
  failure: FailureRecord;
  artifactPath: string;
  filesCount: number;
  totalSize: number;
}

export function formatCaptureJson(input: CaptureJsonInput): string {
  return JSON.stringify({
    success: true,
    artifact: {
      name: input.manifest.name,
      path: input.artifactPath,
      version: input.manifest.bugproof_version,
      captured_at: input.manifest.captured_at,
    },
    failure: {
      exit_code: input.failure.exit_code,
      fingerprint: input.failure.fingerprint,
      error_patterns: input.failure.error_patterns,
      duration_ms: input.failure.duration_ms,
      timeout: input.failure.timeout,
    },
    files: {
      count: input.filesCount,
      total_size_bytes: input.totalSize,
    },
    command: input.manifest.command,
    platform: input.manifest.captured_on,
  }, null, 2);
}

// ─── Replay ──────────────────────────────────────────────────────────────────

export interface ReplayJsonInput {
  verdict: Verdict;
  expectedExitCode: number;
  actualExitCode: number;
  artifactName: string;
  bugBox?: {
    level: string;
    appliedLayers: string[];
    skippedLayers: string[];
    platform: string;
  };
}

export function formatReplayJson(input: ReplayJsonInput): string {
  return JSON.stringify({
    reproduced: input.verdict.status === 'confirmed',
    verdict: {
      status: input.verdict.status,
      message: input.verdict.message,
    },
    expected_exit_code: input.expectedExitCode,
    actual_exit_code: input.actualExitCode,
    artifact: input.artifactName,
    bugBox: input.bugBox,
  }, null, 2);
}

// ─── Inspect ─────────────────────────────────────────────────────────────────

export interface InspectJsonInput {
  manifest: ArtifactManifest;
  failure: FailureRecord;
  files: FileEntry[];
}

export function formatInspectJson(input: InspectJsonInput): string {
  return JSON.stringify({
    manifest: input.manifest,
    failure: input.failure,
    files: input.files,
  }, null, 2);
}
