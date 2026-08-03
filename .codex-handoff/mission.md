# Final follow-up mission: align the implementation with its typing claims

## Objective

Fix the remaining four discrepancies in the latest sound-typing pass. Keep the changes small and make the report describe the implementation honestly; a justified, localized third-party test adapter is acceptable, but it must not be described as assertion-free.

## Findings to fix

1. `makeMockRenderer()` still returns a multiline partial object asserted as `MockWebGLRenderer & THREE.WebGLRenderer`. This is still a partial object presented as the full class and directly contradicts the report/checklist. The `rg '\{\}\s+as'` audit cannot detect this multiline form.
2. Settings defaults are not compiler-correlated as claimed:
   - `SparkControls.createDefaultSettings()` has 22 `as number` / `as boolean` / `as number | null` assertions.
   - `deviceProfile.buildBaseline()` duplicates those assertions, then adds `as SparkSettings` to both the literal and spread result.
   - `FIELD_DEFS` still uses one non-generic `FieldDef.default: number | boolean | null`, which is why the assertions are necessary.
3. `noDoubleAssertions.test.ts` excludes its own file, skips comments, scans one line at a time, and uses a narrow regex. It therefore does not enforce chained assertions across whitespace/newlines or the no-self-exemption rule stated in the mission. `AGENTS.md` documents the exemption rather than fixing it.
4. `isScrollAnimator(Object3D)` still casts the domain object to `Record<string, unknown>`, contrary to the documented preference. TypeScript's `in` narrowing can inspect each branded property without a broad record cast.

## Files likely involved

- `src/lib/spark/SparkControls.ts`
- `src/lib/spark/deviceProfile.ts`
- `src/lib/types/scrollAnimator.ts`
- `tests/unit/testHelpers.ts` and its callers
- `tests/unit/noDoubleAssertions.test.ts`
- Focused settings/guard/regression tests
- `AGENTS.md`

## Constraints and concrete implementation guidance

### Typed field definitions and defaults

Make field definitions key-correlated at their declaration, for example:

```ts
interface FieldDef<T extends number | boolean | null> {
  // validation metadata...
  default: T
}

type FieldDefs = {
  [K in keyof SparkSettings]: FieldDef<SparkSettings[K]>
}

export const FIELD_DEFS = {
  // all 22 definitions
} satisfies FieldDefs
```

Then define one shared complete defaults literal using the now-correlated `.default` values and `satisfies SparkSettings`. Export a copy-returning helper or readonly constant as appropriate. Both `createDefaultSettings()` and `buildBaseline()` must reuse it; do not duplicate 22 fields or add result assertions. `{ ...DEFAULTS, ...overrides }` should infer as `SparkSettings` naturally.

Update validation helpers to accept the appropriate generic/union field definition without reintroducing chained/broad assertions. Add a compile-time-oriented test or `satisfies` fixture proving a boolean default cannot be assigned to a numeric field and all keys are required, if feasible without expected-error clutter.

### ScrollAnimator guard

Since the parameter is already `Object3D`, use successive property checks:

```ts
return (
  'isScrollAnimator' in obj && obj.isScrollAnimator === true &&
  'applyScrollPercentage' in obj && typeof obj.applyScrollPercentage === 'function' &&
  'keyframes' in obj && Array.isArray(obj.keyframes)
)
```

Adapt to actual compiler behavior, but do not cast the full domain object to a broad record.

### Test renderer boundary

Use an explicit narrow `MockWebGLRenderer` object and one clearly named adapter at the unavoidable `SparkRendererOptions.renderer` boundary, such as `asWebGLRendererForSparkTest(mock)`. Keep the single assertion contained inside that adapter, explain why jsdom cannot construct a real GPU renderer, and return `THREE.WebGLRenderer` rather than an intersection that falsely says the object satisfies both full contracts.

All tests should otherwise use the narrow mock type. If a small dependency injection seam cleanly eliminates even this adapter without weakening production types, prefer it. A real `THREE.Scene` needs no asserted intersection; return the real scene and retain spies separately or rely on Vitest's spy handles.

The final report/checklist must explicitly acknowledge the one localized test-boundary assertion if retained. Do not claim “zero unsafe assertions of any form.”

### Regression enforcement

Use TypeScript AST parsing rather than line regexes for `.ts` files: a chained assertion is an `AsExpression` whose expression is another `AsExpression` (account for parenthesized forms). Parse Svelte `<script>` contents similarly, using an existing project parser/compiler or a careful extraction passed to the TypeScript parser. AST parsing naturally ignores comments and string literals, so the test can scan itself without exemption.

Add focused fixtures/cases proving the detector catches:

- same-line and multiline chained assertions;
- different intermediate types, including generics;
- parenthesized chained assertions;

and does not flag comments, strings, or a legitimate single boundary assertion. Do not add dependencies just for this—the `typescript` package is already installed.

## AGENTS.md update

Document:

- the generic `FieldDefs` and single shared defaults source;
- the cast-free Object3D guard;
- the one named third-party test adapter, if retained, as a narrow documented exception;
- AST-based chained-assertion enforcement with no self-exclusion.

Remove claims that are not literally true.

## Acceptance criteria

- `FIELD_DEFS` statically correlates every key with `SparkSettings[K]`.
- Exactly one shared complete defaults definition exists; both consumers reuse it without per-field or result assertions.
- `isScrollAnimator` uses no broad record/domain cast.
- No helper return type falsely intersects a partial mock with a full Three/Spark class.
- Any unavoidable WebGLRenderer assertion exists only inside one named third-party test adapter and is accurately documented.
- Real `Scene` fixtures require no asserted intersection.
- Regression detection uses syntax structure, catches multiline/parenthesized/generic chained assertions, ignores comments/strings, and scans its own file.
- Raw `rg -n '\bas unknown\b' src tests` remains empty; no `as any`, new unjustified `as never`, broad domain-record cast, or suppression workaround is introduced.
- `AGENTS.md`, status narrative, audit output, and checklist agree with the actual code.
- All reported verification passes, and every criterion is re-checked before finalizing.

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

Also run the focused regression-detector, settings, renderer, and ScrollAnimator guard tests. Report exact outcomes without overstating what text audits prove.

## Things Pi must not change

- Do not change runtime behavior, settings values/validation, scene/camera/routing behavior, renderer/reload semantics, source sync, diagnostics, or dependencies.
- Do not weaken production APIs for tests or add unrelated refactors.
- Do not modify `.codex-handoff/mission.md`.

## Expected completion report format

Write `.codex-handoff/status.md` with:

1. Summary.
2. Changed files by production typing, tests, and docs.
3. Each of the four findings mapped to its concrete fix.
4. Honest assertion inventory, explicitly naming any retained test adapter.
5. Focused tests and what they prove.
6. Exact verification results.
7. Consistent itemized acceptance checklist.
8. Risks/follow-ups or `None`.
9. Pushed commits.

Re-check every acceptance criterion before finalizing. Write `status.md` as the final action before committing and pushing; after the push, perform no further verification or modification. Push the implementation and report to the current branch.
