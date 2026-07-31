# Mission: fix Spark Controls Studio source sync and make settings scene-owned

## Objective

Investigate and fix the blocking Spark Controls persistence failure in the real Studio editor. Editing a Spark setting currently changes the live controller, but the asynchronous Studio source-sync step rejects in the browser with:

```text
TransactionQueue.svelte.js:202 Uncaught (in promise) {}
doSync @ TransactionQueue.svelte.js:202
await in doSync
```

The fix must make Spark setting edits persist successfully into the currently edited scene's `.svelte` source file, with no unhandled console error. Each discoverable scene component must own a complete, explicit Spark settings snapshot so different scenes can retain different values and playback uses that scene's saved settings.

## Preliminary findings to verify, not assume

- `SparkControlsExtension.svelte` mutates the active controller, builds a whole-object transaction with `propertyPath: 'settings'`, and commits with source sync enabled.
- `baby_yoda.svelte` currently declares `<T is={sparkControls} ... settings={sparkControls.settings} />`. This is not an explicit scene-owned persisted snapshot; the value originates from `createSceneObjects(profile)`.
- `createSceneObjects(profile)` currently seeds only the profile-specific subset of Spark fields, while `SparkControls` supplies the remaining defaults.
- The existing preview/stub e2e suite verifies live controller changes and view/edit equality, but it does not exercise the real Vite dev-server RPC that rewrites source files. Some tests explicitly expect source sync to be unavailable. This likely allowed the failure to escape.
- Threlte Studio `buildTransaction()` derives sync metadata from `object.userData.threlteStudio`, and the Vite plugin rewrites the `<T>` attribute named by the transaction. Capture the actual built transaction metadata and Vite server-side rejection before choosing a fix.
- The browser's rejected `{}` is not a sufficient root cause. Reproduce against `npm run dev`, inspect the dev-server error/log and the targeted source metadata, and document the concrete failure mechanism.

## Files likely involved

- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `src/lib/studio/spark-controls/sparkSettingsTransaction.ts`
- `src/lib/studio/scroll-animator/transactionGuard.ts` only if its whitelist changes are truly required
- `src/lib/scenes/baby_yoda.svelte` and every other discoverable scene `.svelte` file present when implementing
- `src/lib/scenes/sceneObjects.ts` if construction must change to support explicit scene-owned settings without duplicated authority
- `src/lib/spark/SparkControls.ts` only if a small typed serialization/snapshot helper is needed
- Focused unit tests for transaction construction/serialization
- A real dev-server source-sync integration/e2e test, not only the current preview/stub suite
- `AGENTS.md`

## Constraints

- Reproduce the bug live in edit mode before implementing. Record the edited field, built sync metadata (`moduleId`, `componentIndex`, `attributeName`), browser error, and relevant Vite server error in the completion report.
- Use supported public Threlte Studio transaction APIs. Do not patch `node_modules`, import Studio private internals into production, swallow `doSync` rejections, or merely suppress the console error.
- Preserve live application of a valid edit, validation/clamping, coupled invariants, undo/redo snapshots, active-controller selection independence, and settings-change subscriptions.
- Preserve the pre-mutation history invariant: `historicValue` is the complete snapshot before invoking the synchronous setter; `value` is the complete validated snapshot afterward.
- Source sync must target the active scene component and its Spark `<T>` declaration, never a shared helper/default file or a different scene.
- Each discoverable scene file must contain its own complete persisted values for all 22 `SparkSettings` fields. Do not leave `settings={sparkControls.settings}` as the scene's supposed persisted source of truth, and do not put one shared mutable settings object in `sceneObjects.ts`.
- Prefer a typed explicit object literal directly on the scene's Spark `<T>` node if that is what Studio can reliably rewrite. If a different source shape is required, prove that Studio rewrites the scene-local declaration deterministically and explain it.
- Avoid two competing sources of truth. Construction may use safe temporary defaults, but after declarative mounting the scene file's persisted settings must govern both edit and playback behavior.
- Saved settings must survive HMR/remount and a full reload, and the same scene must use them in `/scene/{name}` playback.
- Multiple scenes must be independent: editing scene A must not change scene B's source or runtime settings. There is currently one discoverable authored scene, so add focused fixtures/tests or another non-production fixture as needed to prove isolation without adding an unwanted production scene.
- Preserve exact numeric/boolean/null types. In particular, `lodSplatCount: null` must round-trip as `null`; do not stringify numbers or booleans.
- Persistence must work for representative numeric, boolean, nullable-number, and coupled-invariant edits. `maxPagedSplats` must continue its controlled renderer/mesh reload behavior.
- Do not add arbitrary delays or rely on HMR timing races.
- A source-sync failure must not corrupt/truncate the scene file. Keep integration tests isolated and restore any fixture/source mutation in reliable cleanup, including on failure.
- Keep edits narrowly scoped and avoid unrelated formatting churn.

Critical desired scene ownership shape (illustrative field values only; use the correct complete settings for each scene):

```svelte
<T
  is={sparkControls}
  name="Spark"
  settings={{
    lodSplatScale: 1,
    // ...all remaining SparkSettings fields, including booleans and null...
  }}
/>
```

Do not mechanically adopt this example until the live reproduction confirms the Studio parser/source-sync behavior.

## Acceptance criteria

- Pi identifies and reports the concrete root cause behind the `doSync` rejection, including the Vite-side error rather than guessing from the browser's `{}`.
- In `/scene/baby_yoda/edit`, changing a Spark setting through the Spark Controls pane completes source sync without an unhandled promise rejection or relevant console/server error.
- The edit is written to `src/lib/scenes/baby_yoda.svelte`, not `sceneObjects.ts`, `SparkControls.ts`, or another scene.
- Every discoverable scene `.svelte` component owns a complete explicit snapshot of all 22 Spark settings; there is no scene declaration using `settings={sparkControls.settings}` as persisted state.
- Numeric, boolean, `lodSplatCount` null/number, and a coupled-invariant edit serialize as valid Svelte/TypeScript with correct types.
- The saved scene compiles, survives HMR and full reload, and yields the saved values in both edit and playback routes.
- Undo and redo continue to restore and source-sync the complete historic/new settings snapshots without errors.
- Repeated edits do not target a stale controller/component after a scene remount.
- Scene isolation is covered: persisting settings for one scene does not modify another scene's source or values.
- Existing Spark live propagation remains intact, including ordinary shader/LOD settings and the `maxPagedSplats` recreation/reload path.
- New automated coverage fails on the current broken behavior and exercises the real source-writing route through a Vite development server (or an equivalently faithful integration of the public Studio/Vite RPC). A preview-only or mocked transaction assertion is insufficient as the sole regression.
- Integration tests leave the repository/fixture byte-for-byte restored even when assertions fail.
- Existing tests continue to pass.
- `AGENTS.md` concisely documents scene-owned Spark settings, the supported source-sync path, and source/test references.
- Re-check every acceptance criterion immediately before finalizing.

## Tests to create and run

- Add focused unit tests for transaction shape and any new pure serialization/scene-settings helper.
- Add a dev-server integration/e2e regression that:
  1. starts with a known scene-local settings literal;
  2. opens the scene edit route and changes a field through the real pane;
  3. observes no page error/console error and waits for actual source persistence;
  4. verifies only the intended scene source changed and remains parseable;
  5. reloads edit and playback and verifies the saved runtime value;
  6. covers undo/redo and representative boolean/null typing;
  7. restores the source fixture in `finally`/test teardown.
- Add or update declarative tests that validate all discoverable scenes contain all 22 scene-owned settings fields.
- Run `npm run check`.
- Run `npm run lint`.
- Run `npm run test:unit`.
- Run the focused real source-sync integration test serially.
- Run `npm run test:e2e`.
- Run `npm run build`.
- Run `git diff --check` before writing the final status report.

Report exact commands and results. Do not claim persistence based only on the live input/controller value.

## Things Pi must not change

- Do not patch or vendor `@threlte/studio` as the first response; work through its supported transaction/source metadata contract unless the report proves an upstream defect and no scoped application fix is possible.
- Do not disable source sync, set `sync: false`, catch-and-ignore the rejection, or remove history records.
- Do not persist settings into a global singleton, `deviceProfile.ts`, `sceneObjects.ts`, or one shared configuration used by every scene.
- Do not remove device profiling outside the minimum adjustment necessary to establish scene-local authority.
- Do not regress ScrollAnimator source sync or broaden its transaction whitelist.
- Do not restore hierarchy-selection dependence for the Spark pane.
- Do not alter Spark setting defaults/validation, renderer dirty classification, foveation semantics, reload coordination, routing, camera behavior, or the new debug FPS widget unless directly required and justified.
- Do not add a production scene solely for testing.
- Do not leave tests with mutated authored scene files or commit transient values written during reproduction.
- Do not modify unrelated user work or commit generated build output.

## Expected completion report

Write `.codex-handoff/status.md` containing:

1. Live reproduction steps and evidence, including browser and Vite-side errors plus built sync metadata.
2. Concrete root cause.
3. Fix design and why it follows Studio's supported public contract.
4. Changed files and purpose.
5. Per-scene ownership design and a list of every scene updated.
6. Evidence for numeric, boolean, nullable, coupled-invariant, undo, redo, HMR/reload, playback, remount, and scene-isolation behavior.
7. Tests added, exact commands, and exact results.
8. Item-by-item acceptance-criteria checklist.
9. Known limitations or upstream constraints.
10. Final pushed commit hash.

Update `AGENTS.md` with concise, up-to-date feature information and source references. It should help a fresh agent understand the scene-owned settings and persistence path without becoming an implementation diary.

Always write `.codex-handoff/status.md` as the final action before pushing. Before writing it, re-check every acceptance criterion. After writing the report and pushing all intended implementation, tests, and documentation to the current branch, do not perform further verification or modification.
