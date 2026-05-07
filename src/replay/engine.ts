import { RunConfig } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';
import { executeAndCapture } from '../capture/engine.js';
import { createBugBox, BugBoxResult } from '../sandbox/bugbox.js';
import { sanitizeArtifactEnvironment } from '../utils/security.js';
import { detectCrossPlatform, translateCommand, translateEnvironment } from '../sandbox/cross-platform.js';

export interface ReplayOptions {
  artifactPath: string;
  versionMatch: 'strict' | 'current' | 'branch';
  envOverrides: Record<string, string>;
  /** Git commit from the artifact manifest (used for strict mode) */
  gitCommit?: string;
  /** Git branch from the artifact manifest (used for branch mode) */
  gitBranch?: string;
  sandboxLevel?: 'workspace' | 'isolated' | 'full';
  /** Platform the artifact was captured on (for cross-platform translation) */
  capturedPlatform?: string;
}

export interface ReplayResult {
  actualFailure: FailureRecord;
  expectedFailure: FailureRecord;
  actualStdout: string;
  actualStderr: string;
  /** The directory where replay actually ran */
  replayDirectory: string;
  /** Whether the sandbox fell back to artifact file snapshots */
  usedFallback?: boolean;
  /** Sandbox architecture layers applied */
  bugBox?: {
    level: string;
    appliedLayers: string[];
    skippedLayers: string[];
    platform: string;
  };
  /** Cross-platform translation info */
  crossPlatform?: {
    needsTranslation: boolean;
    translations: string[];
    warnings: string[];
    blockers: string[];
  };
}

/**
 * Replays a captured artifact in an isolated sandbox.
 *
 * Three modes:
 *   - current: runs in cwd (no sandbox, fast)
 *   - strict:  creates temp dir at the exact git commit, falls back to artifact files/
 *   - branch:  creates temp dir at the branch tip, falls back to current
 *
 * The sandbox is always cleaned up after the command finishes.
 */
export async function replayArtifact(
  runConfig: RunConfig,
  expectedFailure: FailureRecord,
  options: ReplayOptions,
): Promise<ReplayResult> {
  // 1. Create the sandbox workspace via Bug-Box orchestrator
  const bugbox: BugBoxResult = await createBugBox({
    level: options.sandboxLevel || 'workspace',
    command: runConfig.command,
    sandboxOptions: {
      mode: options.versionMatch,
      originalWorkingDir: runConfig.working_directory,
      artifactPath: options.artifactPath,
      gitCommit: options.gitCommit,
      gitBranch: options.gitBranch,
    },
  });

  try {
    // 2. Cross-platform detection and translation
    const capturedPlatform = options.capturedPlatform || process.platform;
    const crossPlatform = detectCrossPlatform(capturedPlatform);

    let replayCommand = runConfig.command;
    const allTranslations: string[] = [];
    const allBlockers: string[] = [];

    if (crossPlatform.needsTranslation) {
      const cmdTranslation = translateCommand(replayCommand, capturedPlatform);
      replayCommand = cmdTranslation.command;
      allTranslations.push(...cmdTranslation.translations);
      allBlockers.push(...cmdTranslation.blockers);
    }

    // 3. Merge environments — sanitize artifact env to block dangerous overrides
    const safeArtifactEnv = sanitizeArtifactEnvironment(runConfig.environment);
    let replayEnv = {
      ...process.env,
      ...safeArtifactEnv,
      ...options.envOverrides,
    } as Record<string, string>;

    // Apply cross-platform environment translation
    if (crossPlatform.needsTranslation) {
      const envTranslation = translateEnvironment(replayEnv, capturedPlatform);
      replayEnv = envTranslation.environment;
      allTranslations.push(...envTranslation.translations);
    }

    const hostPath = process.env.PATH || process.env.Path || process.env.path;
    if (hostPath) {
      replayEnv.PATH = hostPath;
      if (process.platform === 'win32') {
        replayEnv.Path = hostPath;
      }
    }

    // 4. Re-run the command in the sandbox directory
    const replayConfig: RunConfig = {
      ...runConfig,
      ...bugbox.runConfigOverrides,
      command: replayCommand,
      environment: replayEnv,
    };

    const result = await executeAndCapture(replayConfig);

    return {
      actualFailure: result.failure,
      expectedFailure,
      actualStdout: result.stdout,
      actualStderr: result.stderr,
      replayDirectory: bugbox.sandboxResult.workingDirectory,
      usedFallback: bugbox.sandboxResult.usedFallback,
      bugBox: {
        level: options.sandboxLevel || 'workspace',
        appliedLayers: bugbox.appliedLayers,
        skippedLayers: bugbox.skippedLayers,
        platform: bugbox.capabilities.platform,
      },
      crossPlatform: crossPlatform.needsTranslation ? {
        needsTranslation: true,
        translations: allTranslations,
        warnings: crossPlatform.warnings,
        blockers: allBlockers,
      } : undefined,
    };
  } finally {
    // 4. Always clean up the sandbox
    bugbox.cleanupFn();
  }
}
