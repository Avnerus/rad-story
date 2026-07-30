# Follow-up mission: make scene persistence and camera helpers non-vacuous

## Objective

Keep the new `/scene/{sceneName}` architecture, but correct the defects found during Codex verification. The current implementation does not yet satisfy the core requirement that every scene persist its model transform in its own Svelte file, and the camera/helper lifecycle has correctness regressions that the new tests do not actually assert.

Do not redo the feature. Make focused architectural corrections, strengthen the tests so they prove the requested behavior, update `AGENTS.md`, and report honestly.

## Verified defects to fix

### 1. The model/SplatWrapper is not scene-owned or scene-persistent

`SceneRuntime.svelte` instantiates shared `SparkSplats.svelte`, and `SparkSplats.svelte` still creates its own `wrapper` and owns this literal declaration:

```svelte
<T is={wrapper} name="SplatWrapper" />
```

That source metadata points to shared `SparkSplats.svelte`, not `src/lib/scenes/baby_yoda.svelte`. The status report's claim that the Baby Yoda model/SplatWrapper transform source-syncs into the scene file is therefore unsupported and architecturally false.

Externalize the stable wrapper so each scene creates/owns it and contains a literal source-syncable `<T is={splatWrapper} ...>` declaration. `SparkSplats` may manage the internal `SplatMesh` child and reload lifecycle, but it must use the scene-provided wrapper rather than declaring the authorable wrapper in shared source. Preserve the stable-wrapper reload invariant and diagnostics.

The ad-hoc URL viewer also needs an explicit wrapper declaration in its owning source, without sharing a mutable wrapper with file-backed scenes.

### 2. The helper flag has two sources of truth

Baby Yoda calls:

```ts
createSceneObjects(profile, { showFrustum: true })
```

and also declares:

```svelte
showChildCameraFrustumWhenSelected
```

Remove the imperative `showFrustum` option/assignment. The literal scene attribute must be the only authored source of truth.

### 3. Scene-created SparkControls leaks on route unmount

`baby_yoda.svelte` creates `SparkControls` but never disposes it. Only the ad-hoc `RadStoryScene.svelte` currently calls `sparkControls.dispose()`.

Define one clear owner and dispose every scene's controller exactly once on scene removal. Prefer putting shared cleanup into the runtime ownership contract so lean scene files do not repeat lifecycle scripts, if that is safe. Avoid double-disposal.

### 4. SceneRuntime now controls the editor camera incorrectly

The old code always applied look-at to the real app `PerspectiveCamera`. The new runtime calls `lookAt` on `threlte.camera.current`, so enabling Studio's editor camera causes the runtime to force the editor camera toward `CameraTarget` every frame. It also changes the debug position fields to the editor camera, contrary to the documented debug contract.

Pass the actual scene app camera and camera target through a typed runtime contract. Always apply target look-at to that app camera. Keep the editor camera freely controllable. Debug `data-x/y/z` must remain the app camera's world position, while `data-active` alone reports whether it is currently active.

Do not find the intended camera or target by repeated whole-scene traversal, magic names, or `_isAppCamera` markers when the scene already owns exact object references.

### 5. The custom CameraHelper has transform, duplication, and disposal bugs

The helper is added to the selected animator even though Three's `CameraHelper` uses the target camera's world matrix. Parenting it under the already-transformed animator can apply the animator transform twice. Add the owned helper to the appropriate scene/helper root so its world transform is correct.

The custom integration also creates a helper when the `PerspectiveCamera` itself is selected, even though Studio already provides that behavior. This can create two helpers. The custom integration should extend selection behavior only for the opted-in animator and leave direct camera selection to Studio, unless inspection proves the installed public integration requires a different non-duplicating approach.

On removal, call the appropriate helper disposal API in addition to detaching it. Repeated selection changes, scene remounts, HMR, and destruction must not leak geometry/materials or helpers.

Do not silently choose the first camera from an arbitrarily complex descendant hierarchy. Establish a small unambiguous declarative contract: for example require exactly one descendant `PerspectiveCamera`, or provide a scene-local declarative target identifier. Document and test the chosen rule.

### 6. The new helper e2e tests are vacuous

The current assertions amount to "the debug element still exists" or `page.evaluate(() => true)`. They do not prove a helper was created, targets the correct camera, uses the correct parent/world transform, disappears, avoids duplication, or is disposed.

Add a narrow deterministic test hook/diagnostic in the stub build or extract an independently testable helper controller. Tests must assert actual helper identity/count/target/parent/lifecycle state. Do not use "no crash" as evidence for visible behavior.

### 7. The scene file is not yet lean

`baby_yoda.svelte` repeats debug state shape, callback copying, debug DOM, loading hint, and lifecycle glue. A new scene would have to copy this boilerplate, conflicting with the request that scene files contain lean declarative authoring tags without redundant runtime code.

Move shared debug/loading plumbing into shared runtime/UI code. The scene file should contain only minimal imports/object construction plus its RAD URL and literal authorable declarations. Adding another scene should not require copying the debug state object, callbacks, debug element, loading hint, Spark cleanup, or renderer lifecycle.

### 8. Routing and dynamic-component warnings need correction

Paths under `/scene/` with invalid names currently fall through to the landing route instead of a clear not-found state. Treat malformed, empty, and unknown scene names consistently as not found, while `/` remains the landing route.

`<svelte:component>` introduced a new Svelte 5 deprecation warning. Use the supported Svelte 5 dynamic-component form, such as a capitalized reactive component variable, and leave no new warnings. Do not claim this warning is pre-existing.

### 9. The reported verification was not fully green

The report says `npm run test:e2e` had one failure while simultaneously marking "existing tests remain green" complete. A required full-suite command must pass before finalization. If a timing test is flaky, make it deterministic rather than accepting a failed run.

## Files likely involved

- `src/App.svelte`
- `src/lib/router.ts`
- `src/lib/components/SceneRuntime.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/components/SparkSplats.svelte`
- `src/lib/scenes/baby_yoda.svelte`
- `src/lib/scenes/sceneObjects.ts`
- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte`
- possibly a small extracted helper controller/runtime under `src/lib/studio/scroll-animator/`
- focused unit/e2e tests and Spark-stub diagnostics
- `AGENTS.md`

Adjust this list only as required by the focused fixes.

## Constraints

- Preserve the `/scene/{sceneName}` route and `src/lib/scenes/` source directory.
- Preserve literal `<T>` declarations in the individual scene file for every property/object Studio must source-sync there.
- Preserve the dual Spark renderer, pager handoff, reload coordinator, stable wrapper, status propagation, and settings behavior.
- Preserve boolean `scrub: true`, traversal-based ScrollAnimator playback, camera-target look-at, and editor-camera ownership.
- Preserve the landing/ad-hoc RAD URL workflow.
- Use public Threlte/Studio APIs only.
- Keep authored values single-source: no constructor/markup duplication.
- Do not add production-only test globals; gate narrow diagnostics exactly as existing Spark stub diagnostics are gated.
- Do not hide failed checks as "flaky" in the final acceptance result.
- Do not touch the user's unrelated local `package-lock.json` change or introduce unrelated dependency/formatting churn.

## Acceptance criteria

1. `src/lib/scenes/baby_yoda.svelte` contains the literal source-syncable SplatWrapper/model `<T>` declaration and its transform attributes; shared `SparkSplats.svelte` no longer owns the authorable wrapper declaration for file-backed scenes.
2. Editing the Baby Yoda wrapper transform builds source metadata targeting `baby_yoda.svelte`, and a reload/remount preserves the scene-authored transform.
3. Two distinct scene instances/files cannot share wrapper, keyframe, SparkControls, helper, or mutable runtime state. Add a focused isolation test even if only one production example scene is shipped.
4. Baby Yoda has exactly one declarative helper opt-in and no imperative duplicate.
5. Every scene-created `SparkControls` and scene-owned Three resource is disposed exactly once on unmount.
6. Runtime look-at always affects the app camera, never the Studio editor camera. Editor-camera navigation remains free, and ownership toggles still round-trip.
7. Debug camera coordinates always describe the app camera; `data-active` changes with editor-camera ownership.
8. Selecting the opted-in camera animator creates exactly one custom helper for the intended camera at the correct scene-level parent/world transform.
9. Selecting the camera directly produces no custom duplicate; Studio's built-in behavior remains intact.
10. Selecting an unrelated object, deselecting, remounting, or destroying removes and disposes the custom helper. Repeated selection creates no accumulation.
11. Helper tests assert actual helper state and lifecycle; no `evaluate(() => true)`, "no crash", or unrelated debug-element proxy assertions remain.
12. `baby_yoda.svelte` is genuinely lean and scene-specific. Shared debug/loading/lifecycle boilerplate occurs once outside individual scene files.
13. `/scene/baby_yoda` still loads directly and on refresh; invalid, empty, and unknown names under `/scene/` show the not-found UI.
14. The landing and ad-hoc URL viewer remain functional.
15. No new Svelte deprecation warning remains; dynamic scene rendering uses supported Svelte 5 syntax.
16. All unit and e2e tests, check, lint, and build complete successfully in the final full runs.
17. `AGENTS.md` is corrected with the final scene wrapper ownership, typed runtime camera/target contract, helper behavior, cleanup rules, and source references. Keep it concise rather than an implementation log.

Before finalizing, re-check every acceptance criterion against code and a real assertion. Do not mark an item complete merely because the app did not crash.

## Tests to create or strengthen

Add focused tests for:

- route parsing of `/`, the valid Baby Yoda path, unknown names, malformed names, and an empty scene name
- scene registry/name safety
- scene-owned SplatWrapper source metadata/transaction target
- per-scene wrapper/controller/object isolation
- stable scene wrapper transform across Spark capacity reload and remount
- app-camera look-at and debug position while editor camera is active
- editor-camera ownership toggle round trip
- helper creation with exact target and scene-level parent
- exactly one custom helper for animator selection
- zero custom helpers for direct camera and unrelated selection
- helper removal and disposal on selection change, repeated toggle, scene remount, and destroy
- no duplicate ScrollTriggers/renderers/controllers after navigation

Run, in the final full verification:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

All must pass. Do not perform only isolated reruns after a failed full suite and call the result green.

## Things Pi must not change

- Do not redesign the scene registry or introduce SvelteKit.
- Do not add another production scene merely to test isolation.
- Do not regress the existing Spark reload ownership fixes.
- Do not change ScrollAnimator sampling/interpolation semantics.
- Do not force the editor camera to look at the scene target.
- Do not patch Studio internals or `node_modules`.
- Do not keep the helper's direct-camera branch if it duplicates Studio's built-in helper.
- Do not keep the SplatWrapper `<T>` solely in shared runtime code.
- Do not retain vacuous e2e assertions.
- Do not modify unrelated user work or generated artifacts.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Exact corrections made for each verified defect above.
2. Final ownership table for scene objects, SplatWrapper, SplatMesh, SparkControls, camera helper, and cleanup.
3. Evidence that Studio source sync for wrapper transform, keyframes, and Spark settings targets `baby_yoda.svelte`.
4. Camera/editor-camera look-at and debug-state behavior.
5. Helper declarative contract, parent/target rules, disposal behavior, and non-vacuous assertions.
6. How scene-file boilerplate was removed.
7. Route/not-found and Svelte dynamic-component correction.
8. Changed files and focused rationale.
9. Exact final full-suite command results.
10. Acceptance-criteria checklist mapped to concrete tests or source evidence.
11. Remaining limitations without marking unmet criteria complete.
12. Confirmation that `AGENTS.md` was updated concisely.

Always write `status.md` as the final content change before committing and pushing. Re-check all acceptance criteria immediately before writing it. After writing the report, do not run more verification or modify files. Commit all intended changes, including the report, push the current branch, and do not perform any further checks or edits after the final push.
