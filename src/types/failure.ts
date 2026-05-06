export interface FailureRecord {
  exit_code: number;
  signal: string | null;
  stdout_lines: number;
  stderr_lines: number;
  stderr_snippet: string;
  fingerprint: string;
  error_patterns: string[];
  duration_ms: number;
  timeout: boolean;
}
