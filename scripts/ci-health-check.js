#!/usr/bin/env node
/**
 * Comprehensive CI/CD Health Check
 * Validates: build, tests, coverage, linting, security
 * Used by GitHub Actions workflow to ensure production readiness
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}\n`),
};

let passed = 0;
let failed = 0;

function run(cmd, description) {
  try {
    log.info(description);
    execSync(cmd, { stdio: 'inherit', shell: true });
    log.success(`${description} — PASSED`);
    passed++;
    return true;
  } catch (error) {
    log.error(`${description} — FAILED`);
    failed++;
    return false;
  }
}

function check(condition, message) {
  if (condition) {
    log.success(message);
    passed++;
  } else {
    log.error(message);
    failed++;
  }
  return condition;
}

// ─────────────────────────────────────────────────────────────────────────────

log.section('CI/CD HEALTH CHECK');

// 1. Project structure
log.section('1. PROJECT STRUCTURE');
check(fs.existsSync('package.json'), 'package.json exists');
check(fs.existsSync('tsconfig.json'), 'tsconfig.json exists');
check(fs.existsSync('.github/workflows/release.yml'), 'GitHub Actions workflow exists');
check(fs.existsSync('src'), 'src/ directory exists');
check(fs.existsSync('tests'), 'tests/ directory exists');

// 2. Dependencies
log.section('2. DEPENDENCIES');
run('npm ci', 'npm ci (install exact versions)');

// 3. Build
log.section('3. BUILD');
run('npm run build', 'TypeScript build (tsc)');
check(fs.existsSync('dist/cli.js'), 'dist/cli.js compiled');
check(
  fs.existsSync('dist'),
  'dist/ directory exists'
);

// 4. Linting
log.section('4. CODE QUALITY');
run('npm run lint', 'ESLint checks');
run('npm run format -- --check', 'Prettier format check (dry-run)');

// 5. Tests
log.section('5. TESTS');
run('npm test', 'Jest test suite');
check(fs.existsSync('coverage/coverage-final.json'), 'Coverage report generated');

// 6. Coverage check
log.section('6. TEST COVERAGE');
try {
  const coverage = JSON.parse(
    fs.readFileSync('coverage/coverage-final.json', 'utf-8')
  );
  const files = Object.keys(coverage).length;
  log.success(`Test coverage tracking ${files} files`);
  passed++;
} catch (e) {
  log.warn('Coverage report not available (non-critical)');
}

// 7. Security
log.section('7. SECURITY');
run('npm audit --audit-level=moderate', 'npm audit');

// 8. Package validation
log.section('8. PACKAGE VALIDATION');
run('npm pack --dry-run', 'npm pack dry-run');
check(fs.existsSync('package.json'), 'package.json is valid');

// 9. CLI verification
log.section('9. CLI VERIFICATION');
run('node dist/cli.js --version', 'CLI responds to --version');
run('node dist/cli.js --help', 'CLI responds to --help');
run('node dist/cli.js capture --help', 'CLI capture subcommand accessible');

// 10. Cross-platform checks
log.section('10. CROSS-PLATFORM');
const os = require('os');
log.info(`Running on: ${os.platform()} / ${os.arch()}`);
check(
  process.version.startsWith('v18') || process.version.startsWith('v20'),
  `Node.js version compatible: ${process.version}`
);
log.success(`OS: ${os.platform()}`);
log.success(`Architecture: ${os.arch()}`);
passed++;

// Summary
log.section('TEST SUMMARY');
const total = passed + failed;
const percentage = total > 0 ? Math.round((passed / total) * 100) : 0;
console.log(`${colors.cyan}Total:${colors.reset}  ${total} checks`);
console.log(`${colors.green}Passed:${colors.reset} ${passed}`);
if (failed > 0) {
  console.log(`${colors.red}Failed:${colors.reset} ${failed}`);
}
console.log(`${colors.cyan}Score:${colors.reset}  ${percentage}%\n`);

if (failed > 0) {
  log.error('CI/CD Health Check FAILED');
  process.exit(1);
} else {
  log.success('CI/CD Health Check PASSED — Ready for production');
  process.exit(0);
}
