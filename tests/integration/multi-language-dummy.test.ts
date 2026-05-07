import * as fs from 'fs'
import * as path from 'path'
import { detectProjectLanguages } from '../../src/capture/language-support'

type Scenario = { fixture: string; language: string }

describe('multi-language dummy fixtures', () => {
  const base = path.join(__dirname, '..', 'fixtures', 'multi-lang')
  const scenarios: Scenario[] = JSON.parse(fs.readFileSync(path.join(base, 'scenarios.json'), 'utf-8'))

  for (const scenario of scenarios) {
    test(`${scenario.fixture} is detected as ${scenario.language}`, () => {
      const ctx = detectProjectLanguages(path.join(base, scenario.fixture))
      const ids = ctx.languages.map(l => l.id)
      expect(ids).toContain(scenario.language)
    })
  }

  test('kotlin-app is treated as a JVM project', () => {
    const ctx = detectProjectLanguages(path.join(base, 'kotlin-app'))
    const java = ctx.languages.find(l => l.id === 'java')
    expect(java).toBeDefined()
    expect(java?.buildSystem).toBe('gradle')
  })
})
