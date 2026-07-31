# Mission: profile-aware Spark Controls with scene-local per-profile overrides

## Objective

Replace the previous flat Spark settings persistence design with a profile-aware model and fix the blocking Studio source-sync failure as part of that design.

RAD Story currently chooses Spark values from device detection, but the Spark Controls pane neither identifies the active profile nor has a correct persistence model. Editing and syncing also rejects asynchronously in Studio with:

```text
TransactionQueue.svelte.js:202 Uncaught (in promise) {}
doSync @ TransactionQueue.svelte.js:202
await in doSync
```

Implement exactly two named device profiles for now: `desktop` and `mobile`.

The final model must have:

1. A clearly displayed active profile in the Spark Controls extension.
2. Correct profile detection on page load, including Chrome/Firefox mobile device emulation after reload.
3. Global effective settings for each profile.
4. Scene-local persisted overrides containing only values that differ from that profile's global effective settings.
5. A scene `<T>` attribute whose persisted data is visibly grouped under `desktop` and `mobile` parents.
6. Effective runtime settings computed as `global profile settings + current scene overrides for the active profile`.
7. Working Studio source sync with no `doSync` rejection.

## Required conceptual model

Introduce a stable profile identifier:

```ts
type DeviceProfileName = 'desktop' | 'mobile'
```

Define or derive a complete effective `SparkSettings` baseline for each profile. The existing profile specifies only eight Spark fields and relies on `SparkControls` defaults for the other fields; centralize that merge so comparisons use all 22 effective fields and cannot confuse an omitted global default with a scene override.

Each scene persists a partial override map shaped approximately like this (the final attribute/property name may differ if a better supported public Studio contract is proven):

```svelte
<T
  is={sparkControls}
  name="Spark"
  profileSettings={{
    desktop: {
      maxStdDev: 2.8,
    },
    mobile: {
      maxPagedSplats: 131072,
    },
  }}
/>
```

The important invariants are:

- both `desktop` and `mobile` are visible parent keys in each scene's `<T>` declaration;
- child objects contain only differences from that profile's complete global baseline;
- the runtime receives a flat, complete, validated `SparkSettings` snapshot for only the active profile;
- editing one profile does not copy its values into the other profile;
- setting a field back to its global profile value removes that field from the persisted override object rather than storing a redundant override.

Do not mechanically use the illustrative property name until live source-sync reproduction confirms the public Threlte Studio parser can rewrite the chosen literal reliably.

## Live investigation required

Before implementing, reproduce the current source-sync failure using `npm run dev` and `/scene/baby_yoda/edit`.

Capture and report:

- active field/value edited;
- built transaction sync metadata (`moduleId`, `componentIndex`, `attributeName`);
- browser rejection;
- Vite dev-server-side error;
- source attribute shape before failure.

The browser's rejected `{}` is not a root cause. Identify the concrete server/parser/metadata failure. Existing preview/stub e2e tests do not exercise Studio's real dev-server RPC and therefore are insufficient for this bug.

## Files likely involved

- `src/lib/types.ts`
- `src/lib/spark/deviceProfile.ts`
- `src/lib/spark/SparkControls.ts`
- `src/lib/scenes/sceneObjects.ts`
- Every discoverable authored scene `.svelte` file, currently including `src/lib/scenes/baby_yoda.svelte`
- `src/lib/components/SceneRuntime.svelte` and/or the active Spark-controls runtime if profile identity and override metadata must travel with the controller
- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `src/lib/studio/spark-controls/sparkSettingsTransaction.ts`
- `src/lib/studio/scroll-animator/transactionGuard.ts` only if its narrow whitelist must recognize the new root persisted property
- Unit tests for profile resolution, diffing, validation, and transaction snapshots
- A real Vite dev-server source-sync integration/e2e test
- `AGENTS.md`

## Constraints

- Use public Threlte Studio transaction APIs. Do not patch `node_modules`, import private Studio internals into production, disable sync, or catch-and-ignore the rejection.
- Keep `desktop` and `mobile` as the only profile names. Use the same typed identifier throughout detection, UI, persistence, merging, tests, and documentation.
- Preserve the current mobile detection behavior where appropriate, but make the selected name explicit. Browser device emulation that supplies a mobile UA/device identity must select `mobile` after page reload; ordinary desktop browsing must select `desktop`.
- Profile selection is startup/load-time state. Hot-switching profiles without a page reload is not required.
- The Spark Controls pane must prominently show the active profile (`Desktop` or `Mobile`) even when no Spark hierarchy object is selected. It remains bound through `activeSparkControlsRuntime`, not hierarchy selection.
- The pane inputs show the complete effective values for the active profile: global baseline merged with the current scene's active-profile overrides.
- A pane edit applies live to the current controller/renderers and updates only the active profile's override map.
- Persist the complete nested override map in one scene-local literal so edits to one profile preserve existing overrides for the other profile.
- Persist only deltas. Use own-property presence to distinguish “no override” from valid falsey overrides such as `false`, `0` where allowed, and `lodSplatCount: null`.
- Reverting a field to the active profile's baseline deletes that override key. If coupled validation changes a second field, diff both complete validated effective snapshots against the baseline and persist the correct resulting deltas.
- Do not compare against only the eight currently explicit renderer-profile fields. Resolve a complete 22-field baseline using the canonical Spark defaults/validation path.
- Scene files, not `deviceProfile.ts`, `sceneObjects.ts`, or a singleton, own scene-specific overrides. Global profile baselines remain centralized.
- Each authored scene `<T>` declaration visibly contains both parent profile keys, even when one or both override objects are empty.
- Source sync must target only the active scene's `<T>` declaration. Scene A edits must never mutate scene B, global baselines, or shared construction helpers.
- Avoid competing authorities. The scene override literal plus global baseline must deterministically produce the controller's effective settings in playback and edit modes.
- Ad-hoc URL viewing should still use the detected global profile baseline. Do not accidentally persist an ad-hoc session's tweaks into a shared production component as if it were a file-backed scene. If the pane remains editable there, clearly define and test whether edits are transient.
- Preserve the pre-mutation history invariant: capture the complete effective snapshot and complete nested override map before invoking synchronous setters; transaction `historicValue` and `value` must remain distinct and undoable.
- Undo/redo must restore both the effective controller state and the correct nested scene override literal without redundant baseline values.
- Preserve Spark validation/clamping, `coneFov0 <= coneFov`, `minPixelRadius <= maxPixelRadius`, boolean/null types, active-controller stale guards, live renderer propagation, reload status, and `maxPagedSplats` recreation/reload.
- Do not use arbitrary delays or HMR timing assumptions.
- Source-sync integration tests must mutate only an isolated fixture/copy and restore it reliably on success or failure. Never leave authored scene sources changed by test values.
- Keep changes scoped and avoid unrelated formatting or architecture churn.

## Acceptance criteria

- Pi reports the concrete root cause of the original `TransactionQueue.doSync` rejection with browser and Vite-side evidence.
- A stable typed `desktop | mobile` profile identity is available with complete global effective Spark settings for each profile.
- Desktop load selects `desktop`; emulated mobile load selects `mobile` and receives the mobile baseline values.
- The Spark Controls pane visibly reports `Desktop` or `Mobile` and displays the correct complete effective values for that profile.
- Every discoverable authored scene `.svelte` file has a scene-local literal override map with both `desktop` and `mobile` parent keys.
- Scene override child objects contain only fields different from their corresponding global profile baseline.
- Editing a desktop setting persists only under that scene's `desktop` parent and leaves `mobile` unchanged; the inverse holds for mobile.
- Resetting a field to its profile baseline removes the redundant override key from source.
- Numeric, boolean, nullable-number, and coupled-invariant edits round-trip with correct types and minimal deltas.
- Source sync completes with no unhandled promise rejection, browser console error, Vite server error, malformed Svelte, or wrong-file mutation.
- HMR/remount and full reload preserve the nested overrides and recompute the same effective values.
- Playback and edit routes use identical effective settings for the same scene and detected profile.
- Two-scene isolation is proven using safe test fixtures: editing one scene/profile changes neither the other scene nor the other profile.
- Undo/redo source-sync both the effective live values and nested minimal override map correctly.
- Existing selection independence, controller subscriptions, Spark rendering propagation, capacity reload, routing, debug FPS widget, and ScrollAnimator source sync remain intact.
- A real dev-server source-writing regression test covers the public Studio/Vite RPC. Preview-only, mocked, or in-memory transaction tests are not sufficient as the sole regression.
- Tests leave the repository and fixtures byte-for-byte restored.
- `AGENTS.md` documents named profiles, global baselines, scene-local delta structure, merge/reset rules, source-sync path, and source/test references concisely.
- Re-check every acceptance criterion before finalizing.

## Tests to create and run

Add focused unit tests for:

- desktop/mobile detection and explicit profile name;
- construction of complete 22-field global baselines;
- merging baseline plus partial scene overrides;
- minimal diff generation, including removal when reset to baseline;
- false, null, and coupled-field diff behavior;
- active-profile isolation and preservation of the inactive profile object;
- transaction historic/new nested override snapshots;
- transaction guard allowance for only the exact new persisted root property, if applicable.

Add a serial real-dev-server integration/e2e test that:

1. starts from an isolated scene fixture containing `desktop` and `mobile` override parents;
2. opens edit mode under desktop identity, verifies the pane label/baseline, edits via the real pane, and waits for actual source rewrite;
3. verifies a minimal desktop delta and unchanged mobile object;
4. resets to baseline and verifies source-key removal;
5. repeats a representative edit under emulated mobile identity and verifies mobile values/parenting;
6. covers boolean, nullable, coupled-invariant, undo, and redo persistence;
7. reloads edit/playback and verifies effective runtime settings;
8. captures page errors and relevant console/server errors;
9. proves only the intended scene fixture changed;
10. restores all source files in reliable teardown.

Run and report:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- the focused real source-sync integration test serially
- `npm run test:e2e`
- `npm run build`
- `git diff --check`

Do not claim persistence from an input/controller value alone; verify the source file and a reload.

## Things Pi must not change

- Do not persist complete effective settings per scene/profile when values equal global baselines.
- Do not flatten desktop and mobile overrides into one object.
- Do not infer profile independently in multiple layers with potentially divergent logic.
- Do not use truthiness to detect overrides.
- Do not mutate global profile baselines from scene edits.
- Do not save scene overrides in `deviceProfile.ts`, `sceneObjects.ts`, `SparkControls.ts`, or a module singleton.
- Do not add more profiles than `desktop` and `mobile`.
- Do not require hierarchy selection for the Spark pane.
- Do not patch Studio dependencies, suppress sync errors, remove transactions/history, or use private production imports.
- Do not alter unrelated camera, router, ScrollAnimator, RAD loading, debug FPS, or Spark reload behavior.
- Do not add production scenes only for testing.
- Do not commit test-mutated scene values, generated build output, or unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Live reproduction and concrete original root cause, including sync metadata and Vite-side evidence.
2. Final profile/baseline/override architecture and why it avoids competing sources of truth.
3. Exact persisted `<T>` shape from each authored scene.
4. Changed files and purpose.
5. Active-profile UI and device-emulation behavior.
6. Evidence for minimal deltas, reset removal, profile isolation, scene isolation, typing, coupled invariants, undo/redo, HMR/reload, playback/edit equality, and capacity reload.
7. Tests added and exact command results.
8. Item-by-item acceptance checklist.
9. Known limitations, including that device-profile switching requires reload.
10. Final pushed commit hash.

Update `AGENTS.md` with concise current architecture and source references, not a chronological implementation log.

Always write `.codex-handoff/status.md` as the last action before pushing. Re-check every acceptance criterion immediately before writing it. After writing the report and pushing all intended implementation, tests, documentation, and report changes to the current branch, do not perform further verification or modification.
