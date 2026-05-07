import { detectProjectLanguages } from '../../src/capture/language-support'
import * as os from 'os'
import * as fs from 'fs'
import * as path from 'path'

test('detectProjectLanguages identifies primary language in a temp Node project', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-test-'))
  const pkg = { name: 'bp-temp', version: '0.0.0' }
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify(pkg, null, 2))

  const ctx = detectProjectLanguages(tmpDir)
  expect(ctx).toBeDefined()
  expect(Array.isArray(ctx.languages)).toBe(true)
  expect(ctx.languages.length).toBeGreaterThanOrEqual(1)
  expect(ctx.primary).not.toBeNull()
  expect(ctx.primary?.id).toMatch(/^(javascript|typescript)$/)

  // cleanup
  try { fs.rmSync(tmpDir, { recursive: true }) } catch {}
})
