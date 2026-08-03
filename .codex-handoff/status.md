# Status: make the typing cleanup genuinely sound

## Summary

Corrected the first typing-cleanup pass so it removes underlying unsafety, not only the literal `as unknown` spelling. All 10 verification findings from the follow-up mission are addressed.

## Changed files

### Production types/boundaries
- `src/lib/types/scrollAnimator.ts` — Sound `isScrollAnimator()` with overloads for `Object3D` and `unknown`, validates uuid brand + isScrollAnimator flag + callable applyScrollPercentage + keyframes array
- `src/lib/scenes/registry.ts` — `import.meta.glob<SceneModule>()` generic instead of wholesale record assertion
- `src/lib/spark/SparkControls.ts` — `createDefaultSettings()` uses `SETTINGS_KEYS.map()` + `Object.fromEntries()`
- `src/lib/spark/deviceProfile.ts` — `buildBaseline()` uses same pattern; imports `SETTINGS_KEYS`
- `src/lib/spark/createSparkStudioRenderer.ts` — `RENDERER_SETTERS` exhaustive map with per-field typed setters and explicit `lodSplatCount` null→undefined; removed `SparkRendererWithSettings` intersection

### Production consumers
- `src/lib/components/SceneRuntime.svelte` — Removed redundant post-guard cast; removed unused `ScrollAnimatorLike` import
- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte` — Uses narrowed `obj` directly after guard; removed unused `ScrollAnimatorLike` import
- `src/lib/studio/scroll-animator/ScrollAnimatorExtension.svelte` — Removed redundant post-guard casts; keeps `ScrollAnimatorLike` type for `$derived` annotation
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte` — Removed `as unknown` from comment

### Tests
- `tests/unit/testHelpers.ts` (new) — Narrow `MockWebGLRenderer`, `MockScene` interfaces and `makeMockSplatMesh()`, `makeMockSparkRenderer()` factories
- `tests/unit/createSparkStudioRenderer.test.ts` — Uses shared helpers; removed `Partial<T> as T`; removed unused `SplatMesh` import
- `tests/unit/sparkStudioSettings.test.ts` — Uses shared helpers; removed local mock factories
- `tests/unit/scrollAnimatorTypeGuard.test.ts` — Removed all `as any`; uses real `Object3D` + `Object.defineProperty` fixtures; added malformed-object tests
- `tests/unit/sceneTraversal.test.ts` — `FakeScrollAnimator` includes `keyframes` array; removed post-guard casts; removed unused import
- `tests/unit/sceneObjects.test.ts` — Uses real `ScrollAnimator.keyframes` directly; removed unused import
- `tests/unit/transactionGuard.test.ts` — Honest structural fixtures with all validated properties; added missing-property rejection tests
- `tests/unit/noDoubleAssertions.test.ts` — Filesystem-based check assembling forbidden token at runtime; no self-exemption or comment filtering
- `tests/unit/cameraDiagnosticsGating.test.ts` — Fixed pre-existing `no-regex-spaces` lint error

### E2e helpers
- `tests/e2e/stubHelpers.ts` — Removed `as unknown` from comment

### Documentation
- `AGENTS.md` — Corrected typing best practices section

## Verification findings mapped to fixes

| # | Finding | Fix |
|---|---------|-----|
| 1 | 4 raw `as unknown` matches in comments | Removed from stubHelpers.ts, SparkControlsExtension.svelte, noDoubleAssertions.test.ts. Zero matches remain. |
| 2 | noDoubleAssertions.test.ts self-exempting, filtering comments, depending on `rg` binary | Replaced with filesystem-based check that assembles the forbidden token at runtime (`'as ' + 'unknown'`) and scans all `.ts`/`.svelte` files under `src/` and `tests/` without exemptions. |
| 3 | `Partial<T> as T` for full-class mocks | Replaced with narrow `MockWebGLRenderer`/`MockScene` interfaces in `testHelpers.ts` describing only consumed members. `makeMockSplatMesh()`/`makeMockSparkRenderer()` for identity-only test values. |
| 4 | `as any` in scrollAnimatorTypeGuard.test.ts | Removed all 4 occurrences. Uses real `Object3D` instances with `Object.defineProperty` for HMR-safe branded fixtures. |
| 5 | `isScrollAnimator` unsound — returns true for plain objects | Now validates: `uuid` in obj (Object3D brand), `isScrollAnimator === true`, `typeof applyScrollPercentage === 'function'`, `Array.isArray(keyframes)`. Overloads for `Object3D` and `unknown`. All post-guard casts removed. |
| 6 | `registry.ts` casts whole `import.meta.glob` result | Uses `import.meta.glob<SceneModule>()` generic where `SceneModule { default: ComponentType }`. |
| 7 | Uncorrelated union key/value in settings construction | `createDefaultSettings()` and `buildBaseline()` use `SETTINGS_KEYS.map(key => [key, FIELD_DEFS[key].default])` + `Object.fromEntries()`. `RENDERER_SETTERS` exhaustive map preserves key/value correlation. |
| 8 | `SparkRendererWithSettings` intersection not a true runtime contract | Removed. Replaced with `RENDERER_SETTERS` exhaustive map where each entry is a typed `(r: SparkRenderer, v: SparkSettings[K]) => void` lambda. `lodSplatCount` null→undefined is explicit. |
| 9 | AGENTS.md recommended unsafe patterns | Corrected: prohibits all chained assertions, does not recommend `Partial<T> as T` or unsound intersections, documents final sound patterns. |
| 10 | status.md claimed all pass but lint had pre-existing error | Fixed the pre-existing `no-regex-spaces` lint error. All verification commands now pass cleanly. |

## Raw occurrence audit

```
$ rg -n '\bas unknown\b' src tests
(no output, exit code 1 — zero matches)

$ rg -n '\bas any\b' src tests
(no output — zero matches)

$ rg -n '\bas never\b' src tests
42 pre-existing matches (activeSparkControlsRuntime.test.ts, SparkControls.ts) — unchanged from baseline

$ rg -n 'Partial<[^>]+>\s+as\s+' src tests
(no output — zero matches)
```

## Tests added/changed

| File | Change | Purpose |
|------|--------|---------|
| `tests/unit/scrollAnimatorTypeGuard.test.ts` | Rewritten (13 tests) | Sound guard with real Object3D fixtures, malformed-object rejection, narrowing verification |
| `tests/unit/noDoubleAssertions.test.ts` | Rewritten (1 test) | Filesystem-based regression check, no self-exemption |
| `tests/unit/testHelpers.ts` | New | Narrow mock interfaces and factories |
| `tests/unit/transactionGuard.test.ts` | Extended (3 new tests) | Honest structural fixtures, missing-property rejection |
| `tests/unit/sceneTraversal.test.ts` | Updated | FakeScrollAnimator includes keyframes array |
| `tests/unit/cameraDiagnosticsGating.test.ts` | Fixed | Pre-existing lint error |

Total: 453 unit tests pass, 138 e2e tests pass.

## Verification

| Command | Result |
|---------|--------|
| `rg -n '\bas unknown\b' src tests` | Zero matches |
| `rg -n '\bas any\b' src tests` | Zero matches |
| `rg -n 'Partial<[^>]+>\s+as\s+' src tests` | Zero matches |
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run test:unit` | 453 passed (29 files) |
| `npm run build` | Success |
| `npm run test:e2e` | 138 passed |

## Acceptance checklist

- [x] `rg -n '\bas unknown\b' src tests` prints nothing
- [x] No unsafe substitutes: zero `as any`, zero `as never` introduced, zero `Partial<T> as T`, zero `@ts-ignore`, zero broad domain-record casts
- [x] `isScrollAnimator` is a sound predicate — validates uuid, brand, callable method, and keyframes array
- [x] All post-guard assertions removed from consumers
- [x] Guard tests use real Object3D/ScrollAnimator values and honestly typed factories; cover malformed branded objects
- [x] Scene registry uses `import.meta.glob<SceneModule>()` generic
- [x] Default/baseline construction uses `SETTINGS_KEYS.map()` + `Object.fromEntries()` without union-valued assertions
- [x] Every settings mutation preserves key/value relationship (exhaustive `RENDERER_SETTERS` map)
- [x] Spark renderer adapter reflects actual installed types with explicit `lodSplatCount` null→undefined
- [x] Test doubles use narrow seams (`MockWebGLRenderer`, `MockScene`) — never `Partial<T> as T`
- [x] Regression enforcement succeeds in true zero-match state, does not exempt its own file or filter comments
- [x] AGENTS.md documents only final sound patterns
- [x] Verification results are mutually consistent — no contradictory claims
- [x] Pre-existing lint error fixed

## Risks/follow-ups

None. The 42 pre-existing `as never` occurrences in `activeSparkControlsRuntime.test.ts` and `SparkControls.ts` are outside the scope of this mission and were present in the baseline.

## Commit(s)

- `484bafe` — refactor: make typing cleanup genuinely sound
