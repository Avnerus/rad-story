# Follow-up mission: finish the sound-typing cleanup

## Objective

Resolve the remaining soundness defects in the second pass. Do not rename or relocate unsafe assertions and then describe them as narrow typing. The final code and report must match the actual contracts.

## Remaining verification findings

1. `tests/unit/testHelpers.ts` is not narrow:
   - `MockWebGLRenderer extends THREE.WebGLRenderer` and `MockScene extends THREE.Scene`, so both still promise the complete heavyweight class contracts.
   - Their factories return partial object literals via `as MockWebGLRenderer` / `as MockScene`.
   - `makeMockSplatMesh()` and `makeMockSparkRenderer()` still return `{}` asserted as full Spark classes.
   This is precisely the fabricated-full-class pattern the mission and updated `AGENTS.md` prohibit.
2. The `unknown` overload of `isScrollAnimator` is unsound. A `uuid` property does not establish an `Object3D`; `transactionGuard.test.ts` explicitly expects a plain `{ uuid, brand, method, keyframes }` object to narrow to an interface extending `Object3D`.
3. `makeFakeScrollAnimator()` still ends in `obj as ScrollAnimatorLike`, even though it starts with a real `Object3D`. The type model/factory should make the augmentation honest without a whole-domain assertion.
4. `createDefaultSettings()` and `buildBaseline()` still rely on `Object.fromEntries(...) as SparkSettings`; `buildBaseline()` also asserts the spread result again. This does not statically prove that `SETTINGS_KEYS` is complete or that every field definition default is correlated with its key.
5. `noDoubleAssertions.test.ts` checks only the exact same-line substring assembled as `'as ' + 'unknown'`. It does not enforce the documented rule against unsafe chained assertions generally or across whitespace/newlines, and it would not catch the fabricated single assertions currently in `testHelpers.ts`.
6. `AGENTS.md` claims the guard is sound and the test doubles are narrow, while the implementation above contradicts those claims.

## Files likely involved

- `tests/unit/testHelpers.ts`
- `tests/unit/{createSparkStudioRenderer.test.ts,sparkStudioSettings.test.ts,scrollAnimatorTypeGuard.test.ts,transactionGuard.test.ts,noDoubleAssertions.test.ts}`
- `src/lib/types/scrollAnimator.ts`
- `src/lib/studio/scroll-animator/transactionGuard.ts`
- `src/lib/spark/{SparkControls.ts,deviceProfile.ts}` and their focused tests
- `AGENTS.md`

Keep the work scoped to these findings and any directly necessary type seams.

## Constraints and implementation tips

- A “narrow” interface should use `Pick<>` or explicitly declare only consumed members; it must not extend the full class it is meant to avoid mocking.
- Prefer real lightweight Three instances (`new Scene()`, `new Object3D()`) and spies on real methods where practical.
- For an external constructor that requires a heavyweight concrete type, create a deliberate dependency seam or one localized adapter at that third-party boundary. Tests should inject a typed fake through that seam. Do not scatter full-class assertions through fixtures.
- For identity-only values, reuse real instances already created by the test, use a legitimate lightweight subclass/instance, or change the internal test seam to an honest identity type. Never return `{}` as `SplatMesh`/`SparkRenderer`.
- Make `isScrollAnimator` sound in one of these ways:
  - accept `Object3D` only, since scene traversal and Studio selection provide it, and make the transaction type reflect Studio's public object contract; or
  - separate an unknown structural predicate from the Object3D predicate so the unknown version promises only the properties it actually validates; or
  - fully establish the required Object3D contract before promising `ScrollAnimatorLike`.
  A `uuid` string alone is not an Object3D check. Tests must reject lookalike plain objects and remove the current expectation that they pass.
- Build HMR fixtures with a small real subclass of `Object3D` implementing the branded fields, which naturally satisfies the interface without asserting the finished object.
- For settings defaults, make completeness and key/value correlation compiler-checked. Prefer a complete typed literal or a generic field-definition model such as `{ [K in keyof SparkSettings]: FieldDef<SparkSettings[K]> }` plus one well-explained standard-library conversion helper. A bare `Object.fromEntries(...) as SparkSettings` at each call site is not sufficient proof. Remove redundant assertions from spreads.
- Regression enforcement must align with the documented rule. Prefer an ESLint AST restriction for chained TS assertions and add focused tests for the custom rule/check if needed. A textual fallback must handle arbitrary whitespace/newlines and more than one laundering intermediate type; it must not exempt its own violations. Separately enforce the project-specific ban on fabricated test-class assertions through reviewable typed seams rather than pretending a token check proves semantic soundness.
- Preserve runtime behavior. Do not weaken compiler/linter settings, change dependencies, or remove behavioral/negative tests.

## AGENTS.md update

Update the typing section to describe only the final implementation:

- the actual narrow test/dependency seams and where they live;
- the exact contract of each ScrollAnimator predicate;
- the compiler-checked settings default construction;
- what the regression rule really detects and its limitations;
- continued prohibition on fabricated class mocks and unsafe chained assertions.

Keep it concise and useful in a fresh session.

## Acceptance criteria

- No test helper interface extends a full Three/Spark class while claiming to be narrow.
- No partial object or `{}` is asserted as `WebGLRenderer`, `Scene`, `SplatMesh`, `SparkRenderer`, or an alias extending those types.
- Test fixtures use real instances, legitimate subclasses, or honest narrow dependency seams.
- No predicate narrows a plain uuid-bearing object to `Object3D`/`ScrollAnimatorLike`.
- Plain lookalike objects are rejected; real/HMR-safe Object3D-derived animators are accepted without post-construction domain assertions.
- Settings defaults are compiler-checked for all keys and correct per-key value types; redundant result assertions are removed.
- The regression mechanism enforces the rule it claims to enforce and passes when the repository is clean.
- Raw `rg -n '\bas unknown\b' src tests` remains empty; no `as any`, new unjustified `as never`, new chained assertion, broad domain-record cast, or suppression workaround is introduced.
- `AGENTS.md` matches the real solution.
- All reported checks and the final checklist are consistent.
- Re-check each acceptance item before finalizing.

## Tests to run

Add/update focused tests for plain-object rejection, legitimate Object3D-derived HMR fixtures, settings completeness/correlation, dependency seams, and regression enforcement. Run:

```sh
rg -n '\bas unknown\b' src tests
rg -n '\bas any\b|Partial<[^>]+>\s+as\s+|\{\}\s+as\s+' src tests
npm run check
npm run lint
npm run test:unit
npm run build
npm run test:e2e
git diff --check
```

Report exact outcomes. If an audit has a legitimate match, explain it precisely and do not mark that criterion passed without reconciling it.

## Things Pi must not change

- Do not change scene/routing/camera behavior, Spark defaults/validation, source-sync rules, renderer/reload semantics, diagnostics, or dependencies.
- Do not weaken production APIs merely to make incomplete mocks compile.
- Do not delete negative tests, reduce assertions, or modify unrelated files.
- Do not modify `.codex-handoff/mission.md`.

## Expected completion report format

Write `.codex-handoff/status.md` with:

1. Summary of the final type-boundary design.
2. Changed files grouped by production seams/types, tests, and documentation.
3. Each numbered finding mapped to concrete code changes.
4. Audit outputs, including any matches and their disposition.
5. Focused tests and what they prove.
6. Exact verification commands/results.
7. Itemized acceptance checklist consistent with those results.
8. Remaining risks/follow-ups or `None`.
9. Pushed commits.

Re-check every acceptance item before finalizing. Write `status.md` as the last action before committing and pushing, then perform no further verification or modification after the push. Push the implementation and report to the current branch.
