export interface ArtifactManifest {
  version: string;
  bugproof_version: string;
  name: string;
  description: string;
  captured_at: string;
  captured_on: CapturedPlatformContext;
  command: string[];
  working_directory: string;
  exit_code: number;
  duration_ms: number;
  files_count: number;
  files_size_bytes: number;
  secrets_detected: boolean;
  secrets_skipped: string[];
}

interface CapturedPlatformContext {
  os: string;
  arch: string;
  node_version: string;
  git_commit?: string;
  git_branch?: string;
  git_dirty?: boolean;
}

export interface EnvSchema {
  required: string[];
  optional: string[];
  secrets: string[];
  captured_env_keys: string[];
}

export interface RunConfig {
  command: string[];
  working_directory: string;
  environment: Record<string, string>;
  timeout_ms: number;
  capture_output: boolean;
}

export interface ArtifactMetadata {
  capture_tool_version: string;
  captured_at: string;
  captured_by: string;
  captured_platform: {
    os: string;
    os_version: string;
    arch: string;
    cpu_count: number;
    memory_gb: number;
  };
  project_context: {
    git_repo?: string;
    git_commit?: string;
    git_branch?: string;
    git_dirty?: boolean;
    git_tags?: string[];
  };
}
