/**
 * Regression test: ensure no `as unknown` double assertions exist in maintained code.
 *
 * Prefer type guards, narrow interfaces, module augmentation, or typed factories
 * over unsafe casts. See src/lib/types/scrollAnimator.ts and
 * src/lib/types/spark-stub-globals.d.ts for the preferred patterns.
 */
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../')

describe('no double assertions regression', () => {
  it('no unsafe double assertions in src/ or tests/', () => {
    const result = execSync(
      'rg -n "as unknown" src tests --glob "!tests/unit/noDoubleAssertions.test.ts"',
      { cwd: root, encoding: 'utf-8' },
    ).trim()

    // Filter out lines that are only comments
    const nonCommentLines = result
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        const content = line.split(':').slice(2).join(':')
        return !content.trim().startsWith('*') && !content.trim().startsWith('//')
      })

    expect(nonCommentLines, 'Found unsafe double assertions in code (not comments)').toEqual([])
  })
})
