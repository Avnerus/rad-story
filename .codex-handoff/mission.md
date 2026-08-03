# Mission: eliminate double assertions and establish clean type boundaries

## Objective

Remove every `as unknown` double assertion from the maintained application and test code, replacing each one with accurate, maintainable TypeScript typing. Fix the underlying type boundaries rather than disguising the same unsafety with `as any`, broad casts, non-null assertions, suppression comments, or unvalidated generic records. Preserve runtime behavior.

The current baseline is **92 occurrences across 20 files** under `src/` and `tests/` (`rg -n '\bas unknown\b' src tests`). Treat that search as the authoritative starting inventory, but also clean up directly adjacent typing where necessary to make the replacements sound.

## Files likely involved

- Runtime/component boundaries:
  - `src/lib/components/SceneRuntime.svelte`
  - `src/lib/components/SparkSplats.svelte`
  - `src/lib/scenes/registry.ts`
- Spark settings and renderer integration:
  - `src/lib/spark/SparkControls.ts`
  - `src/lib/spark/deviceProfile.ts`
  - `src/lib/spark/createSparkStudioRenderer.ts`
  - `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- Scroll Animator Studio integration:
  - `src/lib/studio/scroll-animator/ScrollAnimatorExtension.svelte`
  - `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte`
- Shared declarations/types (add a focused `.d.ts` or type module if appropriate):
  - `src/lib/types.ts`, `src/lib/types/`, or a narrowly named new declaration file
- Tests and fixtures currently containing double assertions:
  - `tests/fixtures/spark-stub.ts`
  - `tests/unit/createSparkStudioRenderer.test.ts`
  - `tests/unit/sparkStudioSettings.test.ts`
  - `tests/unit/profileSettingsTransaction.test.ts`
  - `tests/unit/profileValidation.test.ts`
  - `tests/unit/sceneObjects.test.ts`
  - `tests/unit/sceneTraversal.test.ts`
  - `tests/unit/sparkControlsTransactions.test.ts`
  - `tests/e2e/scene-routing.spec.ts`
  - `tests/e2e/rad-story.spec.ts`
  - `tests/e2e/playback-edit.spec.ts`
- `AGENTS.md`

Use `rg -l '\bas unknown\b' src tests` to refresh this list before editing; it is possible the branch changes while the mission is in progress.

## Constraints

- End state: zero matches for `\bas unknown\b` under `src/` and `tests/`.
- Do not mechanically replace double assertions with `as any`, `as never`, broad `Record<string, unknown>` assertions, `!`, `@ts-ignore`, or weakened compiler/linter settings.
- A single assertion at a genuine external boundary is acceptable only when TypeScript cannot infer an already-established truth and the asserted type is narrow. Prefer parsing, a type guard, a typed adapter, module/global augmentation, `satisfies`, or a typed factory first.
- Keep `strict` TypeScript behavior. Do not relax `tsconfig.json`, Svelte checking, or ESLint rules.
- Preserve all runtime semantics, public behavior, scene source-sync behavior, Spark reload behavior, and e2e diagnostics. This is a typing/refactoring mission, not a feature redesign.
- Avoid new production dependencies unless there is a compelling and documented reason.
- Keep production-only abstractions out of test code and test-only globals out of the ordinary public API. Shared diagnostic declarations may live in a clearly named ambient test/e2e declaration that is included by the existing TypeScript config.
- Do not widen core domain models merely to accommodate incomplete mocks. Give mocks deliberate narrow interfaces/factories instead.
- Do not edit unrelated files or reformat unrelated code.

## Implementation tips

Work by type-boundary category, not line by line:

1. **Browser diagnostic globals:** Define an explicit `Window`/`globalThis` contract for `__spark_stub`, diagnostic functions/data, UUIDs, activation gates, active controls, and fixture callbacks. Reuse exported diagnostic interfaces where production and e2e genuinely share a shape. Make optionality match lifecycle reality, and use normal property access/delete afterward. Avoid an untyped index signature on `Window`.
2. **Branded Three.js objects:** Add or reuse narrow type guards such as `isScrollAnimator(value): value is ScrollAnimator` (or a minimal branded structural interface where importing the concrete class would create coupling). Let `scene.traverse` narrow before calling `applyScrollPercentage`. Type Studio selection guards similarly so ScrollAnimator properties need no double cast.
3. **Dynamic scene registry:** Give `import.meta.glob` an appropriate generic module shape and validate the module/default export at the boundary. Do not cast the entire module through `unknown`; retain the current fallback/validation semantics only if they are actually required by Vite's typed result.
4. **Keyed settings writes:** Avoid casting controllers/settings/renderers to `Record<string, unknown>`. Prefer a typed key/value relationship (`K extends keyof ...`), a typed field-definition map whose setter preserves each value type, or an exhaustive setter/apply function. Be alert that a union key plus union value is not proof that a matching key/value pair exists. An exhaustive switch or per-field typed callback is often clearer and safer for the 22 heterogeneous fields.
5. **Third-party Spark/Three boundaries:** First check the installed public types. If the runtime object truly has a missing/mistyped public member, contain that mismatch in one narrow adapter or accurate module augmentation and document why. For `SplatMesh`/`Object3D`, use the real inheritance/type relationship when present; do not perpetuate library-shape assumptions through casts. For optional internal pager probing, use a runtime predicate that validates the accessed structure.
6. **Test doubles:** Create small typed factory helpers using `Pick<>`, explicit minimal dependency interfaces, and `satisfies`. If production functions currently require huge concrete WebGL/Scene/Spark classes but only consume a few members, consider accepting a narrow structural interface at the internal seam without weakening the public runtime contract. Do not fabricate fully typed class instances from `{}`.
7. **Deliberately invalid-input tests:** Express compile-time-invalid calls with a narrowly scoped `@ts-expect-error` only when the test specifically verifies runtime hardening against untyped callers, and explain that intent. Better still, expose/test a validation function whose input is honestly `unknown` when validation is the actual contract. Never replace these with `as never` merely to satisfy the search.
8. **Mutation tests:** When a test needs to invoke a real writable property, use the real property type. When it intentionally models an external transaction payload, construct and validate that payload at the same boundary production uses rather than mutating through `Record<string, unknown>`.
9. **Regression prevention:** Add an ESLint restriction or a small test/script that fails on `as unknown as` / `as unknown` in maintained TS/Svelte code if it fits the existing tooling cleanly. Do not make a brittle check that scans dependencies or generated output. The acceptance grep remains required regardless.

Critical illustrative pattern (adapt names to the real domain; do not copy blindly):

```ts
interface SceneModule {
  default: ComponentType
}

const modules = import.meta.glob<SceneModule>('./[a-z0-9_]*.svelte', { eager: true })
```

For globals, prefer a precise ambient declaration rather than casting `window`:

```ts
declare global {
  interface Window {
    __spark_stub?: boolean
    __camera_frustum_helper_diagnostic?: () => CameraFrustumDiagnostic
  }
}
```

## AGENTS.md update

Update `AGENTS.md` with concise, current typing guidance and source references that a fresh agent can act on. Include:

- the preferred patterns for typed browser diagnostics, branded-object narrowing, typed dynamic scene modules, heterogeneous settings mutation, and narrow test doubles;
- a rule prohibiting double assertions and cast substitutions that merely move unsafety (`as any`, `as never`, broad record casts);
- where the shared types/guards/factories introduced by this mission live;
- the command used to enforce the zero-occurrence invariant;
- any architecture facts changed by the implementation.

Keep this as durable best-practice documentation, not a chronological implementation log.

## Acceptance criteria

- `rg -n '\bas unknown\b' src tests` returns no matches.
- No replacement pattern evades the goal (`as any`, unjustified `as never`, broad record assertions, suppression comments, non-null assertions, or weakened configs).
- Runtime/external values are checked with sound narrowing before use.
- Browser/e2e globals have one precise, reusable contract with lifecycle-accurate optional properties.
- ScrollAnimator traversal and Studio selection use a reusable type guard or real class type.
- Scene registry modules are typed at `import.meta.glob` or validated through a sound boundary.
- Spark setting key/value writes maintain the correct correlation between each key and its value type.
- Test doubles model only the interfaces consumed by the unit under test and no longer pretend `{}` is a full Three/Spark class instance.
- Existing behavior and test intent remain unchanged.
- New unit tests cover any new type guards, runtime validators, adapters, or helpers with meaningful behavior.
- A maintainable regression check is added if feasible with current tooling.
- `AGENTS.md` contains concise, up-to-date typing best practices and source references.
- All verification commands below pass.
- Re-check every item in this Acceptance criteria section immediately before finalizing.

## Tests to run

Run at minimum:

```sh
rg -n '\bas unknown\b' src tests
npm run check
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

Also add and run focused new unit tests for any runtime type guards/validators/adapters introduced. If a full e2e run is environment-blocked, report the exact blocker and run the most relevant affected specs where possible; do not silently omit it.

## Things Pi must not change

- Do not change scene URLs, routes, camera animation semantics, source-sync allowlists, Spark setting defaults/bounds, profile resolution, renderer behavior, reload coordination, or diagnostic behavior.
- Do not weaken types or validation to make tests compile.
- Do not remove useful negative-path tests just because their inputs are awkward to type.
- Do not add generated/build artifacts or unrelated cleanup.
- Do not modify `.codex-handoff/mission.md`.

## Expected completion report format

Write the report to `.codex-handoff/status.md` with:

1. **Summary** — concise description of the typing strategy and outcome.
2. **Changed files** — grouped by production types/boundaries, tests/fixtures, and documentation.
3. **Occurrence audit** — starting count, final `rg` result, and a note confirming no unsafe substitute patterns were introduced.
4. **Key design decisions** — especially globals, type guards, registry typing, heterogeneous settings writes, third-party adapters, and mock seams.
5. **Tests added/updated** — what each new test protects.
6. **Verification** — exact commands and pass/fail outcomes (include any blocker verbatim).
7. **Acceptance checklist** — every criterion above checked individually.
8. **Risks/follow-ups** — remaining concerns, or `None`.
9. **Commit(s)** — hashes and subjects pushed to the current branch.

Always write `status.md` as the **last action before committing and pushing**. After the final push, perform no more verification, edits, or modifications. Before writing that report, re-check that every Acceptance criteria item is met. Push the completed implementation and report to the current branch.
