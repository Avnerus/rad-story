# Final follow-up mission: close helper and evidence gaps

## Objective

Keep Pi's corrected scene-owned wrapper, typed app-camera/target runtime contract, lean scene file, singular scene route, and green test behavior. Close the remaining contract, diagnostic-lifecycle, warning, and verification gaps found in Codex's second review.

This is a narrow follow-up, not another redesign.

## Verified remaining issues

### 1. “Exactly one descendant camera” is not implemented

`CameraFrustumHelper.svelte` documents an exact-one-camera contract but `findDescendantCamera()` stops at and returns the first match. An opted-in animator with two descendant cameras silently picks one.

Implement the documented unambiguous contract. Resolve all descendant `PerspectiveCamera` objects and create a helper only when exactly one exists. Zero or multiple matches must produce no custom helper. Keep direct camera selection owned by Studio.

### 2. The test diagnostic leaks into production and survives destruction

`window.__camera_frustum_helper_diagnostic` is currently installed whenever `window` exists:

```ts
if (typeof window !== 'undefined') {
  window.__camera_frustum_helper_diagnostic = exposeHelperDiagnostic
}
```

This is not stub-gated, and `onDestroy` does not remove the global. The global closure can retain destroyed component state until another mount overwrites it.

Expose diagnostics only in the existing e2e Spark-stub build. Remove the diagnostic on destroy only if it still points to that component instance, so an old instance cannot delete a newer instance's diagnostic. No helper diagnostic may exist in a normal production build.

### 3. The diagnostic cannot prove the claims made by the tests

`{ helperExists, targetCameraType }` cannot prove:

- exactly one custom helper is attached
- its parent is the scene root
- it targets the intended camera identity rather than merely some `PerspectiveCamera`
- the old helper was actually removed from the scene
- geometry/material/helper disposal occurred
- repeated selection did not leave stale helpers

Add narrow stub-only evidence: brand owned helpers and report the scene's owned-helper count, target identity, parent identity, and lifecycle counters or disposed state. Avoid exposing general production scene internals.

Strengthen tests to assert exact counts and identities before/after selection, deselection, repetition, and remount. A boolean field alone is insufficient.

### 4. Required isolation, source-target, and disposal tests are missing

The previous mission explicitly required focused tests for:

- two `createSceneObjects()` calls producing distinct wrappers, cameras, targets, animators, SparkControls, and mutable settings/keyframe state
- Baby Yoda wrapper source metadata/transaction target pointing to `baby_yoda.svelte`
- scene-authored wrapper transform surviving a capacity reload and a remount
- `SparkControls.dispose()` occurring exactly once per scene runtime
- app-camera debug/look-at remaining correct while the editor camera is active

The current test delta contains none of these. Add direct, non-vacuous coverage. If Studio's source metadata cannot be safely rewritten in e2e, inspect/assert the actual `userData.threlteStudio` target metadata produced by the literal Baby Yoda `<T>` and combine it with a source excerpt assertion; do not merely infer the target from the presence of a literal tag.

For wrapper persistence, use an unmistakable non-default transform declared or source-synced for the Baby Yoda wrapper and assert all position/rotation/scale values after both capacity reload and scene remount. Preserve scene-file leanness.

### 5. One new Svelte warning remains

The report says `npm run check` has two `state_referenced_locally` warnings in the scene components and calls them pre-existing. The original ad-hoc component pattern accounted for one; adding `baby_yoda.svelte` introduced the second. The previous acceptance criterion required no new warning.

Use an intentional non-reactive snapshot mechanism supported by Svelte 5 (or a cleaner factory contract) for the immutable startup device profile. Eliminate these warnings without making scene objects recreate reactively or adding boilerplate to every scene. The final `npm run check` should have zero errors and preferably zero warnings; at minimum it must contain no warning introduced by file-backed scenes and the report must distinguish baseline from new output accurately.

### 6. Documentation overstates unverified behavior

Correct `AGENTS.md` and the status report so they describe the exact-one helper contract, stub-only diagnostic lifecycle, and actual test evidence. Remove claims that rely only on architectural inference when a requested assertion is absent.

Also fix the stale `createSceneObjects(profile, opts)` key-file description in `AGENTS.md`; the factory no longer accepts `opts`.

## Files likely involved

- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte`
- a small extracted helper-selection/controller module if useful
- `src/lib/scenes/sceneObjects.ts`
- `src/lib/scenes/baby_yoda.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/components/SceneRuntime.svelte` only if a narrow test/lifecycle hook is required
- Spark stub/e2e diagnostics and focused unit/e2e tests
- `AGENTS.md`

Avoid changing routing, renderer architecture, or unrelated controls.

## Constraints

- Preserve the `/scene/{sceneName}` behavior and source files under `src/lib/scenes/`.
- Preserve the scene-owned literal SplatWrapper `<T>` and shared `SparkSplats` mesh lifecycle.
- Preserve app-camera-only look-at and debug coordinates.
- Preserve editor-camera freedom and Studio's built-in direct-camera helper.
- Preserve boolean `scrub: true`, Spark reload coordination, pager handoff, and stable wrapper behavior.
- Use public Threlte/Studio APIs only.
- Keep test diagnostics absent from production and safely cleaned up in stub builds.
- Do not add a second production scene merely for isolation testing.
- Do not touch the user's unrelated `package-lock.json` modification.
- Do not weaken or remove existing deterministic progress/reload assertions.

## Acceptance criteria

1. An opted-in animator creates a custom helper only when it has exactly one descendant `PerspectiveCamera`.
2. Zero-camera and multiple-camera opted-in animators create no custom helper.
3. Direct camera selection creates no custom helper and leaves Studio's built-in behavior untouched.
4. The custom helper is attached once at the Three scene root and targets the exact intended camera identity.
5. Selection change, repeated selection, scene remount, and destruction leave zero stale owned helpers and dispose every created helper resource exactly once.
6. Helper diagnostics exist only in the e2e stub build, expose exact count/identity/lifecycle evidence, and are safely removed on destruction without an old instance deleting a newer diagnostic.
7. A normal production build does not expose `__camera_frustum_helper_diagnostic`.
8. Two scene-object factory calls are proven to return fully isolated mutable scene objects/controllers.
9. Baby Yoda SplatWrapper Studio metadata is proven to target `src/lib/scenes/baby_yoda.svelte`, not shared runtime source.
10. Baby Yoda's unmistakable wrapper position, rotation, and scale persist across capacity reload and scene remount.
11. Each scene runtime disposes its `SparkControls` exactly once.
12. While the editor camera is active, app-camera position/look-at and debug coordinates remain correct and editor-camera orientation is not overwritten.
13. File-backed scene support adds no Svelte warning; no object factory reruns reactively when the startup profile is immutable.
14. `AGENTS.md` accurately documents the final contracts and factory signature.
15. The full check, lint, unit, e2e, and build commands pass.

Re-check each criterion against an actual assertion or precise source evidence before finalizing.

## Tests to add or strengthen

- Unit-test exact-zero/one/multiple descendant camera resolution.
- Unit-test two complete `createSceneObjects()` results for identity and mutation isolation.
- E2e assert custom helper count, target UUID/ID, parent/root identity, removal, and disposal counters.
- E2e assert stub diagnostic installation/removal; add build/source evidence that production does not install it.
- E2e or focused integration-test Baby Yoda wrapper `userData.threlteStudio` source target.
- E2e set/assert non-default Baby Yoda wrapper position, rotation, and scale across capacity reload and remount.
- Instrument and assert exactly-once SparkControls disposal in the stub test environment.
- Assert app-camera debug coordinates and orientation remain stable/correct while editor camera is enabled; separately prove editor camera orientation is not forced.

Run final full commands:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

All must pass. Report warning counts exactly.

## Things Pi must not change

- Do not revert the scene-provided SplatWrapper architecture.
- Do not reintroduce helper handling for direct camera selection.
- Do not silently select the first of multiple cameras.
- Do not leave diagnostic globals in production or after component destruction.
- Do not use boolean-only helper tests to claim exact counts/disposal.
- Do not add duplicated profile/settings/helper initialization.
- Do not modify unrelated files, dependencies, generated artifacts, or user work.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Exact-one camera resolution behavior for zero/one/multiple matches.
2. Stub-only diagnostic gating, safe teardown, and exact fields.
3. Helper ownership/disposal lifecycle and concrete assertions.
4. Scene-object isolation evidence.
5. Baby Yoda wrapper Studio source-target and transform-persistence evidence.
6. SparkControls exactly-once disposal evidence.
7. Editor-camera/app-camera regression evidence.
8. Warning correction and exact final check output.
9. Changed files and focused rationale.
10. Acceptance checklist mapped to actual tests/source evidence.
11. Exact final full-suite command results.
12. Confirmation that `AGENTS.md` was corrected concisely.

Always write `status.md` as the final content change before committing and pushing. Re-check acceptance criteria immediately before writing it. After writing the report, do not run more verification or modify files. Commit all intended changes, including the report, push the current branch, and perform no further checks or edits after the final push.
