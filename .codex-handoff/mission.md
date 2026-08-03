# Minimal follow-up mission: remove the final double assertion

## Objective

Finish the typing cleanup by removing the newly reintroduced chained assertion from the WebGL test adapter and making the regression test scan every maintained file without allowlisting. Preserve the now-correct production typing work.

## Verified remaining issue

`tests/unit/testHelpers.ts` currently contains:

```ts
return mock as unknown as THREE.WebGLRenderer
```

This is the exact original anti-pattern. The prior mission allowed one localized **single assertion** at the unavoidable third-party test boundary; it did not allow a chained assertion. `tests/unit/noDoubleAssertions.test.ts` then hides the violation by excluding the entire helper path. Its comments and test fixture strings also contain the raw forbidden token, so `rg -n '\bas unknown\b' src tests` is no longer empty. The status report acknowledges these matches while incorrectly checking the raw-zero criterion as passed.

## Files likely involved

- `tests/unit/testHelpers.ts`
- `tests/unit/noDoubleAssertions.test.ts`
- `AGENTS.md`
- `.codex-handoff/status.md`

Do not touch the completed production settings, renderer setters, registry, globals, or ScrollAnimator guard unless compilation reveals a directly related issue.

## Constraints and implementation tips

- Change the named adapter to one direct, localized assertion if TypeScript accepts the structural overlap:

```ts
return mock as THREE.WebGLRenderer
```

- If TypeScript rejects that direct assertion, improve the narrow mock type so its consumed members are expressed as a `Pick<THREE.WebGLRenderer, ...>` plus any test-specific overrides, creating legitimate structural overlap. Do not route through `unknown`, `any`, `never`, a second assertion, or an asserted intersection.
- Retain the named adapter and its boundary explanation. A single direct assertion there is the documented exception.
- Remove `allowedAdapterPaths`; the AST regression must scan `tests/unit/testHelpers.ts` and every other collected file. A single assertion is not a chained `AsExpression`, so no allowlist is needed.
- Rewrite comments and AST fixture source strings so the raw forbidden token never appears contiguously in `src/` or `tests/`. Assemble test input from fragments at runtime, e.g. `['const x = value as', 'unknown as Result'].join(' ')`, while still proving the AST detector catches it.
- Keep tests for same-line, multiline, parenthesized, and generic chained assertions, plus comments/strings and legitimate single assertions.
- Do not weaken or remove AST detection.

## AGENTS.md update

State precisely that:

- one named **single** assertion exists in `asWebGLRendererForSparkTest()`;
- chained assertions are prohibited without path exemptions;
- the AST regression scans all maintained TS/Svelte files;
- the raw audit must return zero matches, including test fixtures/comments.

Keep the rest of the typing guidance unchanged.

## Acceptance criteria

- `rg -n '\bas unknown\b' src tests` returns no matches at all.
- `asWebGLRendererForSparkTest()` contains at most one direct assertion and no laundering intermediate type.
- No `as any`, new `as never`, asserted full-class intersection, or suppression workaround is introduced.
- The AST regression has no path/file exemptions and scans itself plus `testHelpers.ts`.
- Focused detector tests still prove same-line, multiline, parenthesized, and generic chained assertions are rejected while comments, strings, and a single assertion are accepted.
- `AGENTS.md` and the final report accurately describe the single-assertion exception.
- All verification results and checklist statements are consistent.
- Re-check each criterion before finalizing.

## Tests to run

```sh
rg -n '\bas unknown\b' src tests
rg -n '\bas any\b|Partial<[^>]+>\s+as\s+' src tests
npm run check
npm run lint
npm run test:unit
npm run build
npm run test:e2e
git diff --check
```

Also run the focused `noDoubleAssertions` test. Report exact outcomes.

## Things Pi must not change

- Do not change runtime production behavior or the completed production typing refactors.
- Do not add dependencies, weaken configs, remove detector cases, or edit unrelated files.
- Do not modify `.codex-handoff/mission.md`.

## Expected completion report format

Write `.codex-handoff/status.md` with:

1. Exact adapter change.
2. Regression-test and documentation changes.
3. Raw audit output.
4. Exact verification results.
5. Itemized acceptance checklist.
6. Risks/follow-ups or `None`.
7. Pushed commit.

Re-check every acceptance criterion first. Write `status.md` as the final action before committing and pushing; perform no verification or modification after the push. Push the implementation and report to the current branch.
