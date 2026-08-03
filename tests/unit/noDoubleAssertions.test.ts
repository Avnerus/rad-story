/**
 * Regression test: ensure no unsafe type assertions exist in maintained code.
 *
 * Scans source files for forbidden patterns:
 * - Chained assertions (e.g. double-cast through intermediate type) detected
 *   by matching `as <TypeToken> as` with a TypeScript-like intermediate token
 * - The specific double-cast token assembled at runtime from two parts
 *
 * The forbidden tokens are assembled at runtime so this file never
 * contains them literally.
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

/** Build forbidden tokens at runtime so this file never contains them. */
const asUnknownToken = 'as ' + 'unknown'
/** Regex: `as <TypeToken> as` (chained assertion, possibly across whitespace).
 * Matches `as` followed by a TypeScript identifier/type token and another `as`.
 * Excludes natural-language uses by requiring the intermediate token to start
 * with an uppercase letter, underscore, or common generic markers.
 */
const chainedPattern = new RegExp('\\bas\\s+([A-Z_]|\\w+<|Record|Partial|Pick|Omit)\\w*\\s+as', 'g')

describe('no unsafe type assertions regression', () => {
  it('no double-cast through intermediate type in src/ or tests/', () => {
    const violations: string[] = []
    const ownPath = resolve(__dirname, 'noDoubleAssertions.test.ts')
    for (const dir of ['src', 'tests']) {
      for (const filePath of collectFiles(resolve(root, dir))) {
        if (filePath === ownPath) continue
        const content = readFileSync(filePath, 'utf-8')
        const relPath = filePath.slice(root.length + 1)
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(asUnknownToken)) {
            violations.push(`${relPath}:${i + 1}: ${lines[i].trim()}`)
          }
        }
      }
    }
    expect(violations, 'Found double-cast through intermediate type').toEqual([])
  })

  it('no chained assertions in src/ or tests/', () => {
    const violations: string[] = []
    const ownPath = resolve(__dirname, 'noDoubleAssertions.test.ts')
    for (const dir of ['src', 'tests']) {
      for (const filePath of collectFiles(resolve(root, dir))) {
        if (filePath === ownPath) continue
        const content = readFileSync(filePath, 'utf-8')
        const relPath = filePath.slice(root.length + 1)
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]
          // Skip comment-only lines
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
          chainedPattern.lastIndex = 0
          if (chainedPattern.test(line)) {
            violations.push(`${relPath}:${i + 1}: ${trimmed}`)
          }
        }
      }
    }
    expect(violations, 'Found chained type assertions in maintained code').toEqual([])
  })
})
