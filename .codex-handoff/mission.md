# Follow-up mission: make the typing cleanup genuinely sound

## Objective

Correct the first typing-cleanup pass so it removes the underlying unsafety, not only the literal `as unknown` spelling. The implementation must use honest boundary types, sound type predicates, key/value-correlated settings writes, and narrow test seams. Make the occurrence audit and completion report accurate.

## Verification findings to address

1. The required raw audit still has four matches under `src/` and `tests/`; comments were not exempt from the mission.
2. `tests/unit/noDoubleAssertions.test.ts` is self-defeating: it excludes itself, filters comments, and `execSync('rg ...')` throws when the desired state (no matches) is reached because `rg` exits 1. It also depends on an external binary during unit tests.
3. `tests/unit/createSparkStudioRenderer.test.ts` and `tests/unit/sparkStudioSettings.test.ts` replaced double assertions with `Partial<T> as T`, including `{}` presented as full `SplatMesh`/`SparkRenderer`. This explicitly violates the original narrow-test-double constraint.
4. `tests/unit/scrollAnimatorTypeGuard.test.ts` introduces `as any` and constructs a fake full `Object3D` shape. The report's claim of zero `as any` is therefore false.
5. `isScrollAnimator(unknown): obj is ScrollAnimatorLike` is unsound: it returns true for a plain object containing only a brand and function, while `ScrollAnimatorLike extends Object3D` and promises `keyframes`. Consumers then rely on properties the predicate never establishes. Several consumers still add redundant assertions after the guard.
6. `registry.ts` casts the whole `import.meta.glob` result instead of supplying Vite's generic or validating the runtime module shape.
7. `createDefaultSettings()` and `buildBaseline()` use union-valued record assertions. `setRendererField()` accepts an uncorrelated union key and union value. These compile by widening the relationship rather than proving the correct value type for each key—the exact pitfall called out in the original mission.
8. `SparkRendererWithSettings extends SparkRenderer, SparkSettings` asserts that every domain setting has the same runtime property contract. In particular, conversions such as `lodSplatCount: null -> undefined` show that the contracts are not identical. Model the real installed public renderer API rather than declaring a convenient intersection.
9. `AGENTS.md` currently blesses `Partial<T> as T`, says comment matches are acceptable, and recommends the unsound intersection/generic setter patterns. Those rules must be corrected.
10. `.codex-handoff/status.md` reports lint failure but checks “all verification commands pass.” The next report must be internally consistent and include the exact lint failure if one remains.

## Files likely involved

- `src/lib/types/scrollAnimator.ts`
- `src/lib/components/SceneRuntime.svelte`
- `src/lib/studio/scroll-animator/{transactionGuard.ts,ScrollAnimatorExtension.svelte,CameraFrustumHelper.svelte}`
- `src/lib/scenes/registry.ts`
- `src/lib/spark/{SparkControls.ts,deviceProfile.ts,createSparkStudioRenderer.ts}`
- Tests around renderer construction/settings, scene traversal, and the guard
- `tests/unit/noDoubleAssertions.test.ts` (replace or redesign)
- `AGENTS.md`
- `.codex-handoff/status.md`

Refresh the changed-file list and occurrence inventory before editing. Keep fixes scoped to the findings above.

## Constraints and implementation guidance

- Zero raw matches from `rg -n '\bas unknown\b' src tests`; this includes comments and test strings.
- Zero `as any` introduced by this work. Do not substitute `as never`, chained assertions of another form, broad record/domain casts, non-null assertions, or suppression comments.
- A type predicate may promise only facts established by its input type plus its runtime checks. A good design here is likely a guard accepting `Object3D` (because traversal/selection already supplies one) and checking the ScrollAnimator brand, callable method, and any additional domain property consumers require. If unknown input support is retained, first establish the full promised shape. Once narrowed, consumers must not re-cast to the predicate's result.
- Prefer the actual `ScrollAnimator` instances in tests. For HMR structural tests, start from a real `Object3D` and add the minimal branded domain properties through a typed helper whose return type is constructed honestly.
- Use `import.meta.glob<SceneModule>(pattern, { eager: true })` or validate unknown module values with a runtime guard. Do not assert the returned record wholesale.
- Preserve key/value correlation for heterogeneous settings. Good options include:
  - field definitions carrying a typed setter/apply callback;
  - an exhaustive switch that narrows each key and applies the corresponding correctly typed value;
  - constructing defaults from a complete typed literal checked with `satisfies SparkSettings`;
  - a generic callback invoked while `K` remains correlated with `SparkSettings[K]`.
  A function accepting `keyof SparkSettings` plus `SparkSettings[keyof SparkSettings]` is not correlated.
- Inspect the installed Spark declarations and model only the renderer fields actually exposed. Keep the `null -> undefined` conversion explicit in an adapter whose input and output types reflect that difference. Do not declare `SparkRenderer & SparkSettings` merely to make indexed writes compile.
- Test doubles must describe what the unit consumes. Extract or accept narrow structural dependency interfaces where useful, use real lightweight Three objects when practical, and use typed factories/`satisfies` for minimal mocks. Do not claim a partial object is a complete heavyweight class.
- A regression rule must pass when there are genuinely zero occurrences, must not hide comments or its own file, and should not require `rg` at unit-test runtime. Prefer an ESLint AST restriction if it can cover TS and Svelte; otherwise implement a small filesystem-based test/check whose forbidden token is assembled without containing the token itself. It should detect chained double assertions, including across whitespace/newlines, without flagging documentation accidentally.
- Preserve all runtime behavior and all existing negative-path test intent. Do not relax compiler/linter settings or remove tests.
- Do not fix unrelated lint problems. If lint fails outside this diff, record the exact file/rule and mark that acceptance item honestly rather than claiming success.

## AGENTS.md update

Correct the TypeScript best-practices section so it:

- prohibits unsafe chained assertions generally, not just one spelling;
- does not recommend `Partial<T> as T`, uncorrelated generic setters, or domain intersections that are not true runtime contracts;
- documents the final sound guard, registry, renderer adapter, settings construction/mutation, globals, and test-double patterns with source references;
- states the exact regression command and zero-match expectation;
- remains concise fresh-session documentation, not an implementation log.

## Acceptance criteria

- The raw command `rg -n '\bas unknown\b' src tests` prints nothing and exits with no code matches expected.
- No unsafe substitutes exist in the changed solution: `as any`, unjustified `as never`, chained assertions, fabricated full-class mocks, broad domain-record casts, or new suppression directives.
- `isScrollAnimator` is a sound predicate; every property promised follows from its parameter type or is runtime-validated. All post-guard assertions are removed.
- Guard tests use real `Object3D`/`ScrollAnimator` values or honestly typed factories and cover malformed branded objects.
- Scene registry typing is established through the glob generic or runtime validation, not a wholesale result assertion.
- Default/baseline construction is complete and checked without union-valued record assertions.
- Every settings mutation preserves its key/value relationship.
- The Spark renderer adapter reflects the actual installed Spark property types, including the automatic `lodSplatCount` representation.
- Renderer/scene/mesh tests use narrow seams, real instances, or honest factories—never `Partial<T> as T`.
- The regression enforcement succeeds in the true zero-match state and cannot exempt its own violation.
- `AGENTS.md` documents only the final sound patterns.
- Reported verification and checklist results are mutually consistent.
- Re-check every acceptance item before finalizing.

## Tests to run

Add or update focused tests for the sound guard, malformed objects, typed settings adapters, and regression enforcement. Then run:

```sh
rg -n '\bas unknown\b' src tests
rg -n '\bas any\b|\bas never\b|Partial<[^>]+>\s+as\s+' src tests
npm run check
npm run lint
npm run test:unit
npm run build
npm run test:e2e
git diff --check
```

The first two audits should produce no relevant unsafe-code matches. Explain any legitimate pre-existing result precisely rather than filtering it away.

## Things Pi must not change

- Do not change scene/routing/camera behavior, Spark defaults or validation, profile resolution, source-sync rules, renderer/reload semantics, e2e diagnostic behavior, or dependencies.
- Do not weaken public types solely for mocks.
- Do not delete negative tests or reduce their assertions.
- Do not modify unrelated files or `.codex-handoff/mission.md`.

## Expected completion report format

Write `.codex-handoff/status.md` with:

1. Summary of the corrected type-boundary design.
2. Changed files grouped by production, tests, and documentation.
3. Each verification finding above mapped to its fix.
4. Raw occurrence/unsafe-substitute audit outputs.
5. Tests added or changed and what they prove.
6. Exact verification commands and honest outcomes, including the exact lint blocker if any.
7. Itemized acceptance checklist with no contradictory claims.
8. Remaining risks/follow-ups or `None`.
9. Pushed commit hashes and subjects.

Re-check all acceptance criteria immediately before finalizing. Always write `status.md` as the last action before committing and pushing. After the final push, perform no more verification or modifications. Push the implementation and report to the current branch.
