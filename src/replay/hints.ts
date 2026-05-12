/**
 * Smart Hints Engine
 * 
 * When a replay produces a DIFFERENT failure than expected, this module
 * analyzes the mismatch and provides actionable suggestions to the developer.
 */

import { FailureRecord } from '../types/failure.js';

export interface Hint {
  category: 'missing_dependency' | 'env_missing' | 'permission' | 'version_mismatch' | 'network' | 'file_not_found' | 'general';
  title: string;
  suggestion: string;
  confidence: 'high' | 'medium' | 'low';
}

interface PatternRule {
  pattern: RegExp;
  category: Hint['category'];
  title: string;
  suggestion: (match: RegExpMatchArray) => string;
  confidence: Hint['confidence'];
}

const HINT_RULES: PatternRule[] = [
  // Node.js missing module
  {
    pattern: /Cannot find module ['"]([^'"]+)['"]/,
    category: 'missing_dependency',
    title: 'Missing Node.js module',
    suggestion: (m) => {
      const mod = m[1];
      if (mod.startsWith('.') || mod.startsWith('/') || /^[A-Za-z]:[\\/]/.test(mod)) return `Check that '${mod}' exists in your project.`;
      if (/\.\w+$/.test(mod)) return `Check that the file '${mod}' exists in your project.`;
      return `Install the missing package: npm install ${mod.split('/')[0]}`;
    },
    confidence: 'high',
  },
  {
    pattern: /Error: Cannot find module '([^']+)'/,
    category: 'missing_dependency',
    title: 'Missing Node.js module',
    suggestion: (m) => {
      const mod = m[1];
      if (mod.startsWith('.') || mod.startsWith('/') || /^[A-Za-z]:[\\/]/.test(mod)) return `Check that '${mod}' exists in your project.`;
      if (/\.\w+$/.test(mod)) return `Check that the file '${mod}' exists in your project.`;
      return `Install the missing package: npm install ${mod.split('/')[0]}`;
    },
    confidence: 'high',
  },
  // Python missing module
  {
    pattern: /ModuleNotFoundError: No module named '([^']+)'/,
    category: 'missing_dependency',
    title: 'Missing Python module',
    suggestion: (m) => `Install the missing package: pip install ${m[1].replace('.', '-')}`,
    confidence: 'high',
  },
  {
    pattern: /ImportError: cannot import name '([^']+)' from '([^']+)'/,
    category: 'missing_dependency',
    title: 'Missing Python import',
    suggestion: (m) => `Module '${m[2]}' may need updating: pip install --upgrade ${m[2].split('.')[0]}`,
    confidence: 'medium',
  },
  // Ruby missing gem
  {
    pattern: /cannot load such file -- ([^\s(]+)/,
    category: 'missing_dependency',
    title: 'Missing Ruby gem',
    suggestion: (m) => `Install the missing gem: gem install ${m[1]}`,
    confidence: 'medium',
  },
  // Environment variables
  {
    pattern: /(?:env|environment|variable)\s+['"]?([A-Z_][A-Z0-9_]+)['"]?\s+(?:is not set|not found|undefined|missing)/i,
    category: 'env_missing',
    title: 'Missing environment variable',
    suggestion: (m) => `Set the required environment variable: export ${m[1]}=<value>`,
    confidence: 'high',
  },
  {
    pattern: /(?:EACCES|EPERM|permission denied)/i,
    category: 'permission',
    title: 'Permission denied',
    suggestion: () => `Check file/directory permissions. You may need elevated privileges or the file may be read-only.`,
    confidence: 'high',
  },
  // Network errors
  {
    pattern: /(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN)/,
    category: 'network',
    title: 'Network connectivity issue',
    suggestion: () => `A network connection failed. Check that the required service/host is running and accessible.`,
    confidence: 'high',
  },
  {
    pattern: /(?:401|403)\s*(?:Unauthorized|Forbidden)/i,
    category: 'env_missing',
    title: 'Authentication failure',
    suggestion: () => `Authentication failed. Check that API keys and tokens are correctly set in your environment.`,
    confidence: 'high',
  },
  // File not found
  {
    pattern: /ENOENT[^']*'([^']+)'/i,
    category: 'file_not_found',
    title: 'File or directory not found',
    suggestion: (m) => `File not found: ${m[1]}. Ensure the file exists and the path is correct.`,
    confidence: 'high',
  },
  // Version mismatch
  {
    pattern: /(?:requires|expected|needs)\s+(?:node|python|ruby|java)\s*(?:version\s*)?([><=!~^]+\s*[\d.]+)/i,
    category: 'version_mismatch',
    title: 'Runtime version mismatch',
    suggestion: (m) => `The required version (${m[1]}) doesn't match your installed version. Use a version manager (nvm, pyenv) to switch.`,
    confidence: 'medium',
  },
  {
    pattern: /(?:SyntaxError|unexpected token).*?\n/i,
    category: 'version_mismatch',
    title: 'Possible syntax/version incompatibility',
    suggestion: () => `A syntax error occurred. This may indicate a Node.js/runtime version mismatch between capture and replay environments.`,
    confidence: 'low',
  },
];

/**
 * Analyzes the mismatch between expected and actual failures and generates hints.
 */
export function generateHints(
  expected: FailureRecord,
  actual: FailureRecord,
  actualStderr: string,
): Hint[] {
  const hints: Hint[] = [];

  // If the command succeeded but was expected to fail
  if (actual.exit_code === 0 && expected.exit_code !== 0) {
    hints.push({
      category: 'general',
      title: 'Bug appears to be fixed',
      suggestion: 'The command succeeded on replay. The original bug may have been fixed in the current codebase.',
      confidence: 'high',
    });
    return hints;
  }

  // Analyze actual stderr for actionable patterns
  for (const rule of HINT_RULES) {
    const match = actualStderr.match(rule.pattern);
    if (match) {
      hints.push({
        category: rule.category,
        title: rule.title,
        suggestion: rule.suggestion(match),
        confidence: rule.confidence,
      });
    }
  }

  // If we have different exit codes but no specific hints, give a general one
  if (hints.length === 0 && actual.exit_code !== expected.exit_code) {
    hints.push({
      category: 'general',
      title: 'Different failure mode',
      suggestion: `Expected exit code ${expected.exit_code} but got ${actual.exit_code}. The bug may have mutated or the environment differs.`,
      confidence: 'low',
    });
  }

  return hints;
}
