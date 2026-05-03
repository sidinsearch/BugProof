import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { ArtifactManifest, EnvSchema, RunConfig, ArtifactMetadata } from '../types/artifact';
import { FailureRecord } from '../types/failure';

export interface PackageOptions {
  manifest: ArtifactManifest;
  envSchema: EnvSchema;
  runConfig: RunConfig;
  metadata: ArtifactMetadata;
  failure: FailureRecord;
  stdout: string;
  stderr: string;
  includeUntracked?: boolean;
}

/**
 * Packages the artifact into the .bug directory format specified in DESIGN.md.
 * 
 * 1. Creates the directory
 * 2. Writes the JSON schema files
 * 3. Copies the source files (respecting .gitignore)
 * 4. Writes the logs
 */
export async function packageArtifact(artifactPath: string, options: PackageOptions): Promise<void> {
  // 1. Create artifact directory
  fs.mkdirSync(artifactPath, { recursive: true });

  // 2. Write schema files
  fs.writeFileSync(path.join(artifactPath, 'manifest.json'), JSON.stringify(options.manifest, null, 2));
  fs.writeFileSync(path.join(artifactPath, 'env.schema.json'), JSON.stringify(options.envSchema, null, 2));
  fs.writeFileSync(path.join(artifactPath, 'metadata.json'), JSON.stringify(options.metadata, null, 2));
  fs.writeFileSync(path.join(artifactPath, 'run.json'), JSON.stringify(options.runConfig, null, 2));
  fs.writeFileSync(path.join(artifactPath, 'failure.json'), JSON.stringify(options.failure, null, 2));

  // 3. Write Logs
  const logsDir = path.join(artifactPath, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(path.join(logsDir, 'stdout.txt'), options.stdout);
  fs.writeFileSync(path.join(logsDir, 'stderr.txt'), options.stderr);
  fs.writeFileSync(path.join(logsDir, 'fingerprint.json'), JSON.stringify({ 
    fingerprint: options.failure.fingerprint,
    error_patterns: options.failure.error_patterns 
  }, null, 2));

  // 4. Copy files using git ls-files
  const filesDir = path.join(artifactPath, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  try {
    const gitArgs = ['ls-files'];
    if (options.includeUntracked) {
      gitArgs.push('-o', '--exclude-standard');
    }
    
    const result = spawnSync('git', gitArgs, { cwd: options.runConfig.working_directory, encoding: 'utf-8' });
    
    if (result.status !== 0) {
      throw new Error(`Git ls-files failed: ${result.stderr}`);
    }

    const filesToCopy = result.stdout.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    
    let totalSize = 0;
    const MAX_SIZE = 500 * 1024 * 1024; // 500MB
    
    for (const file of filesToCopy) {
      const sourcePath = path.join(options.runConfig.working_directory, file);
      const targetPath = path.join(filesDir, file);
      
      if (!fs.existsSync(sourcePath)) continue;
      
      const stats = fs.statSync(sourcePath);
      if (stats.isFile()) {
        totalSize += stats.size;
        if (totalSize > MAX_SIZE) {
          throw new Error(`Artifact size would exceed 50MB limit. Consider excluding more files.`);
        }
        
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
      }
    }
  } catch (err) {
    // If copying files fails, we clean up the incomplete artifact
    fs.rmSync(artifactPath, { recursive: true, force: true });
    throw err;
  }
}
