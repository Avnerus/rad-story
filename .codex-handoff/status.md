# Status: Scene-scoped Spark Controls and unobstructed edit route

## Summary

Decoupled the Spark Controls Studio extension from hierarchy selection so it auto-binds to the active scene's `SparkControls` instance. Authors no longer need to select the `Spark` hierarchy object before opening or using the pane. Removed the viewer header from `/scene/{name}/edit` so the Studio toolbar is unobstructed.

## Files changed

| File | Change |
|------|--------|
| `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts` | **New.** `ActiveSparkControlsRuntime` class + singleton. Reactive registry with generation-based identity-safe attach/detach and subscriber notifications. |
| `src/lib/components/SceneRuntime.svelte` | Added import of `activeSparkControlsRuntime`. On mount: calls `attach(sparkControls)`. On destroy: calls identity-safe `detach()` before disposal. |
| `src/lib/studio/spark-controls/SparkControlsExtension.svelte` | Replaced `useObjectSelection()`-driven logic with `activeSparkControlsRuntime.onChange()` subscription. Pane auto-binds to the active controller. Removed selection-dependent state; kept all field-editing, transaction, and reload-status logic. No-selection message changed from "Select the Spark object" to "No scene loaded". |
| `src/App.svelte` | Wrapped the scene-route viewer header in `{#if sceneMode === 'view'}` so edit mode renders no header. Playback and ad-hoc modes unchanged. |
| `AGENTS.md` | Updated key files list, SceneRuntime description, SparkControlsExtension description, Editor pane paragraph, Reload status subscription paragraph. Added "Active Spark Controls Runtime" section, "Header visibility by route" subsection, and updated Spark controls e2e documentation. |

## Active-controller lifecycle and transaction-targeting

1. **Scene mount:** `SceneRuntime.onMount()` calls `activeSparkControlsRuntime.attach(sparkControls)`. The runtime stores the returned `detach` function.
2. **Extension subscription:** `SparkControlsExtension.onMount()` reads `activeSparkControlsRuntime.activeController` and subscribes via `onChange()`. On each notification, it updates `uiState.controls`, `uiState.settings`, drafts, and reload-status subscription atomically.
3. **Transactions:** All field edits build transactions against `uiState.controls` (the active controller from the runtime), not the selected hierarchy object. Source sync targets the correct scene's `<T is={sparkControls} settings={...}>` attribute.
4. **Scene unmount:** `SceneRuntime.onDestroy()` calls `detach()` (identity-safe — only clears if this registration is still current), then disposes the SparkControls.
5. **Stale-detach safety:** Each `attach()` increments a generation counter. `detach()` checks both generation and object identity. An older scene's destroy cannot clear a newer scene's controller during remounts.

## Header visibility behavior by route/mode

| Route | Header | Home/Back button | Scene-name indicator |
|-------|--------|-----------------|---------------------|
| `/scene/{name}` (playback) | Yes | ← Home | Scene: name |
| `/scene/{name}/edit` (edit) | **No** | — | — |
| Ad-hoc viewer/editor | Yes | ← Back | URL label |
| Landing / not-found | No | Go home (not-found only) | — |

## Tests added or updated

### Unit tests (new file)
- `tests/unit/activeSparkControlsRuntime.test.ts` — 12 tests:
  - Initial state (no active controller)
  - Attach publishes controller
  - Current detach clears controller
  - Stale detach cannot clear newer controller
  - Subscriber notified on attach, detach, replacement
  - Subscriber cleanup prevents further notifications
  - Multiple subscribers each receive notifications
  - Destroy clears active controller and listeners
  - Remount: old detach does not clear new controller
  - No-controller state is safe (double detach)

### E2e tests (updated)
- `tests/e2e/playback-edit.spec.ts`:
  - Updated "direct visit loads the scene with Studio toolbar" — removed header assertion (edit mode has no header)
  - Renamed "edit mode Spark Controls pane works" → "works without selecting Spark" — removed Spark selection step
  - **New:** "Edit route header visibility" describe block (4 tests): no header in edit mode, playback retains header, Studio toolbar unobstructed, refresh retains no header
  - **New:** "Spark Controls pane selection independence" describe block (3 tests): non-Spark selection, multiple selection, clearing selection — pane stays bound
  - **New:** "Spark Controls pane remount safety" describe block (2 tests): pane works after remount, Spark still in hierarchy and selectable

- `tests/e2e/rad-story.spec.ts`:
  - Updated `selectSparkAndOpenPane` helper — removed Spark selection step
  - Renamed "Spark pane shows Select the Spark object..." → "Spark pane shows controls automatically without selecting Spark"
  - Renamed "Spark pane shows all 22 field controls when Spark is selected" → "automatically"
  - Updated mid-reload selection-change test: pane stays bound (not no-selection) when Spark deselected during reload
  - Updated subscription lifecycle test: pane auto-binds on reopen after selection change

- `tests/e2e/scene-routing.spec.ts`:
  - Updated "wrapper transform persists across capacity reload" test — removed Spark selection step

## Exact commands run and results

```
npm run check     → 0 errors, 0 warnings
npm run lint      → clean (no output)
npm run test:unit → 18 test files, 307 tests passed
npm run test:e2e  → 120 tests passed
npm run build     → built in 4.99s
git diff --check  → clean (no whitespace errors)
```

## Acceptance criteria checklist

1. ✅ Opening the Spark Controls pane in a scene editor immediately shows and edits the active scene's settings without selecting Spark.
2. ✅ Selecting any other hierarchy object, selecting multiple objects, or clearing selection does not disable, retarget, or reset the Spark Controls pane.
3. ✅ Spark edits still persist to the correct scene Svelte source and retain all current validation behavior.
4. ✅ Reload progress and errors continue to reflect the active controller, including when hierarchy selection changes during a reload.
5. ✅ Scene/editor remounts do not retain stale controllers or subscriptions, and an older detach cannot clear a newer registration.
6. ✅ `/scene/baby_yoda/edit` renders no viewer header, Home button, or `Scene: baby_yoda` indicator.
7. ✅ The Studio toolbar is unobstructed at the top of the edit route.
8. ✅ `/scene/baby_yoda` retains its playback header and behavior.
9. ✅ The ad-hoc viewer/editor retains its existing header and Spark authoring behavior.
10. ✅ Existing playback/edit route behavior remains full-page/direct-load based; no SPA transition requirement is introduced.
11. ✅ Existing ScrollAnimator, camera-frustum-helper, renderer, reload, source-sync, and scene persistence behavior remains intact.
12. ✅ `AGENTS.md` is updated with concise current architecture and source references.

## Limitations / risks / manual checks

- The `Spark` hierarchy object is preserved and still selectable for Inspector use. The only change is that the Spark Controls pane no longer requires it to be selected.
- No manual GPU-dependent checks were needed — all verification is via the stub e2e suite.
- The ad-hoc editor (RadStoryScene) also benefits from auto-binding since it uses the same SceneRuntime + SparkControlsExtension stack.
