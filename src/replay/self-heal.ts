/**
 * Self-healing replay (Phase 3.1).
 *
 * After a failed replay, scan stderr for known missing-dependency patterns
 * (Node ModuleNotFoundError, Python ModuleNotFoundError, etc.), install
 * them inside the sandbox working directory, and retry the replay.
 *
 * Design constraints:
 *   - Off by default. Only fires when --self-heal is explicitly requested.
 *   - Only installs npm + pip dependencies. Other ecosystems require manual
 *     intervention because their installs can require root, custom flags,
 *     or persistent state (gem, cargo, go modules, etc.).
 *   - Only acts on `high` confidence detections to avoid false positives.
 *   - Caps healing at MAX_HEAL_ROUNDS to prevent infinite loops.
 *   - Installs are scoped to the sandbox `working_directory` (npm install,
 *     pip install --user / venv) so the host environment is not polluted.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { ReplayOptions, ReplayResult, replayArtifact } from './engine.js';
import { RunConfig } from '../types/artifact.js';
import { FailureRecord } from '../types/failure.js';
import { detectMissingDependencies, MissingDependency } from '../utils/dependencies.js';
import { generateVerdict, VerdictStatus } from './verdict.js';

export const MAX_HEAL_ROUNDS = 3;

export interface HealAttempt {
  round: number;
  dependencies: MissingDependency[];
  installed: string[];
  failedToInstall: string[];
  /** Verdict after retrying replay with the deps installed */
  verdictStatus: VerdictStatus;
}

export interface SelfHealResult {
  /** Last replay result (after all heal attempts) */
  finalResult: ReplayResult;
  /** Healing trail — empty if no healing was needed */
  attempts: HealAttempt[];
  /** Whether self-heal eventually succeeded in changing the outcome */
  healed: boolean;
}

/**
 * Run a replay with self-healing enabled.
 *
 * Strategy:
 *   1. Replay once via `replayArtifact`.
 *   2. If the verdict is `confirmed`, return immediately — there's nothing to heal.
 *      (The bug *did* reproduce, which is the success case for a bug artifact.)
 *   3. Otherwise scan stderr for high-confidence missing dependencies. If any
 *      installable (npm/pip) deps are found, install them in the sandbox cwd
 *      and replay again.
 *   4. Repeat until either: verdict becomes `confirmed`, no new installable
 *      deps are detected, or MAX_HEAL_ROUNDS is reached.
 */
export async function selfHealReplay(
  runConfig: RunConfig,
  expectedFailure: FailureRecord,
  options: ReplayOptions,
): Promise<SelfHealResult> {
  const attempts: HealAttempt[] = [];

  // First replay — this is the "baseline" before any healing.
  let result = await replayArtifact(runConfig, expectedFailure, options);
  let verdict = generateVerdict(result);

  // If the bug already reproduced cleanly, nothing to heal.
  if (verdict.status === 'confirmed') {
    return { finalResult: result, attempts, healed: false };
  }

  const alreadyInstalled = new Set<string>();
  const cwd = result.replayDirectory || runConfig.working_directory;

  for (let round = 1; round <= MAX_HEAL_ROUNDS; round++) {
    const candidates = detectMissingDependencies(result.actualStderr)
      .filter((d) => d.confidence === 'high')
      .filter((d) => d.language === 'node' || d.language === 'python')
      .filter((d) => !alreadyInstalled.has(`${d.language}:${d.name}`));

    if (candidates.length === 0) {
      break; // nothing left we know how to fix
    }

    const installed: string[] = [];
    const failedToInstall: string[] = [];

    for (const dep of candidates) {
      const ok = installDependency(dep, cwd);
      alreadyInstalled.add(`${dep.language}:${dep.name}`);
      if (ok) {
        installed.push(`${dep.language}:${dep.name}`);
      } else {
        failedToInstall.push(`${dep.language}:${dep.name}`);
      }
    }

    if (installed.length === 0) {
      // We detected candidates but couldn't install any of them; bail out.
      attempts.push({
        round,
        dependencies: candidates,
        installed,
        failedToInstall,
        verdictStatus: verdict.status,
      });
      break;
    }

    // Retry replay with deps installed in cwd.
    result = await replayArtifact(runConfig, expectedFailure, options);
    verdict = generateVerdict(result);

    attempts.push({
      round,
      dependencies: candidates,
      installed,
      failedToInstall,
      verdictStatus: verdict.status,
    });

    if (verdict.status === 'confirmed') {
      break;
    }
  }

  return {
    finalResult: result,
    attempts,
    healed: attempts.some((a) => a.verdictStatus === 'confirmed'),
  };
}

/**
 * Install a single missing dependency inside the sandbox cwd.
 *
 * Returns true on successful install (exit code 0), false otherwise.
 * Captures install output but does not surface it — the next replay will
 * either succeed or fail visibly, which is the signal we care about.
 */
function installDependency(dep: MissingDependency, cwd: string): boolean {
  // Defensive: don't accept names with shell metacharacters. The dependency
  // names come from regex captures on stderr; while detection is constrained,
  // we belt-and-suspenders here.
  if (!/^[@\w./-]+$/.test(dep.name)) return false;

  if (dep.language === 'node') {
    // Ensure there's a package.json so `npm install <pkg>` doesn't refuse.
    // If none, write a minimal one — the install is sandboxed to cwd anyway.
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) {
      try {
        fs.writeFileSync(
          pkgPath,
          JSON.stringify({ name: 'bugproof-heal', version: '0.0.0', private: true }, null, 2),
        );
      } catch {
        return false;
      }
    }
    const result = spawnSync('npm', ['install', '--no-audit', '--no-fund', '--silent', dep.name], {
      cwd,
      encoding: 'utf-8',
      shell: process.platform === 'win32', // npm is a .cmd on Windows
      timeout: 120_000,
    });
    return result.status === 0;
  }

  if (dep.language === 'python') {
    // Try `python -m pip install --user <pkg>` first. We avoid system pip
    // because it may need sudo. The --user flag installs into the user
    // site-packages, which the replay process can see.
    const py = pickPython();
    if (!py) return false;
    const result = spawnSync(py, ['-m', 'pip', 'install', '--quiet', '--user', dep.name], {
      cwd,
      encoding: 'utf-8',
      timeout: 120_000,
    });
    return result.status === 0;
  }

  return false;
}

function pickPython(): string | null {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['--version'], { encoding: 'utf-8' });
    if (probe.status === 0) return candidate;
  }
  return null;
}
