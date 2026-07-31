# Follow-up mission: make persisted profile overrides authoritative and undoable

## Objective

Fix the blocking disconnect in the profile-aware Spark Controls implementation. The current code can make Studio write a nested `profileSettings` object into a scene's `<T>` attribute, but that persisted object is not an authoritative runtime input after HMR/reload and transaction undo/redo writes an inert property instead of restoring effective Spark settings.

Do not treat the previous status as accepted. Preserve the useful global-baseline/minimal-diff work, but complete the data flow so the literal scene value, live controller, Studio transaction, HMR/reload, playback, and undo/redo all represent the same state.

## Verified defects

1. `baby_yoda.svelte` constructs `SparkControls` from a separate script variable initialized with empty overrides:

   ```ts
   let profileSettings = $state({ desktop: {}, mobile: {} })
   createSceneObjects(..., untrack(() => profileSettings))
   ```

   Studio rewrites the `<T>` attribute, not that script initializer. A full reload therefore constructs the controller from empty overrides.

2. `<T is={sparkControls} profileSettings={...} />` assigns `profileSettings` after construction, but `SparkControls` has no declared writable `profileSettings` property or setter. The assigned value is not merged into `settings` and does not reach renderers.

3. `buildTransaction({ object: controls, propertyPath: 'profileSettings' })` makes transaction commit/undo/redo write `controls.profileSettings`. Because that property is inert, undo/redo does not restore `controls.settings`. The added unit test does not exercise the transaction's `write`; it manually assigns `controls.settings`, so it cannot prove undo/redo behavior.

4. `SparkControlsExtension` initializes its local override map by diffing the active controller and preserves the inactive profile from its own initially empty local object. It cannot read the scene's persisted inactive-profile overrides, so a later edit can erase them.

5. The committed authored `<T>` declaration is `profileSettings={profileSettings}`, not a literal visibly containing both `desktop` and `mobile` parents as required. The prior status shows an inline literal as the claimed final shape, but the checked-in source contradicts it.

6. Profile detection is duplicated: the app creates `profile` from `getDeviceProfile()`, while the scene independently calls `detectProfileName()`. Establish one startup detection result and propagate it.

7. Manual real-dev-server source-sync verification is sufficient; a new automated source-mutating e2e test is not required. However, the previous manual check inspected source rewrites only and did not prove that persisted overrides affect effective runtime/controller/renderer values after a cold reload.

8. The claimed original root cause remains unproven. Studio's updater can rewrite mustache expressions generally, and the report contains no concrete Vite-side failure/error. Do not retain “computed expression” as the root cause without evidence.

## Files likely involved

- `src/lib/spark/SparkControls.ts`
- `src/lib/spark/deviceProfile.ts`
- `src/lib/types.ts`
- `src/lib/scenes/sceneObjects.ts`
- Every authored scene `.svelte` file, currently `src/lib/scenes/baby_yoda.svelte`
- `src/lib/components/SceneRuntime.svelte`
- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `src/lib/studio/spark-controls/sparkSettingsTransaction.ts`
- `src/lib/studio/scroll-animator/transactionGuard.ts`
- Profile/unit tests plus the existing e2e suite
- `AGENTS.md`

## Constraints and implementation guidance

- Give `SparkControls` (or a narrowly scoped profile-aware controller abstraction) a real typed, copy-returning `profileSettings` getter and writable setter plus a stable active `profileName`.
- Assigning `profileSettings` must normalize/preserve both profile parents, merge the active profile's overrides with its complete global baseline, validate through the existing canonical settings path, update the flat effective `settings`, and emit the normal change signal so renderer propagation and pane drafts update.
- Transaction commit, undo, and redo on `propertyPath: 'profileSettings'` must therefore update both the nested overrides and live effective controller settings. Test the actual transaction `write` path; do not simulate it by separately assigning `controls.settings`.
- The extension must initialize historic/current overrides from the active controller's real copy-returning `profileSettings`, including inactive-profile data. Do not reconstruct the inactive profile from an extension-local empty object.
- Persist a direct literal on each authored scene `<T>` node, visibly containing both parents:

  ```svelte
  <T
    is={sparkControls}
    name="Spark"
    profileSettings={{
      desktop: {},
      mobile: {},
    }}
  />
  ```

  The literal `<T>` value must be the scene-local source of truth. Do not keep a duplicate `$state` initializer containing the same overrides.
- Ensure declarative `<T>` application makes the literal effective in both playback and edit modes after a cold reload. Construction may start from the detected global baseline, but the `<T>` setter must apply scene overrides deterministically.
- Store the detected `DeviceProfileName` in the single `DeviceProfile` created by `App.svelte` (or an equivalent single startup result), pass it down, and use it everywhere. Do not call device detection again inside individual scene components.
- Keep global baselines centralized and immutable. Prefer deriving legacy renderer profile values from the same canonical baseline rather than duplicating the eight profile fields in two tables.
- Use `Record<DeviceProfileName, Partial<SparkSettings>>` or an equivalently key-safe type. Avoid `Record<string, SparkSettings[keyof SparkSettings]>`, which permits a boolean value under a numeric field name.
- Maintain minimal deltas. Resetting to baseline removes the active override key; false and null remain valid own-property overrides where different from baseline.
- Preserve the inactive profile byte-for-byte/structurally across active-profile edits, source sync, HMR, undo, and redo.
- Re-check the transaction guard. Only the intended exact profile-aware root should be source-syncable for this controller unless a documented compatibility requirement justifies legacy `settings`/individual-field sync. Nested paths and transforms must remain blocked.
- Preserve selection independence, synchronous pre-mutation history snapshots, validation/coupled invariants, external-change subscriptions, renderer propagation, reload status, and `maxPagedSplats` recreation.
- Ad-hoc mode remains transient and uses the detected global profile; do not give it a file-backed scene override target.
- Use public Threlte Studio APIs only. Do not patch `node_modules`, import private production APIs, disable sync, or suppress rejected promises.
- Capture the actual original dev-server rejection if it remains reproducible. If changing the authoritative property model eliminates it before a precise Vite-side message can be obtained, state that honestly; do not assert an unsupported parser limitation.
- Keep manual source-sync mutations isolated/recoverable and restore authored scene values before finalizing.

## Acceptance criteria

- Each authored scene has one direct literal `profileSettings` `<T>` attribute with visible `desktop` and `mobile` parents and no duplicate script variable holding the same data.
- On cold desktop load, a persisted desktop override changes `SparkControls.settings`, pane input, and driving renderer; mobile override remains inactive.
- On cold emulated-mobile load, the same scene applies the persisted mobile override, reports `Mobile`, and does not apply desktop overrides.
- Playback and edit produce identical effective settings for the same profile and literal.
- The active controller exposes the complete nested persisted override state, including inactive-profile overrides, as a defensive copy.
- Editing the active profile preserves every inactive-profile override.
- Transaction commit, undo, and redo through the actual built transaction `write` update nested overrides, effective settings, pane/controller subscribers, source, and renderer behavior correctly.
- HMR/remount and full page reload preserve and apply the source-written override; tests prove runtime values after reload rather than only inspecting source text.
- Reset-to-baseline removes the redundant key from source and remains removed after reload.
- Numeric, boolean, nullable, coupled-invariant, and capacity edits retain correct types and behavior.
- Profile detection occurs once per app startup and the same explicit name drives DPR/profile data, scene controller, runtime registry, and pane badge.
- Source sync has no unhandled rejection, does not corrupt Svelte, and targets only the intended scene.
- Scene and profile isolation are proven with safe fixtures.
- Manual verification against the real Vite development server exercises source rewriting, cold reload into edit and playback, inactive-profile preservation, reset removal, undo/redo, and restoration of authored scene values. A new automated source-mutating e2e test is explicitly not required.
- Existing unit/e2e/build behavior remains green.
- `AGENTS.md` accurately describes the final authoritative flow and removes claims based on the broken intermediate design.
- Re-check every acceptance criterion before finalizing.

## Tests to add or correct

- Correct the transaction tests to call the built transaction's real `write` for commit/undo/redo values and assert both `controls.profileSettings` and `controls.settings` after each step.
- Add unit coverage for defensive copies, key-safe nested typing/normalization, inactive-profile preservation, one-time profile propagation, and baseline reset.
- Add a declarative check that every authored scene contains the direct two-parent literal and no `settings={sparkControls.settings}` or duplicate profile override initializer.
- Perform and document manual live verification through the real pane/Vite RPC. Inspect the rewritten source, cold-reload edit and playback, inspect effective controller/renderer state, cover both profiles, exercise undo/redo and reset-to-baseline, watch browser/Vite errors, and restore authored source values before finalizing. A new automated source-sync e2e test is not needed.
- Run and report:
  - `npm run check`
  - `npm run lint`
  - `npm run test:unit`
  - `npm run test:e2e`
  - `npm run build`
  - `git diff --check`

Trust neither source text alone nor live pre-reload input state; prove both source persistence and post-reload runtime application.

## Things Pi must not change

- Do not leave `profileSettings` as an undeclared/inert property on `SparkControls`.
- Do not keep duplicate scene override objects in script and markup.
- Do not reconstruct inactive overrides from extension-local state.
- Do not substitute manual `controls.settings` assignment for transaction undo/redo tests.
- Do not claim a computed-expression parser root cause without Vite-side evidence.
- Do not flatten profile overrides, persist full baseline-equal settings, or mutate global baselines.
- Do not add production scenes for tests.
- Do not regress ad-hoc behavior, Spark validation/render/reload logic, ScrollAnimator source sync, routing, cameras, or the FPS widget.
- Do not commit test-mutated scene values, generated output, private dependency patches, or unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Response to every verified defect above and the concrete correction.
2. Honest root-cause evidence for the original rejection, distinguishing observation from inference.
3. Final authoritative data-flow description from detected profile and scene literal through controller, pane, renderer, transaction, source rewrite, reload, undo, and redo.
4. Exact authored scene literal(s).
5. Changed files and purpose.
6. Unit/e2e and manual live evidence for desktop/mobile cold reload, playback/edit equality, inactive-profile preservation, minimal reset, actual transaction write/undo/redo, scene isolation, and source cleanup.
7. Exact test commands/results.
8. Item-by-item acceptance checklist.
9. Known limitations.
10. Final pushed commit hash.

Update `AGENTS.md` with concise current architecture and source/test references, removing inaccurate intermediate claims.

Always write `.codex-handoff/status.md` as the final action before pushing. Immediately beforehand, re-check every acceptance criterion. After writing the report and pushing all intended code, tests, documentation, and report changes to the current branch, perform no further verification or modification.
