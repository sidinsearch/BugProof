/**
 * Bug-Box Orchestrator
 *
 * Ties together capabilities, filesystem permissions, network isolation,
 * and the existing replay sandbox into a single easy-to-use interface.
 */

import { randomBytes } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

import { SandboxResult, SandboxOptions, createSandbox, cleanupSandbox } from '../replay/sandbox.js';
import { detectCapabilities, PlatformCapabilities } from './capabilities.js';
import {
  createIsolatedDir,
  lockDirReadOnly,
  cleanupIsolatedDir,
  IsolatedDirResult,
} from './filesystem.js';
import {
  selectNetworkStrategy,
  buildNetworkIsolationArgs,
  createNetworkCleanup,
  addFirewallBlockRule,
  NetworkStrategy,
} from './network.js';
import {
  selectProcessStrategy,
  buildProcessIsolationArgs,
  ProcessStrategy,
} from './process.js';
import {
  selectResourceStrategy,
  buildResourceIsolationArgs,
  ResourceStrategy,
  ResourceLimits,
} from './resources.js';
import { RunConfig } from '../types/artifact.js';

export interface BugBoxOptions {
  level: 'workspace' | 'isolated' | 'full';
  sandboxOptions: SandboxOptions;
  command: string[];
  resourceLimits?: ResourceLimits;
}

export interface BugBoxResult {
  sandboxResult: SandboxResult;
  capabilities: PlatformCapabilities;
  appliedLayers: string[];
  skippedLayers: string[];
  networkStrategy: NetworkStrategy;
  processStrategy: ProcessStrategy;
  resourceStrategy: ResourceStrategy;
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
      processStrategy: 'none',
      resourceStrategy: 'none',
      runConfigOverrides: {
        working_directory: sandboxResult.workingDirectory,
      },
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
  // lock the filesDir read-only to prevent the replayed process from
  // modifying the captured source snapshot.
  if (sandboxResult.usedFallback) {
    lockDirReadOnly(isolatedDir.filesDir);
  }

  const runConfigOverrides: Partial<RunConfig> = {
    working_directory: sandboxResult.workingDirectory,
  };

  // 4. Network Isolation
  let netStrategy: NetworkStrategy = 'none';
  let netCleanup = () => {};
  const ruleName = `bugbox-net-${randomBytes(6).toString('hex')}`;

  if (options.level === 'isolated' || options.level === 'full') {
    netStrategy = selectNetworkStrategy(caps);
    
    if (netStrategy === 'none') {
      skippedLayers.push('network: primitive not available on this OS');
    } else {
      const netResult = buildNetworkIsolationArgs(netStrategy, options.command);
      
      runConfigOverrides.command = netResult.command;
      
      if (netResult.needsPreExec) {
        const exePath = resolveExecutableForFirewall(netResult.command[0]);
        if (!exePath || !addFirewallBlockRule(ruleName, exePath)) {
          skippedLayers.push('network: firewall rule setup failed on Windows');
          netStrategy = 'none';
        } else {
          appliedLayers.push('network');
          netCleanup = createNetworkCleanup('netsh', ruleName);
        }
      } else {
        appliedLayers.push('network');
        netCleanup = createNetworkCleanup(netStrategy, ruleName);
      }
    }
  }

  // 5. Process & Resource Isolation (Only in 'full' mode)
  let procStrategy: ProcessStrategy = 'none';
  let resStrategy: ResourceStrategy = 'none';

  if (options.level === 'full') {
    // Process Isolation
    procStrategy = selectProcessStrategy(caps);
    if (procStrategy === 'none') {
      skippedLayers.push('process: primitive not available on this OS');
    } else {
      appliedLayers.push('process');
      runConfigOverrides.command = buildProcessIsolationArgs(
        procStrategy,
        runConfigOverrides.command || options.command
      );
    }

    // Resource Limits
    resStrategy = selectResourceStrategy(caps);
    if (resStrategy === 'none') {
      skippedLayers.push('resources: primitive not available on this OS');
    } else if (options.resourceLimits && (options.resourceLimits.maxMemoryMB || options.resourceLimits.maxCpuPercent)) {
      appliedLayers.push('resources');
      runConfigOverrides.command = buildResourceIsolationArgs(
        resStrategy,
        runConfigOverrides.command || options.command,
        options.resourceLimits
      );
    }
  }

  // 6. Build combined cleanup
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
    processStrategy: procStrategy,
    resourceStrategy: resStrategy,
    isolatedDir,
    runConfigOverrides,
    cleanupFn,
  };
}

function resolveExecutableForFirewall(command: string): string | null {
  if (!command) {
    return null;
  }

  if (path.isAbsolute(command) && fs.existsSync(command)) {
    return command;
  }

  const pathParts = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  const extensions = process.platform === 'win32'
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];

  for (const baseDir of pathParts) {
    const candidates = process.platform === 'win32'
      ? extensions.map((ext) => path.join(baseDir, `${command}${ext.toLowerCase()}`))
      : [path.join(baseDir, command)];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
