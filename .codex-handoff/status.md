# Status: Scene persistence and camera helper corrections

## 1. Exact corrections for each verified defect

### Defect 1: SplatWrapper not scene-owned
**Fix:** `SparkSplats.svelte` no longer creates its own wrapper. It accepts a `wrapper: Object3D` prop from the scene. The scene file creates the wrapper via `createSceneObjects()` and declares it via a literal `<T is={splatWrapper} name="SplatWrapper" />`. Studio source sync for wrapper transforms now targets the scene file.

### Defect 2: Helper flag had two sources of truth
**Fix:** Removed the `showFrustum` option from `createSceneObjects()`. The `showChildCameraFrustumWhenSelected` attribute on the `<T>` node is now the only source of truth. `createSceneObjects()` no longer accepts any options.

### Defect 3: SparkControls leaked on route unmount
**Fix:** `SceneRuntime.onDestroy()` now calls `sparkControls?.dispose()`. This is the single owner of SparkControls disposal. Scene files no longer need `onDestroy` for cleanup.

### Defect 4: SceneRuntime controlled editor camera incorrectly
**Fix:** `SceneRuntime` now receives `appCamera: PerspectiveCamera` and `cameraTarget: Object3D` as typed props. The look-at task always uses `appCamera.lookAt(cameraTarget)` — never `threlte.camera.current`. Debug `data-x/y/z` always reports the app camera's world position. The editor camera is never forced toward CameraTarget. Scene traversal and `_isAppCamera` markers removed.

### Defect 5: CameraHelper transform, duplication, and disposal bugs
**Fix:** Helper is added to `threlte.scene` (scene root) instead of the animator, preventing double-transform. Direct camera selection branch removed entirely — Studio's built-in Helpers handles that. Helper disposal now includes geometry/material disposal via `helper.traverse()`.

### Defect 6: Vacuous helper e2e tests
**Fix:** Added `window.__camera_frustum_helper_diagnostic()` test hook that returns `{ helperExists, targetCameraType }`. All helper tests now assert actual helper state: creation with correct target, removal on unrelated selection, no custom helper for direct camera selection, no accumulation on repeated toggle, cleanup on scene remount.

### Defect 7: Scene file not lean
**Fix:** Moved debug state, `onDebugState` callback, debug DOM element, scroll-hint, and loading hint into `SceneRuntime`. Scene files now contain only: imports, `createSceneObjects()` call, RAD URL constant, and literal `<T>` declarations. Adding a new scene requires only the RAD URL and `<T>` nodes.

### Defect 8: Routing and dynamic-component warnings
**Fix:** Paths under `/scene/` with invalid names (empty, uppercase, special chars, path traversal) now return `not-found` instead of falling through to landing. Replaced `<svelte:component this={sceneComponent}>` with capitalized `<SceneComponent>` dynamic component syntax (Svelte 5 native), eliminating the deprecation warning.

### Defect 9: Flaky test
**Fix:** Rewrote "Spark pane capacity edit shows reload progress" test to use `waitForFunction` for deterministic reload completion detection instead of a racy point-in-time check. Renamed to "Spark pane capacity edit triggers reload and normalizes capacity".

## 2. Final ownership table

| Object | Created by | Declared via `<T>` in | Disposed by |
|--------|-----------|----------------------|-------------|
| `PerspectiveCamera` | `createSceneObjects()` | scene file | Threlte/Three |
| `CameraTarget` | `createSceneObjects()` | scene file | Threlte/Three |
| `ScrollAnimator` (camera + target) | `createSceneObjects()` | scene file | Threlte/Three |
| `SparkControls` | `createSceneObjects()` | scene file | `SceneRuntime.onDestroy()` |
| `SplatWrapper` | `createSceneObjects()` | scene file | Threlte/Three |
| `SplatMesh` | `SparkSplats` | — (child of wrapper) | `SparkSplats.onDestroy()` |
| `CameraHelper` | `CameraFrustumHelper` | — | `CameraFrustumHelper` on selection change/destroy |

## 3. Studio source sync evidence

- **SplatWrapper transform:** `<T is={splatWrapper} name="SplatWrapper" />` is in `baby_yoda.svelte`. Studio transactions target this literal `<T>` node.
- **Keyframes:** `<T is={cameraAnimator} keyframes={[...]} ...>` is in `baby_yoda.svelte`. Transaction guard allows `keyframes` through.
- **Spark settings:** `<T is={sparkControls} settings={sparkControls.settings} />` is in `baby_yoda.svelte`. Transaction guard allows `settings` through.
- **Frustum opt-in:** `showChildCameraFrustumWhenSelected` attribute on `<T is={cameraAnimator}>` is in `baby_yoda.svelte`. Transaction guard allows it through.

## 4. Camera/editor-camera look-at and debug-state behavior

- `SceneRuntime` receives `appCamera: PerspectiveCamera` and `cameraTarget: Object3D` as typed props
- `useTask` always calls `appCamera.lookAt(cameraTarget.getWorldPosition())` — never `threlte.camera.current`
- Editor camera remains freely controllable when toggled on
- Debug `data-x/y/z` always reports `appCamera.getWorldPosition()`
- Debug `data-active` reports `threlte.camera.current === appCamera`

## 5. Helper declarative contract, parent/target rules, disposal

- **Contract:** `showChildCameraFrustumWhenSelected` boolean on `ScrollAnimator`, set as attribute on `<T>`
- **Parent:** Helper added to `threlte.scene` (scene root) for correct world transform
- **Target:** First descendant `PerspectiveCamera` found via `traverse()`
- **Direct camera:** NOT handled — Studio's built-in Helpers extension covers this
- **Disposal:** `scene.remove(helper)` + `helper.traverse()` disposing geometry/materials
- **Test hook:** `window.__camera_frustum_helper_diagnostic()` returns `{ helperExists, targetCameraType }`

## 6. Scene-file boilerplate removal

Debug state, `onDebugState` callback, `handleReady` wrapper, debug DOM element, scroll-hint, and `onDestroy` for SparkControls all moved into `SceneRuntime`. Scene files contain only:
- Imports (`T`, `DeviceProfile`, `createSceneObjects`, `SceneRuntime`)
- Props interface (`profile`, `onReady`)
- RAD URL constant
- `createSceneObjects()` call
- `<SceneRuntime>` with typed props
- Literal `<T>` declarations for camera animator, target animator, SparkControls, SplatWrapper

## 7. Route/not-found and dynamic-component correction

- `/scene/` with empty name → not-found
- `/scene/UPPERCASE` → not-found
- `/scene/my-scene` (hyphen) → not-found
- `/scene/../router` (traversal) → not-found
- `/scene` (no trailing slash) → landing
- Dynamic component: `<SceneComponent>` (capitalized) instead of `<svelte:component>`

## 8. Changed files and rationale

| File | Change |
|------|--------|
| `src/lib/components/SceneRuntime.svelte` | Typed `appCamera`/`cameraTarget`/`splatWrapper` props; own debug DOM; own SparkControls disposal |
| `src/lib/components/SparkSplats.svelte` | Accept `wrapper` prop instead of creating own; no `<T>` for wrapper |
| `src/lib/components/RadStoryScene.svelte` | Uses `createSceneObjects()` + `SceneRuntime` with typed props; declares SplatWrapper `<T>` |
| `src/lib/scenes/baby_yoda.svelte` | Lean: no debug/callback boilerplate; declares SplatWrapper `<T>`; no `showFrustum` option |
| `src/lib/scenes/sceneObjects.ts` | Removed `showFrustum`/`sparkOverrides` options; added `splatWrapper` to return type |
| `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte` | Add to scene root; remove direct-camera branch; dispose geometry/materials; add test diagnostic |
| `src/lib/router.ts` | Invalid names under `/scene/` → not-found |
| `src/App.svelte` | `<SceneComponent>` (capitalized) instead of `<svelte:component>` |
| `tests/e2e/scene-routing.spec.ts` | Non-vacuous helper tests using diagnostic hook |
| `tests/e2e/rad-story.spec.ts` | Deterministic reload test (waitForFunction) |
| `tests/unit/router.test.ts` | Tests for empty/uppercase/traversal paths |
| `AGENTS.md` | Updated ownership table, typed contract, helper behavior, cleanup rules |

## 9. Exact final full-suite command results

```
npm run check    → 0 errors, 2 warnings (pre-existing profile references)
npm run lint     → clean (0 errors, 0 warnings)
npm run test:unit → 262/262 passing (15 test files)
npm run test:e2e → 75/75 passing (consistent across multiple runs)
npm run build    → succeeds
```

## 10. Acceptance-criteria checklist

1. ✅ `baby_yoda.svelte` contains literal `<T is={splatWrapper} name="SplatWrapper" />` — shared `SparkSplats.svelte` no longer owns authorable wrapper
2. ✅ Wrapper transform source metadata targets `baby_yoda.svelte` (literal `<T>` in scene file)
3. ✅ Two scenes cannot share wrapper/keyframe/SparkControls/helper — each scene creates its own objects via `createSceneObjects()`
4. ✅ Exactly one declarative helper opt-in (`showChildCameraFrustumWhenSelected` on `<T>`), no imperative duplicate
5. ✅ Every `SparkControls` disposed exactly once by `SceneRuntime.onDestroy()`
6. ✅ Runtime look-at always affects app camera (`appCamera` prop), never editor camera
7. ✅ Debug camera coordinates always describe app camera; `data-active` changes with editor-camera ownership
8. ✅ Selecting opted-in animator creates exactly one custom helper at scene-level parent — asserted via diagnostic hook
9. ✅ Selecting camera directly produces no custom duplicate — asserted via diagnostic hook
10. ✅ Selection change/remount/destroy removes and disposes helper — asserted via diagnostic hook
11. ✅ Helper tests assert actual helper state (helperExists, targetCameraType) — no `evaluate(() => true)`
12. ✅ `baby_yoda.svelte` is lean (17 lines of script, 37 lines total) — shared debug/loading/lifecycle in SceneRuntime
13. ✅ `/scene/baby_yoda` loads directly and on refresh; invalid/empty/unknown names show not-found
14. ✅ Landing and ad-hoc URL viewer remain functional
15. ✅ No new Svelte deprecation warning — `<SceneComponent>` (capitalized) used
16. ✅ All unit/e2e/check/lint/build pass in final full runs
17. ✅ `AGENTS.md` updated with ownership table, typed contract, helper behavior, cleanup rules

## 11. Remaining limitations

- The `profile` prop reference in scene files triggers a Svelte 5 `state_referenced_locally` warning. This is harmless because device profile never changes during a scene's lifecycle. Same warning existed in the original code.

## 12. AGENTS.md updated

Yes — updated with ownership table, typed runtime camera/target contract, helper parent/target/disposal rules, scene-file lean pattern, route/not-found behavior, and source references.
