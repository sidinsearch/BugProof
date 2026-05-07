#!/usr/bin/env node
const { NodeSSH } = require('node-ssh')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT_DIR = path.resolve(__dirname, '..')
const FIXTURES_DIR = path.join(ROOT_DIR, 'tests', 'fixtures', 'multi-lang')
const SCENARIOS = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'scenarios.json'), 'utf-8'))

const LINUX_HOST = process.env.BUGPROOF_LINUX_HOST
const LINUX_USER = process.env.BUGPROOF_LINUX_USER
const LINUX_PASS = process.env.BUGPROOF_LINUX_PASS
const REMOTE_DIR = process.env.BUGPROOF_REMOTE_DIR || '/home/siddharth/bugproof-matrix'

const ssh = new NodeSSH()

function log(prefix, message) {
  console.log(`${prefix} ${message}`)
}

function runLocal(command, options = {}) {
  return execSync(command, {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim()
}

function runLocalJson(command) {
  const output = runLocal(command)
  return JSON.parse(output)
}

async function runRemote(command) {
  const result = await ssh.execCommand(command)
  if (result.code !== 0) {
    throw new Error(`Remote command failed (${result.code}): ${command}\nSTDOUT: ${result.stdout}\nSTDERR: ${result.stderr}`)
  }
  return result.stdout.trim()
}

async function runRemoteJson(command) {
  const output = await runRemote(command)
  return JSON.parse(output)
}

function cleanBugFiles(dir) {
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith('.bug')) {
      try {
        fs.rmSync(path.join(dir, entry), { force: true })
      } catch {}
    }
  }
}

function latestBugFile(dir) {
  const entries = fs.readdirSync(dir).filter(entry => entry.endsWith('.bug'))
  let latest = null
  let latestTime = 0
  for (const entry of entries) {
    const stat = fs.statSync(path.join(dir, entry))
    if (stat.mtimeMs > latestTime) {
      latestTime = stat.mtimeMs
      latest = entry
    }
  }
  return latest
}

function buildCaptureCommand(basePath, scenario) {
  const inlineScript = [
    "const fs=require('fs')",
    "const path=require('path')",
    `console.error(${JSON.stringify(`fixture=${scenario.fixture}`)})`,
    `console.error(${JSON.stringify(`language=${scenario.language}`)})`,
    `console.error(${JSON.stringify(`message=${scenario.message}`)})`,
    "const probePath=path.join(process.cwd(),'..','sandbox-leak.txt')",
    "console.error(fs.existsSync(probePath) ? 'sandbox=leak-visible' : 'sandbox=isolated')",
    'process.exit(1)',
  ].join('; ')

  return [
    'node',
    'dist/cli.js',
    'capture',
    '--json',
    '--exclude', '"*.tgz"',
    '--exclude', '"node_modules/**"',
    '--',
    'node',
    '-e',
    JSON.stringify(inlineScript),
  ].join(' ')
}

async function setupRemote() {
  if (!LINUX_HOST || !LINUX_USER || !LINUX_PASS) {
    throw new Error('Missing BUGPROOF_LINUX_HOST, BUGPROOF_LINUX_USER, or BUGPROOF_LINUX_PASS environment variables.')
  }

  await ssh.connect({ host: LINUX_HOST, username: LINUX_USER, password: LINUX_PASS })
  await runRemote(`rm -rf "${REMOTE_DIR}" && mkdir -p "${REMOTE_DIR}"`)

  const distDir = path.join(ROOT_DIR, 'dist')
  if (!fs.existsSync(distDir)) {
    throw new Error('Missing dist/; run npm run build first.')
  }

  await ssh.putDirectory(distDir, path.posix.join(REMOTE_DIR, 'dist'), { recursive: true })
  await ssh.putFile(path.join(ROOT_DIR, 'package.json'), path.posix.join(REMOTE_DIR, 'package.json'))
  await runRemote(`cd "${REMOTE_DIR}" && npm install --production --ignore-scripts --no-audit --no-fund`)
  await ssh.putDirectory(FIXTURES_DIR, path.posix.join(REMOTE_DIR, 'fixtures', 'multi-lang'), { recursive: true })
  await runRemote(`cd "${REMOTE_DIR}" && git init && git config user.name "BugProof" && git config user.email "bugproof@test.local" && git add fixtures && git commit -m "matrix fixtures" --allow-empty`)
}

function compareSnippet(actual, expected, label) {
  if (!actual.includes(expected)) {
    throw new Error(`${label} mismatch. Expected snippet: ${expected}\nActual: ${actual}`)
  }
}

async function main() {
  log('🔧', 'Building BugProof...')
  runLocal('npm run build')

  log('🔌', `Connecting to Linux (${LINUX_USER}@${LINUX_HOST})...`)
  await setupRemote()

  const report = []

  for (const scenario of SCENARIOS) {
    log('🧪', `Scenario: ${scenario.fixture} (${scenario.language})`)
    execSync('git add tests/fixtures/multi-lang', { cwd: ROOT_DIR, stdio: 'ignore' })
    cleanBugFiles(ROOT_DIR)

    const localCapture = runLocalJson(buildCaptureCommand(path.posix.join('tests', 'fixtures', 'multi-lang'), scenario))
    const localBug = localCapture.artifact.path
    const localInspect = runLocalJson(`node dist/cli.js inspect "${localBug}" --json`)
    compareSnippet(localInspect.failure.stderr_snippet, `fixture=${scenario.fixture}`, `${scenario.fixture} local stderr`)
    compareSnippet(localInspect.failure.stderr_snippet, `language=${scenario.language}`, `${scenario.fixture} local language`)
    compareSnippet(localInspect.failure.stderr_snippet, `message=${scenario.message}`, `${scenario.fixture} local message`)

    const localReplay = runLocalJson(`node dist/cli.js replay "${localBug}" --version-match strict --sandbox isolated --json`)
    if (!localReplay.reproduced) {
      throw new Error(`Local replay did not reproduce for ${scenario.fixture}`)
    }

    const remoteLocalBug = path.posix.join(REMOTE_DIR, path.basename(localBug))
    await ssh.putFile(localBug, remoteLocalBug)
    const remoteReplay = await runRemoteJson(`cd "${REMOTE_DIR}" && node dist/cli.js replay "${remoteLocalBug}" --version-match strict --sandbox isolated --json`)
    if (!remoteReplay.reproduced) {
      throw new Error(`Remote replay did not reproduce for ${scenario.fixture}`)
    }

    const remoteCapture = await runRemoteJson(`cd "${REMOTE_DIR}" && ${buildCaptureCommand(path.posix.join('fixtures', 'multi-lang'), scenario)}`)
    const remoteInspect = await runRemoteJson(`cd "${REMOTE_DIR}" && node dist/cli.js inspect "${remoteCapture.artifact.path}" --json`)
    compareSnippet(remoteInspect.failure.stderr_snippet, `fixture=${scenario.fixture}`, `${scenario.fixture} remote stderr`)
    compareSnippet(remoteInspect.failure.stderr_snippet, `language=${scenario.language}`, `${scenario.fixture} remote language`)
    compareSnippet(remoteInspect.failure.stderr_snippet, `message=${scenario.message}`, `${scenario.fixture} remote message`)

    const remoteReplayedLocal = path.join(ROOT_DIR, path.basename(remoteCapture.artifact.path))
    await ssh.getFile(remoteReplayedLocal, remoteCapture.artifact.path)
    const winReplay = runLocalJson(`node dist/cli.js replay "${remoteReplayedLocal}" --version-match strict --sandbox isolated --json`)
    if (!winReplay.reproduced) {
      throw new Error(`Windows replay did not reproduce for ${scenario.fixture}`)
    }

    if (localInspect.failure.stderr_snippet !== remoteInspect.failure.stderr_snippet) {
      throw new Error(`Cross-platform stderr snippet mismatch for ${scenario.fixture}`)
    }

    report.push({
      fixture: scenario.fixture,
      language: scenario.language,
      local: localReplay.verdict.status,
      remote: remoteReplay.verdict.status,
      reverse: winReplay.verdict.status,
    })
  }

  console.log(JSON.stringify({ success: true, scenarios: report }, null, 2))
  ssh.dispose()
}

main().catch(err => {
  console.error(err)
  ssh.dispose()
  process.exit(1)
})
