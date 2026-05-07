import { ArtifactManifest, RunConfig } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';

const MAX_JSON_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 32;
const MAX_COMMAND_ARGS = 256;
const MAX_STRING_LENGTH = 8192;

const MANIFEST_KEYS = new Set([
  'version',
  'bugproof_version',
  'name',
  'description',
  'captured_at',
  'captured_on',
  'command',
  'working_directory',
  'exit_code',
  'duration_ms',
  'files_count',
  'files_size_bytes',
  'secrets_detected',
  'secrets_skipped',
]);

const CAPTURED_ON_KEYS = new Set([
  'os',
  'arch',
  'node_version',
  'git_commit',
  'git_branch',
  'git_dirty',
]);

const RUN_CONFIG_KEYS = new Set([
  'command',
  'working_directory',
  'environment',
  'timeout_ms',
  'capture_output',
]);

const FAILURE_KEYS = new Set([
  'exit_code',
  'signal',
  'stdout_lines',
  'stderr_lines',
  'stderr_snippet',
  'fingerprint',
  'error_patterns',
  'duration_ms',
  'timeout',
]);

function ensureObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function ensureNoUnknownKeys(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unknown field: ${key}`);
    }
  }
}

function ensureString(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string`);
  }
  if (value.length > MAX_STRING_LENGTH) {
    throw new Error(`${label} exceeds maximum length`);
  }
  return value;
}

function ensureOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return ensureString(value, label);
}

function ensureNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function ensureBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean`);
  }
  return value;
}

function ensureStringArray(value: unknown, label: string, maxItems = MAX_COMMAND_ARGS): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  if (value.length === 0 || value.length > maxItems) {
    throw new Error(`${label} has invalid number of items`);
  }
  return value.map((item, index) => ensureString(item, `${label}[${index}]`));
}

function ensureOptionalStringArray(value: unknown, label: string, maxItems = MAX_COMMAND_ARGS): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }
  if (value.length > maxItems) {
    throw new Error(`${label} has too many items`);
  }
  return value.map((item, index) => ensureString(item, `${label}[${index}]`));
}

function ensurePlainEnvironment(value: unknown): Record<string, string> {
  const env = ensureObject(value, 'run.environment');
  const safe: Record<string, string> = {};
  for (const [key, raw] of Object.entries(env)) {
    if (!key || key.length > 128 || /[\r\n\0]/.test(key)) {
      throw new Error(`run.environment contains invalid key: ${key}`);
    }
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`run.environment contains disallowed key: ${key}`);
    }
    safe[key] = ensureString(raw, `run.environment.${key}`);
  }
  return safe;
}

function assertMaxDepth(value: unknown, depth = 0): void {
  if (depth > MAX_JSON_DEPTH) {
    throw new Error('JSON exceeds maximum nesting depth');
  }
  if (Array.isArray(value)) {
    value.forEach((item) => assertMaxDepth(item, depth + 1));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach((item) => assertMaxDepth(item, depth + 1));
  }
}

export function secureJsonParse(raw: string, label: string): unknown {
  if (raw.length > MAX_JSON_BYTES) {
    throw new Error(`${label} exceeds maximum size`);
  }

  const parsed = JSON.parse(raw, (key: string, value: unknown) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw new Error(`${label} contains disallowed key: ${key}`);
    }
    return value;
  });

  assertMaxDepth(parsed);
  return parsed;
}

export function validateArtifactManifest(value: unknown): ArtifactManifest {
  const manifest = ensureObject(value, 'manifest');
  ensureNoUnknownKeys(manifest, MANIFEST_KEYS, 'manifest');

  const capturedOnRaw = ensureObject(manifest.captured_on, 'manifest.captured_on');
  ensureNoUnknownKeys(capturedOnRaw, CAPTURED_ON_KEYS, 'manifest.captured_on');

  return {
    version: ensureString(manifest.version, 'manifest.version'),
    bugproof_version: ensureString(manifest.bugproof_version, 'manifest.bugproof_version'),
    name: ensureString(manifest.name, 'manifest.name'),
    description: ensureString(manifest.description, 'manifest.description'),
    captured_at: ensureString(manifest.captured_at, 'manifest.captured_at'),
    captured_on: {
      os: ensureString(capturedOnRaw.os, 'manifest.captured_on.os'),
      arch: ensureString(capturedOnRaw.arch, 'manifest.captured_on.arch'),
      node_version: ensureString(capturedOnRaw.node_version, 'manifest.captured_on.node_version'),
      git_commit: ensureOptionalString(capturedOnRaw.git_commit, 'manifest.captured_on.git_commit'),
      git_branch: ensureOptionalString(capturedOnRaw.git_branch, 'manifest.captured_on.git_branch'),
      git_dirty: capturedOnRaw.git_dirty === undefined
        ? undefined
        : ensureBoolean(capturedOnRaw.git_dirty, 'manifest.captured_on.git_dirty'),
    },
    command: ensureStringArray(manifest.command, 'manifest.command'),
    working_directory: ensureString(manifest.working_directory, 'manifest.working_directory'),
    exit_code: ensureNumber(manifest.exit_code, 'manifest.exit_code'),
    duration_ms: ensureNumber(manifest.duration_ms, 'manifest.duration_ms'),
    files_count: ensureNumber(manifest.files_count, 'manifest.files_count'),
    files_size_bytes: ensureNumber(manifest.files_size_bytes, 'manifest.files_size_bytes'),
    secrets_detected: ensureBoolean(manifest.secrets_detected, 'manifest.secrets_detected'),
    secrets_skipped: ensureOptionalStringArray(manifest.secrets_skipped, 'manifest.secrets_skipped'),
  };
}

export function validateRunConfig(value: unknown): RunConfig {
  const run = ensureObject(value, 'run');
  ensureNoUnknownKeys(run, RUN_CONFIG_KEYS, 'run');

  const timeoutMs = ensureNumber(run.timeout_ms, 'run.timeout_ms');
  if (timeoutMs <= 0 || timeoutMs > 60 * 60 * 1000) {
    throw new Error('run.timeout_ms out of range');
  }

  return {
    command: ensureStringArray(run.command, 'run.command'),
    working_directory: ensureString(run.working_directory, 'run.working_directory'),
    environment: ensurePlainEnvironment(run.environment),
    timeout_ms: timeoutMs,
    capture_output: ensureBoolean(run.capture_output, 'run.capture_output'),
  };
}

export function validateFailureRecord(value: unknown): FailureRecord {
  const failure = ensureObject(value, 'failure');
  ensureNoUnknownKeys(failure, FAILURE_KEYS, 'failure');

  const signal = failure.signal;
  if (!(signal === null || typeof signal === 'string')) {
    throw new Error('failure.signal must be null or string');
  }

  return {
    exit_code: ensureNumber(failure.exit_code, 'failure.exit_code'),
    signal,
    stdout_lines: ensureNumber(failure.stdout_lines, 'failure.stdout_lines'),
    stderr_lines: ensureNumber(failure.stderr_lines, 'failure.stderr_lines'),
    stderr_snippet: ensureString(failure.stderr_snippet, 'failure.stderr_snippet'),
    fingerprint: ensureString(failure.fingerprint, 'failure.fingerprint'),
    error_patterns: ensureOptionalStringArray(failure.error_patterns, 'failure.error_patterns'),
    duration_ms: ensureNumber(failure.duration_ms, 'failure.duration_ms'),
    timeout: ensureBoolean(failure.timeout, 'failure.timeout'),
  };
}