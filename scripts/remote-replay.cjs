#!/usr/bin/env node
const { NodeSSH } = require('node-ssh')
const path = require('path')
const fs = require('fs')

async function main() {
  const [,, host, user, password, artifact] = process.argv
  if (!host || !user || !password || !artifact) {
    console.error('Usage: node scripts/remote-replay.cjs <host> <user> <password> <artifactPath>')
    process.exit(2)
  }

  const ssh = new NodeSSH()
  console.log(`Connecting to ${user}@${host}...`)
  await ssh.connect({ host, username: user, password })

  const remoteBase = `/tmp/bp-replay-${Date.now()}`
  console.log(`Creating remote directory ${remoteBase}`)
  await ssh.execCommand(`mkdir -p ${remoteBase}`)

  // upload dist directory
  const localDist = path.join(__dirname, '..', 'dist')
  if (fs.existsSync(localDist)) {
    console.log('Uploading dist/ to remote...')
    await ssh.putDirectory(localDist, path.posix.join(remoteBase, 'dist'), { recursive: true })
  } else {
    console.warn('Local dist/ not found; remote may not have CLI')
  }

  // upload package.json so remote can install dependencies
  const localPkg = path.join(__dirname, '..', 'package.json')
  if (fs.existsSync(localPkg)) {
    console.log('Uploading package.json to remote...')
    await ssh.putFile(localPkg, path.posix.join(remoteBase, 'package.json'))
    console.log('Installing production dependencies on remote...')
    await ssh.execCommand('npm install --production --no-audit --no-fund', { cwd: remoteBase })
  } else {
    console.warn('Local package.json not found; skipping npm install')
  }

  // upload artifact
  const artifactName = path.basename(artifact)
  console.log(`Uploading artifact ${artifactName}`)
  await ssh.putFile(artifact, path.posix.join(remoteBase, artifactName))

  // run replay
  console.log('Running replay on remote host...')
  const replayCmd = `node ${path.posix.join(remoteBase, 'dist', 'cli.js')} replay ${path.posix.join(remoteBase, artifactName)} --json`
  const result = await ssh.execCommand(replayCmd, { cwd: remoteBase })

  console.log('--- REMOTE STDOUT ---')
  console.log(result.stdout)
  console.log('--- REMOTE STDERR ---')
  console.log(result.stderr)

  await ssh.dispose()
}

main().catch(err => { console.error(err); process.exit(1) })
