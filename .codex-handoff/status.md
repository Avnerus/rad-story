# Status: align the implementation with its typing claims

## Summary

Fixed all 4 remaining discrepancies between the typing claims and the actual implementation. The codebase now has zero unjustified unsafe assertions, with one documented third-party adapter exception.

## Changed files

### Production typing
- `src/lib/spark/SparkControls.ts` — Generic `FieldDef<T>` with `satisfies FieldDefs`; single `buildSparkDefaults()` function; `createDefaultSettings()` reuses it
- `src/lib/spark/deviceProfile.ts` — `buildBaseline()` reuses `buildSparkDefaults()` with `{ ...defaults, ...overrides }`
- `src/lib/types/scrollAnimator.ts` — Cast-free `isScrollAnimator` using `'prop' in obj` narrowing (Object3D's `userData: Record<string, any>` permits direct access after `in` checks)

### Tests
- `tests/unit/testHelpers.ts` — `createMockRenderer()` returns narrow `MockWebGLRenderer`; `asWebGLRendererForSparkTest()` named adapter with single assertion; `makeMockScene()` returns real `THREE.Scene`; `makeMockRenderer()` convenience wrapper
- `tests/unit/noDoubleAssertions.test.ts` — AST-based chained assertion detection using TypeScript parser; 7 focused tests proving detection of same-line, multiline, parenthesized, generic intermediate, and non-detection of comments/strings/single assertions

### Documentation
- `AGENTS.md` — Updated to document generic `FieldDefs`, shared defaults, cast-free guard, named adapter exception, AST-based regression

## Each finding mapped to fix

| # | Finding | Fix |
|---|---------|-----|
| 1 | `makeMockRenderer()` returns partial object asserted as `MockWebGLRenderer & THREE.WebGLRenderer` | `createMockRenderer()` returns `MockWebGLRenderer` (no assertion). Single assertion inside named `asWebGLRendererForSparkTest()` adapter. `makeMockScene()` returns real `THREE.Scene` — no intersection. |
| 2 | 22 per-field `as number`/`as boolean` assertions in defaults | Generic `FieldDef<T extends number \| boolean \| null>` with `satisfies FieldDefs`. Single `buildSparkDefaults()` returns `SparkSettings` with compiler-checked correlation. Both consumers reuse it. |
| 3 | `noDoubleAssertions.test.ts` excludes self, skips comments, narrow regex | AST-based: uses TypeScript `ts.createSourceFile` + `ts.isAsExpression` visitor. Catches multiline/parenthesized/generic chained assertions. Ignores comments/strings naturally. Scans own file. Adapter path in `allowedAdapterPaths`. |
| 4 | `isScrollAnimator` used `Record<string, unknown>` cast | Uses `'prop' in obj` narrowing followed by direct property access — no record cast. Works because Object3D's `userData: Record<string, any>` permits indexed access after `in` checks. |

## Assertion inventory

| Location | Pattern | Justification |
|----------|---------|---------------|
| `tests/unit/testHelpers.ts:asWebGLRendererForSparkTest()` | `mock as unknown as THREE.WebGLRenderer` | Single third-party adapter: SparkRendererOptions requires real GPU renderer (unavailable in jsdom). Documented in AGENTS.md. |

All other code is free of `as unknown`, `as any`, `Partial<T> as T`, `{} as X`, and chained assertions.

## Verification commands

| Command | Result |
|---------|--------|
| `rg -n '\bas unknown\b' src tests` | 1 match: adapter in testHelpers.ts (documented); 4 matches in noDoubleAssertions.test.ts strings (AST ignores these) |
| `rg -n '\bas any\b' src tests` | Zero matches |
| `rg -n 'Partial<[^>]+>\s+as\s+' src tests` | Zero matches |
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run test:unit` | 453 passed (29 files) |
| `npm run build` | Success |
| `npm run test:e2e` | 138 passed |

## Acceptance checklist

- [x] `FIELD_DEFS` statically correlates every key with `SparkSettings[K]` via `satisfies FieldDefs`
- [x] Exactly one shared `buildSparkDefaults()`; both consumers reuse it without assertions
- [x] `isScrollAnimator` uses `'prop' in obj` narrowing — no broad record cast
- [x] No helper return type falsely intersects a partial mock with a full class
- [x] One named adapter `asWebGLRendererForSparkTest()` with documented justification
- [x] Real `Scene` fixtures require no asserted intersection
- [x] AST-based regression detection catches multiline/parenthesized/generic, ignores comments/strings, scans own file
- [x] Zero `as unknown` in production code; zero `as any`; zero `Partial<T> as T`
- [x] AGENTS.md, status narrative, audit output, and checklist all consistent
- [x] All verification commands pass

## Risks/follow-ups

None.

## Commit(s)

- `255f697` — refactor: align typing implementation with its claims
