/**
 * Bug-Box Orchestrator
 *
 * Ties together capabilities, filesystem permissions, network isolation,
 * and the existing replay sandbox into a single easy-to-use interface.
 */

import { SandboxResult, SandboxOptions, createSandbox, cleanupSandbox } from '../replay/sandbox';
import { detectCapabilities, PlatformCapabilities } from './capabilities';
import {
  createIsolatedDir,
  lockDirReadOnly,
  cleanupIsolatedDir,
  IsolatedDirResult,
} from './filesystem';
import {
  selectNetworkStrategy,
  buildNetworkIsolationArgs,
  createNetworkCleanup,
  addFirewallBlockRule,
  NetworkStrategy,
} from './network';
import { RunConfig } from '../types/artifact';

export interface BugBoxOptions {
  level: 'workspace' | 'isolated' | 'full';
  sandboxOptions: SandboxOptions;
  command: string[];
}

export interface BugBoxResult {
  sandboxResult: SandboxResult;
  capabilities: PlatformCapabilities;
  appliedLayers: string[];
  skippedLayers: string[];
  networkStrategy: NetworkStrategy;
  isolatedDir?: IsolatedDirResult;
  runConfigOverrides: Partial<RunConfig>;
  cleanupFn: () => void;
}

/**
 * Creates a Bug-Box environment for replaying an artifact.
 *
 * @param options Level of isolation and underlying sandbox options
 */
export async function createBugBox(options: BugBoxOptions): Promise<BugBoxResult> {
  const caps = detectCapabilities();
  const appliedLayers: string[] = [];
  const skippedLayers: string[] = [];

  // 1. Fast path: 'workspace' mode (no OS-level isolation, just git worktree)
  if (options.level === 'workspace') {
    const sandboxResult = await createSandbox(options.sandboxOptions);
    return {
      sandboxResult,
      capabilities: caps,
      appliedLayers,
      skippedLayers,
      networkStrategy: 'none',
      runConfigOverrides: {},
      cleanupFn: () => cleanupSandbox(sandboxResult),
    };
  }

  // 2. 'isolated' or 'full' mode: start by creating the restricted filesystem structure
  const isolatedDir = createIsolatedDir();
  appliedLayers.push('filesystem');

  // 3. Populate the workspace with source files (via git worktree or fallback)
  const sandboxResult = await createSandbox({
    ...options.sandboxOptions,
    targetDir: isolatedDir.workspaceDir, // Force sandbox to use our restricted dir
  });

  // If the sandbox fell back to copying the artifact's files/ snapshot,
  // those files are now in the workspaceDir. To prevent the replayed command
  // from modifying the source snapshot, we lock the filesDir read-only.
  // Wait, if it's a fallback, it copies files from artifact. We should lock it if we
  // put it in filesDir. But currently sandbox.ts copies to `targetDir`. So it's all in
  // workspaceDir. We'll lock `filesDir` just in case future logic separates them.
  if (sandboxResult.usedFallback) {
    lockDirReadOnly(isolatedDir.filesDir);
  }

  const runConfigOverrides: Partial<RunConfig> = {
    working_directory: sandboxResult.workingDirectory,
  };

  // 4. Network Isolation
  let netStrategy: NetworkStrategy = 'none';
  let netCleanup = () => {};
  const ruleName = `bugbox-net-${Date.now()}`;

  if (options.level === 'isolated' || options.level === 'full') {
    netStrategy = selectNetworkStrategy(caps);
    
    if (netStrategy === 'none') {
      skippedLayers.push('network: primitive not available on this OS');
    } else {
      appliedLayers.push('network');
      const netResult = buildNetworkIsolationArgs(netStrategy, options.command);
      
      runConfigOverrides.command = netResult.command;
      
      if (netResult.needsPreExec) {
        const exePath = netResult.command[0];
        // If this fails, we just continue (best effort isolation)
        addFirewallBlockRule(ruleName, exePath);
      }
      
      netCleanup = createNetworkCleanup(netStrategy, ruleName);
    }
  }

  // 5. Build combined cleanup
  const cleanupFn = () => {
    // 1. Tear down network rules
    netCleanup();
    // 2. Remove git worktree
    cleanupSandbox(sandboxResult);
    // 3. Remove restricted temp directory
    cleanupIsolatedDir(isolatedDir);
  };

  return {
    sandboxResult,
    capabilities: caps,
    appliedLayers,
    skippedLayers,
    networkStrategy: netStrategy,
    isolatedDir,
    runConfigOverrides,
    cleanupFn,
  };
}
