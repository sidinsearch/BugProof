import { spawnSync } from 'child_process';
import { RunConfig } from '../types/artifact';
import { FailureRecord } from '../types/failure';
import { executeAndCapture } from '../capture/engine';

export interface ReplayOptions {
  artifactPath: string;
  versionMatch: 'strict' | 'current' | 'branch';
  envOverrides: Record<string, string>;
}

export interface ReplayResult {
  actualFailure: FailureRecord;
  expectedFailure: FailureRecord;
  actualStdout: string;
  actualStderr: string;
}

/**
 * Replays a captured artifact.
 * For v0.1, we assume the user has already checked out the right commit
 * and we just run the command in the current directory.
 * (In a later version, this would handle temp directories and git checkouts).
 */
export async function replayArtifact(runConfig: RunConfig, expectedFailure: FailureRecord, options: ReplayOptions): Promise<ReplayResult> {
  // Merge environments
  const replayEnv = { ...process.env, ...runConfig.environment, ...options.envOverrides } as Record<string, string>;
  
  // Re-run the command
  const replayConfig: RunConfig = {
    ...runConfig,
    environment: replayEnv,
    // We execute in the current directory for now, acting as the replay host
    working_directory: process.cwd() 
  };
  
  const result = await executeAndCapture(replayConfig);
  
  return {
    actualFailure: result.failure,
    expectedFailure,
    actualStdout: result.stdout,
    actualStderr: result.stderr
  };
}
