/**
 * Regression test: detect chained type assertions using TypeScript AST parsing.
 *
 * A chained assertion is an `AsExpression` whose expression is another
 * `AsExpression` (e.g. `x as unknown as Y`). AST parsing naturally ignores
 * comments and string literals, so this test can scan its own file safely.
 *
 * The one justified assertion in `tests/unit/testHelpers.ts`
 * (`asWebGLRendererForSparkTest`) is a documented third-party adapter and
 * is excluded by path.
 */
import { describe, it, expect } from 'vitest'
import * as ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../../')

/** Paths that contain a documented, justified third-party adapter assertion. */
const allowedAdapterPaths = new Set([
  'tests/unit/testHelpers.ts',
])

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

/**
 * Walk the TypeScript AST and find chained AsExpression nodes.
 * A chained assertion is `AsExpression(AsExpression(...))`.
 */
function findChainedAssertions(sourceFile: ts.SourceFile): string[] {
  const violations: string[] = []

  function visit(node: ts.Node): void {
    if (ts.isAsExpression(node)) {
      // Unwrap parentheses to find nested AsExpression
      let inner = node.expression
      while (ts.isParenthesizedExpression(inner)) {
        inner = inner.expression
      }
      if (ts.isAsExpression(inner)) {
        const pos = node.getStart(sourceFile)
        const lineInfo = sourceFile.getLineAndCharacterOfPosition(pos)
        violations.push(
          `${lineInfo.line + 1}:${lineInfo.character + 1}: chained assertion`,
        )
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return violations
}

/** Extract <script> content from a .svelte file for parsing. */
function extractScriptContent(content: string): string | null {
  const match = content.match(/<script[^>]*>([\s\S]*?)<\/script>/)
  return match ? match[1] : null
}

describe('no unsafe chained assertions (AST-based)', () => {
  it('no chained AsExpression nodes in src/ or tests/', () => {
    const violations: string[] = []

    for (const dir of ['src', 'tests']) {
      for (const filePath of collectFiles(resolve(root, dir))) {
        const relPath = filePath.slice(root.length + 1)
        if (allowedAdapterPaths.has(relPath)) continue

        const content = readFileSync(filePath, 'utf-8')

        let sourceContent: string | null = null
        if (filePath.endsWith('.svelte')) {
          sourceContent = extractScriptContent(content)
          if (!sourceContent) continue
        } else {
          sourceContent = content
        }

        const sourceFile = ts.createSourceFile(
          relPath,
          sourceContent,
          ts.ScriptTarget.Latest,
          true,
          filePath.endsWith('.svelte')
            ? ts.ScriptKind.TS
            : ts.ScriptKind.TS,
        )

        const fileViolations = findChainedAssertions(sourceFile)
        for (const v of fileViolations) {
          violations.push(`${relPath}: ${v}`)
        }
      }
    }

    expect(violations, 'Found chained type assertions in maintained code').toEqual([])
  })

  it('AST parser catches same-line chained assertion', () => {
    const sf = ts.createSourceFile('test.ts', 'const x = {} as unknown as string;', ts.ScriptTarget.Latest, true)
    expect(findChainedAssertions(sf)).toHaveLength(1)
  })

  it('AST parser catches multiline chained assertion', () => {
    const sf = ts.createSourceFile('test.ts', 'const x = {} as\nunknown as\nstring;', ts.ScriptTarget.Latest, true)
    expect(findChainedAssertions(sf)).toHaveLength(1)
  })

  it('AST parser catches parenthesized chained assertion', () => {
    const sf = ts.createSourceFile('test.ts', 'const x = ({} as unknown) as string;', ts.ScriptTarget.Latest, true)
    expect(findChainedAssertions(sf)).toHaveLength(1)
  })

  it('AST parser catches generic intermediate type', () => {
    const sf = ts.createSourceFile('test.ts', 'const x = {} as Partial<Foo> as Bar;', ts.ScriptTarget.Latest, true)
    expect(findChainedAssertions(sf)).toHaveLength(1)
  })

  it('AST parser ignores comments and strings', () => {
    const sf = ts.createSourceFile('test.ts',
      '// this has as unknown as string\n' +
      'const s = "as unknown as string";\n' +
      'const x = 42;',
      ts.ScriptTarget.Latest, true,
    )
    expect(findChainedAssertions(sf)).toEqual([])
  })

  it('AST parser allows single boundary assertion', () => {
    const sf = ts.createSourceFile('test.ts', 'const x = obj as SparkControls;', ts.ScriptTarget.Latest, true)
    expect(findChainedAssertions(sf)).toEqual([])
  })
})
