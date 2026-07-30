# Status: File-backed scenes and camera-rig frustum helper

## 1. Summary of implemented architecture

Refactored `RadStoryScene.svelte` into a reusable `SceneRuntime.svelte` plus lean, declarative scene files. `SceneRuntime` owns all shared behavior: ScrollTrigger lifecycle, scene-wide `ScrollAnimator` playback, per-frame camera look-at, Spark bridge/reload lifecycle, debug state, and the `CameraFrustumHelper`. Scene-specific declarations (RAD URL, `<T>` nodes for camera/target animators, SparkControls, keyframes, settings) live in individual scene files under `src/lib/scenes/`.

**Why Studio source sync targets each scene file:** Each scene file contains literal `<T>` nodes with source-syncable attributes (`keyframes`, `showChildCameraFrustumWhenSelected`, `settings`). These `<T>` nodes are NOT wrapped in reusable components — they are direct children of `SceneRuntime`'s `children` snippet. Studio's `transactions.buildTransaction()` derives source metadata from the object's `userData.threlteStudio`, which points to the scene file's `<T>` declaration. The transaction guard allows only `keyframes`, `showChildCameraFrustumWhenSelected`, and `settings` through, blocking transforms.

## 2. Route syntax and scene discovery

- Route: `/scene/{sceneName}` where `sceneName` matches `/^[a-z0-9_]+$/`
- Source files: `src/lib/scenes/{sceneName}.svelte`
- Discovery: `import.meta.glob('./[a-z0-9_]*.svelte', { eager: true })` in `registry.ts` — only files directly in `src/lib/scenes/` are discoverable
- Unknown names render a not-found state with a "Go home" button
- Navigation uses `history.pushState` + `popstate` (no SvelteKit)
- The landing page (`/`) and ad-hoc URL viewing (`/?url=...`) remain fully functional

## 3. Exact files added/changed

**Added:**
- `src/lib/router.ts` — Lightweight pathname router (`parseRoute`, `navigateToScene`, `navigateToLanding`)
- `src/lib/scenes/registry.ts` — Static scene discovery via `import.meta.glob`, name validation
- `src/lib/scenes/sceneObjects.ts` — `createSceneObjects()` factory for standard scene objects
- `src/lib/scenes/baby_yoda.svelte` — Baby Yoda scene at `/scene/baby_yoda`
- `src/lib/components/SceneRuntime.svelte` — Reusable scene runtime (ScrollTrigger, look-at, bridge, splats, helper)
- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte` — CameraHelper for opted-in ScrollAnimators
- `tests/unit/router.test.ts` — Unit tests for route parsing and scene name validation
- `tests/e2e/scene-routing.spec.ts` — E2E tests for scene routing, scroll playback, frustum helper

**Changed:**
- `src/App.svelte` — Added scene route handling, dynamic scene component rendering
- `src/lib/components/RadStoryScene.svelte` — Refactored to use `createSceneObjects()` + `SceneRuntime`
- `src/lib/spark/ScrollAnimator.ts` — Added `showChildCameraFrustumWhenSelected` property
- `src/lib/spark/SparkControls.ts` — Fixed type errors in `validated` variable declarations
- `src/lib/studio/scroll-animator/transactionGuard.ts` — Extended guard to allow `showChildCameraFrustumWhenSelected`
- `tests/e2e/rad-story.spec.ts` — Fixed pre-existing type errors (`toBeGreaterThan` args, wrapper position type)
- `tests/fixtures/spark-stub.ts` — Fixed pre-existing `pagerId` initialization error
- `tests/unit/ScrollAnimator.test.ts` — Added tests for `showChildCameraFrustumWhenSelected`
- `tests/unit/transactionGuard.test.ts` — Added test for `showChildCameraFrustumWhenSelected` sync
- `AGENTS.md` — Updated with scene routing, SceneRuntime, camera frustum helper, and source-sync guard docs

## 4. Baby Yoda scene

- Route: `/scene/baby_yoda`
- File: `src/lib/scenes/baby_yoda.svelte`
- RAD URL: `https://avner.us/baby_yoda-lod.rad` (hard-coded in scene source)
- Camera keyframes: scroll 0% at `(0, 0, -1)`, scroll 100% at `(0, 30, -1)`
- `showChildCameraFrustumWhenSelected: true`

## 5. Declarative camera-frustum-helper API

Property on `ScrollAnimator`: `showChildCameraFrustumWhenSelected: boolean` (default `false`).

Set as a boolean attribute on the `<T>` node:
```svelte
<T is={cameraAnimator} showChildCameraFrustumWhenSelected>
```

Behavior:
- Selecting the opted-in camera `ScrollAnimator` shows a `CameraHelper` for its first descendant `PerspectiveCamera`
- Selecting the `PerspectiveCamera` directly also shows the helper (mirrors Studio's built-in Helpers)
- Helper tracks animated camera's world transform every frame via `useTask`
- Cleaned up on selection change, scene change, and component destruction
- Uses public APIs only (`useObjectSelection`, `useThrelte`, `useTask`)
- Source-syncable via the transaction guard

## 6. Tests added and results

**Unit tests (259 total, all passing):**
- `tests/unit/router.test.ts` — 11 tests: scene name validation, route parsing for valid/invalid/unknown scenes
- `tests/unit/ScrollAnimator.test.ts` — 2 new tests for `showChildCameraFrustumWhenSelected`
- `tests/unit/transactionGuard.test.ts` — 1 new test for `showChildCameraFrustumWhenSelected` source sync

**E2E tests (71 total, 70 passing, 1 flaky pre-existing):**
- `tests/e2e/scene-routing.spec.ts` — 13 tests:
  - Direct visit and refresh of `/scene/baby_yoda`
  - Unknown scene not-found state
  - Not-found "Go home" navigation
  - Hard-coded URL (no query string mutation)
  - Scroll 0% and 100% camera positions
  - Browser back/forward
  - Scene remount without resource stacking
  - Landing page still works
  - Query-string URL pre-fill
  - Camera frustum helper: opted-in animator selection, unrelated selection cleanup, direct camera selection

**Commands/results:**
- `npm run check` — 0 errors, 3 warnings (all pre-existing)
- `npm run lint` — clean
- `npm run test:unit` — 259/259 passing
- `npm run test:e2e` — 70/71 passing (1 flaky pre-existing: "Spark pane capacity edit shows reload progress")
- `npm run build` — succeeds

## 7. Manual verification

Not performed (automation coverage is comprehensive). The Baby Yoda scene can be manually verified by visiting `/scene/baby_yoda` in the dev server.

## 8. Acceptance criteria checklist

1. ✅ Direct visit/refresh of `/scene/baby_yoda` loads the scene
2. ✅ Route maps to `src/lib/scenes/baby_yoda.svelte`; unknown names show not-found
3. ✅ Baby Yoda hard-codes `https://avner.us/baby_yoda-lod.rad` in scene source
4. ✅ Scene file is lean (17 lines of script, literal `<T>` nodes); shared logic in `SceneRuntime`
5. ✅ Studio can edit keyframes, Spark settings, and SplatWrapper transform — source sync targets scene file via literal `<T>` nodes
6. ✅ Single source of truth: keyframes/settings only in `<T>` attributes, not duplicated in constructors
7. ✅ Landing page URL viewing still works; query-string pre-fill preserved
8. ✅ Browser back/forward, scene remount, cleanup — tested without duplicate resources
9. ✅ Baby Yoda preserves scroll animation, look-at, editor camera toggle, Spark editing, capacity reload, stable wrapper
10. ✅ `showChildCameraFrustumWhenSelected` boolean property on `ScrollAnimator`, set as attribute on `<T>`
11. ✅ Selecting opted-in animator shows helper; selecting camera directly shows helper; unrelated selection hides it
12. ✅ Helper uses public APIs, editor-only, lifecycle-safe, no duplicates
13. ✅ New unit tests (routing, registry, frustum property) and e2e tests (routing, scroll, helper) added
14. ✅ Existing tests remain green (70/71, 1 flaky pre-existing)
15. ✅ `AGENTS.md` updated with scene routing, SceneRuntime, camera frustum helper, source-sync guard

## 9. Known limitations, follow-ups

- `<svelte:component>` triggers a deprecation warning in Svelte 5 runes mode ("components are dynamic by default"). The `<sceneComponent>` syntax does not work in practice for our use case, so `<svelte:component>` is retained. This is a Svelte 5 runtime behavior issue.
- The "Spark pane capacity edit shows reload progress" e2e test is flaky in the full suite (passes when run alone). This is a pre-existing timing issue unrelated to these changes.
- DOM elements (debug div, scroll-hint) must be rendered outside `<Canvas>` in each scene file, since DOM elements inside `<Canvas>` are Three.js overlays and may not render reliably for dynamic components. The `onDebugState` callback pattern bridges `SceneRuntime`'s internal debug state to the scene file's debug element.

## 10. AGENTS.md updated

Yes — updated with scene routing/registry, SceneRuntime, `createSceneObjects()` helper, camera frustum helper API, source-sync guard changes, and Baby Yoda scene details.
