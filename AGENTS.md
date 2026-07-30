# RAD Story — Technical Guide

## Architecture

A client-side Threlte/Svelte 5/TypeScript web app for designing scroll-based stories over Spark 2.x streaming LOD Gaussian splats from user-provided RAD URLs. Camera animation is driven by scroll-keyframed `ScrollAnimator` objects authored via a Threlte Studio extension.

Supports two viewing modes:
1. **Ad-hoc URL viewing** — paste any `.rad` URL on the landing page
2. **File-backed scenes** — navigate to `/scene/{name}` to load a scene from `src/lib/scenes/{name}.svelte`

**Key files:**
- `src/App.svelte` — Root component. Landing screen ↔ viewer/scene/not-found state machine. Pathname router for `/scene/{sceneName}`. `<Canvas>` with `<Studio>` wrapping either `RadStoryScene` (ad-hoc) or a dynamic scene component (file-backed).
- `src/lib/components/SceneRuntime.svelte` — Reusable scene runtime: ScrollTrigger creation/attachment, scene-wide `ScrollAnimator` playback via `scene.traverse`, per-frame camera look-at, debug state, Spark bridge, reload lifecycle, and `CameraFrustumHelper`. Receives scene-specific `<T>` declarations via a `children` snippet.
- `src/lib/components/RadStoryScene.svelte` — Ad-hoc URL scene. Uses `createSceneObjects()` helper + `SceneRuntime`. Literal `<T>` nodes for camera/target animators, SparkControls. Debug element rendered outside `<Canvas>`.
- `src/lib/components/SparkSplats.svelte` — SplatMesh lifecycle in a stable `Object3D` wrapper (`SplatWrapper`). The wrapper owns transform/name/visibility and persists across mesh reloads. Exports `reload(url)` for `SparkStudioBridge` to call. Uses `SparkReloadCoordinator` for race-safe reload coordination.
- `src/lib/components/SparkStudioBridge.svelte` — Manages dual SparkRenderer lifecycle via `createSparkStudioRenderer`. Subscribes to `SparkControls` settings changes and propagates them to both renderers. On `maxPagedSplats` changes, calls `reconfigureMaxPagedSplats()` and triggers SplatMesh reload via `onMeshReload` callback.
- `src/lib/router.ts` — Lightweight pathname router for `/scene/{sceneName}`. Uses `parseRoute()` and `navigateToScene()`/`navigateToLanding()` with `history.pushState` + `popstate`.
- `src/lib/scenes/registry.ts` — Static scene discovery via `import.meta.glob('./[a-z0-9_]*.svelte', { eager: true })`. Validates names against `/^[a-z0-9_]+$/`. Maps normalized names to Svelte component default exports.
- `src/lib/scenes/sceneObjects.ts` — `createSceneObjects(profile, opts)` factory: creates `PerspectiveCamera`, `CameraTarget`, `ScrollAnimator` (camera + target), and `SparkControls`. Keyframes/settings are authored ONLY in `<T>` attributes (single source of truth).
- `src/lib/scenes/baby_yoda.svelte` — Example scene: `/scene/baby_yoda`, RAD URL `https://avner.us/baby_yoda-lod.rad`, frustum helper enabled.
- `src/lib/spark/SparkControls.ts` — Three.js `Object3D` subclass holding all editable Spark 2.1 quality/LOD/foveation settings. Appears as "Spark" in Studio outline. Has a writable `settings` getter/setter for Threlte `<T>` source sync, plus individual top-level property getters/setters for each field. All values validated against field-specific bounds; constructor input and single-field edits both pass through the same validation path.
- `src/lib/spark/ScrollAnimator.ts` — Three.js `Object3D` subclass with `keyframes` property, `showChildCameraFrustumWhenSelected` boolean, and `applyScrollPercentage()`.
- `src/lib/spark/scrollAnimation.ts` — Pure keyframe model, canonicalization (with dedup), upsert/delete, bracketing, and interpolation (position lerp + quaternion slerp).
- `src/lib/studio/scroll-animator/ScrollAnimatorExtension.svelte` — Studio extension: fixed toolbar pane with percentage display/input, keyframe list, jump, delete, and insert/save actions. Uses public `@threlte/studio/extensions` imports. Toolbar icon: `mdiAnimationOutline`.
- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte` — Shows a Three.js `CameraHelper` for the descendant `PerspectiveCamera` of a selected `ScrollAnimator` with `showChildCameraFrustumWhenSelected = true`. Also shows for directly selected cameras. Updates helper every frame via `useTask`. Cleaned up on selection change/destroy.
- `src/lib/studio/scroll-animator/FixedToolbarPane.svelte` — Local replacement for Studio's `DropDownPane`. Uses public `ToolbarButton` + `ToolbarItem` from `@threlte/studio/extend`, `@floating-ui/dom` (direct dependency) for `computePosition` with `strategy: 'fixed'`, and a simple portal to `document.body`. See "Studio Extension Pane" section below.
- `src/lib/studio/scroll-animator/scrollAnimatorRuntime.ts` — Shared runtime bridge: reactive percentage from ScrollTrigger, `jumpToPercentage` via trigger's measured range, attach/detach lifecycle.
- `src/lib/studio/scroll-animator/transactionGuard.ts` — Suppresses source sync for ScrollAnimator transforms (only `keyframes` and `showChildCameraFrustumWhenSelected` persist) and SparkControls transforms (only `settings` root and individual field names persist). Uses narrow structural types (no private imports).
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte` — Studio extension: fixed toolbar pane with individual numeric/boolean/nullable inputs for all 22 Spark settings. Uses `buildSparkSettingsTransaction()` helper from `sparkSettingsTransaction.ts` to build transaction objects. Uses `mdiTune` icon.
- `src/lib/studio/spark-controls/sparkSettingsTransaction.ts` — Production helper for building Spark settings transactions (`buildSparkSettingsTransaction()`). Used by the extension and tested independently.
- `src/lib/studio/spark-controls/SparkFixedToolbarPane.svelte` — Fixed toolbar pane for Spark controls (separate from ScrollAnimator's pane).
- `src/lib/spark/SparkReloadRuntime.ts` — `SparkReloadCoordinator` class (per-instance, not singleton) for race-safe SplatMesh reload coordination. Uses monotonically increasing generation IDs: latest request wins, superseded requests disposed, component destruction aborts in-flight operations. No arbitrary timing delays. `onReloadComplete` callback may return `void | Promise<void>`; the coordinator awaits it, keeping `requestReload()` and `isReloading` pending through full activation. Callback rejection is caught for the current generation and reported via `status.fail()`. Only the current generation publishes a terminal result. `SparkReloadStatus` (subscribe/unsubscribe) for pane progress/error UI.
- `src/lib/studio/editor-camera/editorCameraControlsBridge.ts` — Future-facing, typed bridge for Studio editor CameraControls tuning. Currently unattached (no supported public path to the CameraControls instance). Documented in code.
- `src/lib/spark/createSparkStudioRenderer.ts` — Factory for dual SparkRenderer setup. `applyChangedSettings()` applies only changed fields with field-level dirty classification (shader/sort/LOD/foveation). `reconfigureMaxPagedSplats()` recreates both renderers with the complete current settings snapshot so ordinary edits survive capacity changes.
- `src/lib/spark/deviceProfile.ts` — Mobile/iOS detection + Spark performance profile. Cone angles are full-width **degrees** (Spark 2.1 API: default `coneFov0: 90`, `coneFov: 120`).
- `src/lib/spark/radUrl.ts` — RAD URL validation with typed results.
- `src/lib/types.ts` — Shared TypeScript types.

## ScrollAnimator Model

`ScrollAnimator extends Object3D` holds a `keyframes` array of plain `{ scroll, position, rotation }` objects:

```ts
interface ScrollKeyframe {
  scroll: number        // 0..100, rounded to 2 decimals
  position: [number, number, number]
  rotation: [number, number, number]  // XYZ Euler radians
}
```

- Position interpolates linearly; rotation uses shortest-path quaternion slerp.
- `applyScrollPercentage(percent)` samples and applies local position/quaternion.
- Zero keyframes: no mutation. One keyframe: used at all percentages.
- Brand: `isScrollAnimator = true`, `type = 'ScrollAnimator'`, plus callable `applyScrollPercentage`.
- Canonicalization deduplicates entries that normalize to the same percentage (last-write-wins).
- `showChildCameraFrustumWhenSelected` — boolean property (default `false`). When `true` and the animator is selected in Studio, a `CameraHelper` is shown for its descendant `PerspectiveCamera`. Source-syncable via the transaction guard.

## ScrollTrigger Runtime

One GSAP ScrollTrigger with **boolean `scrub: true`** (never numeric) drives all animators. On initial setup and every `onUpdate`, the scene is traversed and `applyScrollPercentage` is called on every branded `ScrollAnimator`. No per-frame/effect loop reapplies animator transforms. ScrollTrigger retains its own RAF synchronization and resize refresh.

The `scrollAnimatorRuntime` singleton bridges the scene and extension:
- Reactive percentage via Svelte store (subscribed by extension)
- `jumpToPercentage()` uses the trigger's `start`, `end`, and `scroll()`
- `attach()`/`detach()` lifecycle tied to trigger identity

## Camera / CameraTarget Hierarchy

- Real `PerspectiveCamera` is a child of `Camera ScrollAnimator`.
- The camera is registered as the default Threlte camera declaratively via `<T is={camera} makeDefault />`. No imperative `threlte.camera.set()` or `makeDefaultCameras.add()` calls.
- Named `CameraTarget` (`Object3D`) is a child of `Camera Target ScrollAnimator`.
- The real camera **always looks at CameraTarget's world position**, updated every frame via a Threlte `useTask` (not a renderer.render wrapper).
- Camera animator rotation does not fight the target constraint — look-at wins for the camera's final viewing direction.
- **Editor camera toggle**: Studio's built-in editor-camera extension can override the active camera. When disabled, Threlte restores the default camera (the nested `PerspectiveCamera`). When enabled, Studio's editor camera takes over. The `data-active` attribute on the camera debug element indicates whether the app camera is currently active.

## Scene Routing and Registry

Route namespace: `/scene/{sceneName}`. Source files: `src/lib/scenes/{sceneName}.svelte`.

**Registry** (`src/lib/scenes/registry.ts`): Uses `import.meta.glob('./[a-z0-9_]*.svelte', { eager: true })` to discover scene modules. Validates names against `/^[a-z0-9_]+$/`. Only files directly in `src/lib/scenes/` are discoverable — no path traversal or arbitrary imports.

**Router** (`src/lib/router.ts`): Lightweight pathname router using `window.location.pathname` and `history.pushState` + `popstate`. `parseRoute()` returns `{ kind: 'scene', scene }`, `{ kind: 'not-found', attemptedName }`, or `{ kind: 'landing' }`.

**Scene contract**: Each scene file is a Svelte component that:
1. Imports `createSceneObjects()` from `./sceneObjects` to create camera, target, animators, and SparkControls
2. Renders `<SceneRuntime>` with scene-specific props (RAD URL, profile, sparkControls)
3. Declares literal `<T>` nodes inside `SceneRuntime` for Studio source sync
4. Renders its own debug div outside `<Canvas>` (DOM elements inside `<Canvas>` are overlays)

**Scene authoring** (`src/lib/scenes/sceneObjects.ts`): `createSceneObjects(profile, { showFrustum?, sparkOverrides? })` creates all standard scene objects. Keyframes and settings are authored ONLY in `<T>` attributes — never duplicated in constructor assignments. The factory provides empty defaults overwritten by `<T>` source-sync values.

**Example**: `src/lib/scenes/baby_yoda.svelte` at `/scene/baby_yoda` with RAD URL `https://avner.us/baby_yoda-lod.rad`.

## Camera Frustum Helper

`CameraFrustumHelper.svelte` shows a Three.js `CameraHelper` when:
- A `ScrollAnimator` with `showChildCameraFrustumWhenSelected = true` is selected (shows helper for its descendant `PerspectiveCamera`)
- A `PerspectiveCamera` is selected directly (mirrors Studio's built-in Helpers behavior)

The helper tracks the animated camera's world transform every frame via `useTask`. It is added to the animator (or scene root for direct camera selection) and removed on selection change. Uses public APIs only (`useObjectSelection`, `useThrelte`, `useTask`).

## Studio Extension Pane

Registered via `<Studio extensions={[ScrollAnimatorExtension]}>`. Uses public `useObjectSelection` and `useTransactions` from `@threlte/studio/extensions`. The toolbar button and panel are provided by `FixedToolbarPane.svelte` (a local component, not Studio's `DropDownPane`), with `icon="mdiAnimationOutline"` and `label="Scroll Animator"`.

**Why not `DropDownPane`:** Studio's `DropDownPane` uses Floating UI's default `strategy: 'absolute'` internally, which returns document-relative coordinates. When applied to its `position: fixed` tooltip element after scrolling, this pushes the panel below the viewport. `FixedToolbarPane` uses `strategy: 'fixed'` explicitly and portals the panel to `document.body` so it renders above the Studio canvas overlay.

**Positioning invariant:** `computePosition(anchor, panel, { strategy: 'fixed', ... })` must always use `strategy: 'fixed'`. The panel is portal'd to `document.body` via a simple Svelte action. `autoUpdate` from `@floating-ui/dom` owns the positioning lifecycle — it handles ancestor scroll/resize, element resize for both anchor and panel, and layout shifts. Cleanup is idempotent on close/destroy. A stale-result guard ensures async `computePosition` results cannot affect a closed or newly opened panel. The panel uses `:global(.sa-panel-tooltip) { position: fixed }` CSS scoped via `:global()` to survive the portal.

**Panel content:**
1. Semantic `<h2 class="sa-heading">Scroll Animator</h2>` heading (no inert Tweakpane title button).
2. Live ScrollTrigger percentage from the shared runtime bridge.
3. Numeric percentage input (0..100) — available in all modes; draft string not overwritten while focused; commits on Enter/blur with double-commit guard.
4. Sorted keyframe list with clickable jump buttons (always) and delete buttons (source-sync only).
5. "Insert/save scroll keyframe" button (source-sync only) — captures local position + Euler rotation at current percentage.

Active only for exactly one selected `ScrollAnimator`; otherwise shows "Select one ScrollAnimator". When source sync is unavailable, a warning is shown but percentage navigation and keyframe jumps remain functional.

**Lifecycle:** The Scroll Animator pane is a persistent nonmodal authoring pane. It closes only via the toolbar toggle or Escape key (which restores focus to the actual toggle button). Outside pointer interactions — hierarchy selection, Inspector, canvas clicks, transform controls — do not close it. Selection changes update the pane content in place: switching between ScrollAnimators updates the name and keyframes; selecting a non-ScrollAnimator, multiple objects, or no object shows the neutral "Select one ScrollAnimator" state. `autoUpdate` is cleaned up idempotently on close and destroy. The panel uses `role="dialog"` with `aria-modal="false"` and `aria-labelledby` referencing the semantic heading — not `role="menu"` — because its content (heading, number input, buttons) is form-like rather than a menu/menuitem structure.

## Source-Sync Guard Invariant

The `guardScrollAnimatorTransactions` helper runs via `useTransactions().onTransaction()`. For any transaction whose object is a branded `ScrollAnimator`, it clears `transaction.sync` unless the final path segment is exactly `keyframes` or `showChildCameraFrustumWhenSelected`. For `SparkControls`, it clears sync unless `attributeName` is `settings` (root) or an individual whitelisted field name. Descendant attributes like `keyframes.0`, `settings.lodSplatScale`, or `scene.keyframes.position` are blocked. This prevents Studio's transform controls from writing `position`, `rotation`, or `scale` into Svelte source, while allowing the intended persisted attributes through.

Keyframe mutations use `transactions.buildTransaction()` which derives source metadata from the object's `userData.threlteStudio` automatically. No private metadata imports needed.

## SparkControls — Studio-Editable Spark Settings

`SparkControls extends Object3D` is a branded settings controller that appears in the Studio outline as a selectable object named "Spark". It holds all editable Spark 2.1 rendering-quality, LOD, foveation, and paging-budget controls.

**Editor pane:** The `SparkControlsExtension` provides a fixed toolbar pane (icon: `mdiTune`, label: "Spark Controls") with individual labeled inputs for all 22 settings. Numeric fields use `<input type="number">`, booleans use checkboxes, and `lodSplatCount` uses a text input with "auto" placeholder for null. Edits are committed via `transactions.buildTransaction()` with source sync on the `settings` property. The pane is active only when the Spark object is selected.

**Reload status subscription:** `SparkControls.reloadStatus` is a `SparkReloadStatus` instance with `subscribe(fn)` / `unsubscribe()` API. The extension subscribes when a Spark controller is selected and cleans up on selection change/destroy. Status updates (`isReloading`, `error`) drive the pane's progress/error indicators reactively. The coordinator's status is mirrored via `handleReloadStatus()` → `sparkControls.reloadStatus.update()`.

**Source sync:** The `<T is={sparkControls} settings={sparkControls.settings} />` pattern exposes a writable `settings` property that Threlte Studio source syncs as a whole object. The transaction guard whitelists `settings` (root) and individual field names, while blocking transforms and nested paths like `settings.lodSplatScale`.

**Mandatory fields (from device profile):**
- `lodSplatScale`, `lodRenderScale`, `maxStdDev`, `maxPagedSplats` — LOD quality and budget
- `coneFov0`, `coneFov` — Full-width cone angles in **degrees** (Spark 2.1 API, not normalized scalars)
- `coneFoveate`, `behindFoveate` — Detail scale factors at cone boundaries

**Additional quality/LOD controls:**
- `minPixelRadius`, `maxPixelRadius`, `minAlpha`, `preBlurAmount`, `blurAmount`, `falloff`, `clipXY`, `focalAdjustment` — Shader quality parameters
- `sortRadial`, `minSortIntervalMs` — Sort behavior
- `enableLod`, `enableLodFetching`, `lodSplatCount` (null = automatic), `lodInflate` — LOD toggles

**Validation:** All numeric values are clamped to field-specific bounds. `maxPagedSplats` is rounded up to the nearest multiple of `65,536` (Spark page size). `coneFov0 <= coneFov` is enforced when editing either field (the other is raised if needed). `minPixelRadius <= maxPixelRadius` similarly enforced. NaN/Infinity fall back to defaults. Constructor input and single-field edits both pass through the same validation path.

**Installed Spark 2.1 defaults matched:** `blurAmount: 0.3` (not 0), `clipXY: 1.4`, `falloff: 1`, `lodSplatScale: 1`, etc. All non-profile defaults match the installed Spark constructor defaults.

**Live propagation with field-level change detection:**
- `applyChangedSettings()` compares old vs new settings and applies only changed fields.
- Changed fields are classified: shader-only (mark dirty), sort-affecting (mark sortDirty), LOD budget (mark lodDirty), foveation (mark lodDirty), LOD toggle (mark lodDirty).
- `lodSplatCount` null → `undefined` on renderer (restores automatic/platform default).
- `maxPagedSplats` requires controlled renderer/pager recreation via `reconfigureMaxPagedSplats()`. This disposes both SparkRenderer instances and creates new ones with the new capacity. The complete current settings snapshot is applied to the new renderers so ordinary edits survive. A recreation lock prevents concurrent rapid edits.
- After renderer recreation, the bridge calls `onMeshReload(radUrl)` which invokes `SparkSplats.reload()`. The `SparkReloadCoordinator` creates a new `SplatMesh`, awaits `SplatMesh.initialized`, then `SparkSplats` attaches the mesh to the wrapper and waits for pager handoff (`mesh.paged.pager === realRenderer.pager`) via RAF polling with bounded timeout and cancellation. Only after pager identity is confirmed does `status.success()` fire. The old mesh is disposed from the `SplatWrapper`, and the new mesh is added. The `SplatWrapper` (and its authored transform) persists. Reload status (`isReloading`, `error`) flows through coordinator `SparkReloadStatus` → `handleReloadStatus` → `SparkControls.reloadStatus.update()` → extension subscription. Camera, ScrollAnimators, scroll position, and unrelated scene objects are preserved.

**Cone angle defaults:** Desktop uses Spark 2.1 defaults (`coneFov0: 90`, `coneFov: 120`). Mobile uses slightly tighter cones (`coneFov0: 70`, `coneFov: 110`). These are full-width **degrees**, not the accidental sub-degree values from an old API.

**Frustum/LOD findings:** Spark 2.1 uses angular foveation, not strict frustum culling. Objects outside the perspective frustum but within the foveation cone (up to 180°) are still refined. `clipXY` controls shader draw clipping of splat centers only, not LOD paging/refinement. The `behindFoveate` parameter controls refinement behind the viewer — setting it to a low value (e.g. `0.1`) reduces but does not eliminate off-screen refinement. No public API provides strict frustum-only LOD cutoff.

## SparkReloadCoordinator — Race-Safe Mesh Reload

`SparkReloadCoordinator` (in `src/lib/spark/SparkReloadRuntime.ts`) is a per-instance class (not a singleton) that coordinates SplatMesh reloads when `maxPagedSplats` changes.

**Race safety via generation IDs:**
- Each `requestReload()` call increments a monotonically increasing generation counter.
- The `_doReload()` method checks the generation before and after the async `createMesh()` call.
- If a newer request has superseded the current one, the superseded mesh is disposed and the callback is skipped.
- `dispose()` sets `_destroyed = true` and clears `_currentRequest`, which aborts any in-flight reload.
- No arbitrary timing delays — completion is tied to `SplatMesh.initialized`.

**Mesh state preservation via SplatWrapper:**
- `SparkSplats.svelte` creates a stable `Object3D` named `SplatWrapper` that is the `<T>` target.
- The `SplatMesh` is a child of the wrapper, not the direct `<T>` target.
- During reload, the old `SplatMesh` is removed and disposed from the wrapper, and the new one is added.
- The wrapper's transform, name, visibility, and scene hierarchy position are preserved.
- Studio-authored transforms on the wrapper survive reloads.

**Integration flow:**
1. User edits `maxPagedSplats` in Spark Controls pane.
2. `SparkControls.setOne()` validates and fires `onChange` with changed keys.
3. `SparkStudioBridge` detects `changed.has('maxPagedSplats')`.
4. Bridge calls `studioHandle.reconfigureMaxPagedSplats(newSettings)` (recreates both renderers).
5. Bridge calls `onMeshReload(radUrl)` → `SparkSplats.reload(url)`.
6. `SparkReloadCoordinator.requestReload()` creates new mesh, awaits `initialized`, then awaits async `onReloadComplete` callback.
7. `onReloadComplete` attaches new mesh to wrapper, then awaits `waitForPagerHandoff()` (RAF polling for `mesh.paged.pager === realRenderer.pager`, bounded 5s, cancellation-aware).
8. Coordinator awaits the callback: `requestReload()` and `isReloading` remain pending through full activation.
9. On pager match confirmed, coordinator calls `status.success()` → pane clears progress indicator.
10. On timeout/failure, coordinator catches rejection, calls `status.fail()` → pane shows error.
11. `requestReload()` resolves. `isReloading` becomes false.

**Pager handoff and reload completion:** `SplatMesh.initialized` resolves when the mesh is constructed, but pager attachment (`mesh.paged.pager === renderer.pager`) occurs on the next render/update cycle. The `SparkSplats.waitForPagerHandoff()` method waits via RAF polling (bounded by 5s timeout, cancellation-aware) for the mesh's pager to match the driving renderer's pager. The `onReloadComplete` callback returns a promise for this wait; the coordinator awaits it, keeping `requestReload()` and `isReloading` pending until activation completes. On timeout or failure, the coordinator catches the rejection and calls `status.fail()`. Superseded generations cancel the wait and dispose their replacement mesh. In the stub build, the driving renderer's `update()` method assigns its pager to unassigned `SplatMesh` instances, and `SplatMesh.initialized` resolves after a microtask.

**Activation ownership and rollback:** After the coordinator creates the mesh and calls `onReloadComplete`, the component owns the replacement mesh. The component attaches the new mesh to the wrapper (replacing the old one). During `waitForPagerHandoff`, three failure modes trigger rollback cleanup:
- **Rejection** (e.g., pager handoff timeout): the `catch` block in `onReloadComplete` calls `detachMesh()` on the replacement if this generation is still current, then re-throws for the coordinator to catch.
- **Supersession** (newer generation fires while waiting): `waitForPagerHandoff` resolves (doesn't reject) when superseded. A post-handoff check then detaches the superseded mesh if a newer generation has taken over.
- **Destroy** (component unmounts): `onDestroy` sets `destroyed = true`, disposes the coordinator and current mesh. The in-flight callback sees `destroyed` and exits cleanly.

Cleanup is safe and idempotent: `detachMesh()` checks that the mesh is actually in the wrapper before removing it, and `dispose()` is idempotent. An older generation cannot detach the newest mesh because it checks `coordinator?.generation === generation && mesh === newMesh`.

**Stub diagnostics:** `__spark_stub_diagnostics` exposes `wrapper` (the `SplatWrapper` `Object3D`), `drivingPagerId`, `drivingGeneration`, `meshes`, `pagers`, and `renderers` for e2e assertions. `__stubActivationGate` (boolean on `window`) withholds pager assignment in `SparkRenderer.update()` for deterministic progress-visibility tests.

## Removed Features

Free navigation (checkbox, keyboard/mouse/wheel listeners, RAF loop, pure helpers) and the hard-coded two-pose `cameraTween` module have been removed. GSAP and ScrollTrigger are retained.

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run check` | Svelte + TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest unit tests |
| `npm run test:e2e` | Playwright e2e tests (builds with Spark stub + previews first) |
| `npm run test` | Run unit + e2e tests |

## Spark / Threlte Integration Notes

- **SparkRenderer** lifecycle is managed by `SparkStudioBridge.svelte` via `createSparkStudioRenderer()`. Two instances per scene:
  - **Editor renderer**: `enableLod: true`, `enableDriveLod: false`. Added to the Three scene. Sorts splats for Studio editor camera views but never drives LOD fetching or pager updates.
  - **Real-camera renderer**: `enableLod: true`, `enableDriveLod: true`. Never added to the scene. Drives LOD selection from the app's real camera. Its `lodInstances` map is shared with the editor renderer before each editor render.
- **Camera routing via `onBeforeRender` wrap**: Editor renderer's `onBeforeRender` is wrapped to detect `camera.userData.editorCamera === true`. Both paths pin their intended `SparkRenderer.sparkOverride` for the duration of the original callback and restore in `try/finally`.
- **SplatMesh** is created with `paged: true` for RAD streaming. Owned by a stable `SplatWrapper` `Object3D` (the `<T>` target) so that authored transforms survive mesh reloads. The wrapper persists across reloads; only the internal `SplatMesh` child is swapped. Disposed in `onDestroy`.
- **WebGLRenderer** uses `antialias: false`. DPR clamped to `Math.min(devicePixelRatio, 2)` on desktop, `1` on mobile.
- **renderMode="always"** on `<Canvas>` ensures Spark streaming/sorting renders every frame.
- Theatre.js is **not** used.

## Threlte Studio Integration

- `<Studio extensions={[ScrollAnimatorExtension, SparkControlsExtension]}>` wraps the viewer scene. The `threlteStudio()` Vite plugin is registered before `svelte()` in `vite.config.ts`.
- Studio editor cameras are marked with `camera.userData.editorCamera = true`.
- Literal `<T>` nodes in each scene file (`RadStoryScene.svelte`, `src/lib/scenes/*.svelte`) host the `ScrollAnimator` instances and the `SparkControls` — not wrapped in reusable components — so Studio's source sync metadata targets independent `keyframes`, `showChildCameraFrustumWhenSelected`, and `settings` attributes respectively.
- Extension uses **only public** `@threlte/studio/extensions` imports (`useObjectSelection`, `useTransactions`). No private module imports or Vite aliases.

## Scroll Layout

Fixed canvas + scrollable document: `<Canvas>` in `.viewer-stage` (`position: fixed; inset: 0`), `.scroll-spacer` (400vh) in document flow.

## Camera Debug State

Visually hidden `<div class="camera-debug" data-testid="camera-state">` rendered **outside** `<Canvas>` in each scene file (DOM elements inside `<Canvas>` are Three.js overlays). Debug state is pushed from `SceneRuntime` to the scene file via an `onDebugState` callback.

Attributes:
- `data-progress` — ScrollTrigger percentage
- `data-x`, `data-y`, `data-z` — Camera **world** position
- `data-target-x`, `data-target-y`, `data-target-z` — CameraTarget **world** position
- `data-active` — `"true"` when the app `PerspectiveCamera` is the active Threlte camera (editor camera off), `"false"` otherwise

## Studio Overlay Scroll-Safety

Tweakpane's `.tp-dfwv` class (used by Studio's toolbar and other fixed panes) defaults to `position: absolute`, which causes panes to scroll with the document. A targeted rule in `app.css` overrides this to `position: fixed !important` for all `.tp-dfwv` elements. The Scroll Animator panel is not a `.tp-dfwv` pane — it uses `FixedToolbarPane` which portals to `document.body` with `position: fixed` and Floating UI `strategy: 'fixed'`.

## Editor CameraControls Bridge

`src/lib/studio/editor-camera/editorCameraControlsBridge.ts` defines a typed, dependency-free interface for tuning Studio editor CameraControls parameters. Default values match the installed Studio defaults: `smoothTime: 0.05`, `draggingSmoothTime: 0.05`, `dollyToCursor: true`. The bridge is **unattached by default** — no production integration in this app attaches an instance, so `getCurrentControls()` returns `null` until a future supported owner calls `attachControls()`. Connecting Studio's internal instance requires an upstream public hook or an owned editor-camera extension replacement. Unit tests cover the full attach/detach/tuning API.

## Lightweight Authoring-Test RAD

```
https://avner.us/baby_yoda-lod.rad
```

This is also the hard-coded RAD URL for the Baby Yoda scene at `/scene/baby_yoda` (`src/lib/scenes/baby_yoda.svelte`).

Preferred for manual Studio authoring verification. Loads quickly, renders a small Baby Yoda splat at the origin, and avoids GPU stalls that make automation unreliable with larger files. Scroll 0% shows a close-up view; scroll 100% shows a top-down grid view from y=30.

Quick manual check with `playwright-cli`:
1. `playwright-cli open http://localhost:5173/` (after `npm run dev`)
2. Fill the URL input with the lightweight RAD URL, click Start
3. Screenshot via `run-code` (see E2E Testing section below) — confirms Baby Yoda renders at scroll 0%
4. `playwright-cli eval "window.scrollTo(0, document.body.scrollHeight)"` then screenshot via `run-code` — confirms top-down grid view at scroll 100%
5. Toggle Editor Camera. Prefer native pointer commands (e.g. `playwright-cli click "getByRole('button', { name: 'Editor Camera' })"`). If the real WebGL session stalls the automation tool, a synthetic `dispatchEvent` via evaluate can be used as a handler-level diagnostic (it proves the click handler fires but does not verify hit testing/pointer actionability):
   `playwright-cli eval "var btn=document.querySelector('button[aria-label=\"Editor Camera\"]'); btn.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}))"`
   Then check: `playwright-cli eval "document.querySelector('[data-testid=camera-state]').getAttribute('data-active')"`
   Toggle back the same way — confirms camera ownership round-trip (`true → false → true`)

The existing larger sample remains documented below for high-load/LOD testing.

## Source References

- Threlte authoring extensions: https://threlte.xyz/docs/reference/studio/authoring-extensions/
- Threlte object selection: https://threlte.xyz/docs/reference/studio/use-object-selection/
- Threlte transactions/source sync: https://threlte.xyz/docs/reference/studio/use-transactions/
- GSAP ScrollTrigger: https://gsap.com/docs/v3/Plugins/ScrollTrigger/

## Sample RAD URL

```
https://storage.googleapis.com/forge-dev-public/asundqui/rad/260217/cozy-spaceship_2-lod.rad
```

## E2E Testing

`npm run test:e2e` builds with `VITE_E2E_STUB_SPARK=true`. Studio UI elements are rendered inside the WebGL canvas overlay, so Playwright actionability checks can fail. Tests use targeted `page.evaluate()` for pane toggle clicks when necessary, while verifying visible content through standard locators.

**Scroll-first-then-open regression:** The Scroll Animator panel must be tested at scroll 0%, 50%, and 95% with the **scroll-first-then-open** sequence (scroll to percentage, then click the toolbar button). Tests use actual viewport geometry (`page.viewportSize()`) for assertions — not hard-coded constants.

**Additional regression tests:** Panel stays anchored while scrolling with it open; panel repositions on viewport resize; panel repositions on content size change; repeated open/close and viewer remount (no leaked observers); Escape and outside pointer closure.

**Pane identity:** The overlay test uses an explicit expected set of pane names. Inspector and Default Camera are tested in separate focused tests. The Inspector pane may be collapsed (width 0) in the stub build — identity is verified via toolbar button existence and `.tp-dfwv` title match.

**Pointer evidence:** In the Spark-stub e2e tests, native Playwright `.click()` works reliably for hierarchy items, toolbar buttons, and canvas clicks. Some toolbar buttons inside the canvas overlay (Static State, Inspector) use `evaluate()`-based DOM `.click()` because native clicks are intercepted by the canvas. With real splat rendering in headless Chromium, native clicks may time out due to GPU stalls; synthetic `dispatchEvent` via `page.evaluate()` can diagnose handler execution but does not verify hit testing/pointer actionability. Manual verification with `playwright-cli` should prefer native pointer commands.

For real-splat visual verification, `playwright-cli screenshot` times out (5s default) when GPU stalls block the compositor. Use `run-code` instead:

```bash
cat > .playwright-cli/ss.js << 'EOF'
async (page) => {
  await page.screenshot({ path: '/tmp/screenshot.png', timeout: 30000 });
}
EOF
playwright-cli run-code --filename=.playwright-cli/ss.js
```

This calls `page.screenshot()` directly with a configurable timeout, bypassing the playwright-cli default. `canvas.toDataURL()` returns black in headless Chromium (known `readPixels` limitation) — only the Playwright compositor screenshot captures real rendering.

**Spark controls e2e:** The Spark object appears in the Studio hierarchy and is selectable. The Spark Controls pane opens via toolbar button, shows all 22 individually labeled fields (`data-testid="spark-field-{name}"`), and supports editing numeric, boolean, nullable, and cone-angle fields. Source-sync-unavailable warning is verified. Pane open/close via Escape key is tested. The `__spark_stub` marker on `window` proves the stub build is active. Capacity edits verify normalization to 65,536 multiples. Reload status (`spark-reloading`, `spark-error`) is driven by the coordinator's `SparkReloadStatus` via reactive subscription on `SparkControls.reloadStatus`.

**Stub capacity e2e:** The stub models pager handoff: the driving renderer's `update()` assigns its pager to unassigned `SplatMesh.paged.pager`. `__spark_stub_diagnostics` on `window` exposes renderer/pager/mesh identities, disposal state, driving pager ID, and `wrapper` (the `SplatWrapper` Object3D). `__stubActivationGate` (boolean on `window`) withholds pager assignment for deterministic progress-visibility tests. Capacity e2e tests assert: deterministic progress visible while gate closed and cleared on release; exact old/new mesh IDs with old disposed, new mesh pager equals `drivingPagerId` with normalized capacity, exactly one active mesh; rapid edits settle on final generation/capacity with sole active mesh owned by final pager; wrapper transform (position/rotation/scale) set to unmistakable non-default values before reload and asserted identically after; mid-reload selection change updates pane in place without losing reload state; subscription lifecycle cleaned up on selection change.

**Debugging e2e failures with playwright-cli:** When e2e tests fail with unexpected errors, the fastest diagnosis is to rebuild with the stub (`VITE_E2E_STUB_SPARK=true npx vite build`), start a preview (`npx vite preview --port 4173`), then use `playwright-cli` to manually navigate and check `playwright-cli console` for runtime errors. Common pitfalls include stub methods missing from `SparkRenderer` (e.g. `setDirty()`, `onBeforeRender()`) or `Object3D` property conflicts (e.g. `id` is a non-configurable getter on `Object3D`).

**Interacting with Threlte Studio via playwright-cli:** The Studio scene hierarchy is rendered inside a `<tree-view>` custom element with a **shadow DOM**. `document.querySelectorAll()` from `page.evaluate()` does NOT penetrate shadow DOM boundaries — it will return 0 results for `.tv-item`, `.tv-item-text`, etc. However, Playwright's accessibility tree (used by `snapshot`, `getByText()`, `getByRole()`) **does** see into shadow DOM.

**Best practices for Studio interaction in playwright-cli:**
- Use `playwright-cli snapshot` to get element refs (e.g. `e205`), then `playwright-cli click e205`
- Use `playwright-cli click "getByText('Spark')"` or `playwright-cli click "getByRole('button', { name: 'Spark Controls' })"`
- Avoid `page.evaluate('() => document.querySelector(...)')` for Studio hierarchy items — they are inside shadow DOM
- If you must use evaluate, access the shadow root first: `host.shadowRoot.querySelectorAll('.tv-item')`
- Toolbar buttons (outside shadow DOM) work with both approaches

## CORS Note

Remote RAD files and their `.radc` chunk files must be served with CORS headers.
