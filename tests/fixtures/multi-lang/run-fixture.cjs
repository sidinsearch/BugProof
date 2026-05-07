#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

function getArg(name, fallback = '') {
  const index = process.argv.indexOf(name)
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1]
  return fallback
}

const fixture = getArg('--fixture', process.env.BUGPROOF_FIXTURE || 'unknown')
const language = getArg('--language', process.env.BUGPROOF_LANGUAGE || 'unknown')
const message = getArg('--message', process.env.BUGPROOF_MESSAGE || 'dummy failure')

console.error(`fixture=${fixture}`)
console.error(`language=${language}`)
console.error(`message=${message}`)

const probePath = path.join(process.cwd(), '..', 'sandbox-leak.txt')
if (fs.existsSync(probePath)) {
  console.error('sandbox=leak-visible')
} else {
  console.error('sandbox=isolated')
}

process.exit(1)
