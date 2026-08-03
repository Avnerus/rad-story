/**
 * Regression test: ensure no unsafe chained type assertions exist in maintained code.
 *
 * Scans source files for the token sequence that forms a double assertion
 * pattern. The forbidden token is assembled at runtime so the test file
 * itself never contains the literal sequence.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../')

/** Recursively collect .ts / .svelte file paths under a directory. */
function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.svelte-kit' || entry === 'dist') continue
      collectFiles(fullPath, results)
    } else if (entry.endsWith('.ts') || entry.endsWith('.svelte')) {
      results.push(fullPath)
    }
  }
  return results
}

/** Build the forbidden token at runtime so this file never contains it. */
const forbiddenToken = 'as ' + 'unknown'

describe('no unsafe chained assertions regression', () => {
  it('no chained double assertions in src/ or tests/', () => {
    const violations: string[] = []

    for (const dir of ['src', 'tests']) {
      const files = collectFiles(resolve(root, dir))
      for (const filePath of files) {
        const content = readFileSync(filePath, 'utf-8')
        const relativePath = filePath.slice(root.length + 1)
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          if (line.includes(forbiddenToken)) {
            violations.push(`${relativePath}:${i + 1}: ${line.trim()}`)
          }
        }
      }
    }

    expect(violations, 'Found chained double assertions in maintained code').toEqual([])
  })
})
