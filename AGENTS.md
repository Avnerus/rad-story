# RAD Story — Technical Guide

## Architecture

A client-side Threlte/Svelte 5/TypeScript web app for designing scroll-based stories over Spark 2.x streaming LOD Gaussian splats from user-provided RAD URLs. Camera animation is driven by scroll-keyframed `ScrollAnimator` objects authored via a Threlte Studio extension.

**Key files:**
- `src/App.svelte` — Root component. Landing screen ↔ viewer state machine. `<Canvas>` with `<Studio extensions={[ScrollAnimatorExtension]}>` wrapping `RadStoryScene`.
- `src/lib/components/RadStoryScene.svelte` — Camera setup, ScrollTrigger, `ScrollAnimator` instances (camera + target), `CameraTarget`, `SparkControls`, SparkRenderer bridge, and SplatMesh. Uses `useTask` for per-frame camera look-at. Scene-wide `ScrollAnimator` playback via `scene.traverse`.
- `src/lib/components/SparkSplats.svelte` — SplatMesh lifecycle only. Accepts `url` prop; the nested `<T is={mesh}>` is the Studio-editable object. No transform props (`position`, `rotation`, `scale`) are exposed — Studio authors the mesh directly.
- `src/lib/components/SparkStudioBridge.svelte` — Manages dual SparkRenderer lifecycle via `createSparkStudioRenderer`. Subscribes to `SparkControls` settings changes and propagates them to both renderers in real time.
- `src/lib/spark/SparkControls.ts` — Three.js `Object3D` subclass holding all editable Spark 2.1 quality/LOD/foveation settings. Appears as "Spark" in Studio outline. Only `settings` property is source-synced; transforms are blocked by the transaction guard. All values validated against field-specific bounds.
- `src/lib/spark/ScrollAnimator.ts` — Three.js `Object3D` subclass with `keyframes` property and `applyScrollPercentage()`.
- `src/lib/spark/scrollAnimation.ts` — Pure keyframe model, canonicalization (with dedup), upsert/delete, bracketing, and interpolation (position lerp + quaternion slerp).
- `src/lib/studio/scroll-animator/ScrollAnimatorExtension.svelte` — Studio extension: fixed toolbar pane with percentage display/input, keyframe list, jump, delete, and insert/save actions. Uses public `@threlte/studio/extensions` imports. Toolbar icon: `mdiAnimationOutline`.
- `src/lib/studio/scroll-animator/FixedToolbarPane.svelte` — Local replacement for Studio's `DropDownPane`. Uses public `ToolbarButton` + `ToolbarItem` from `@threlte/studio/extend`, `@floating-ui/dom` (direct dependency) for `computePosition` with `strategy: 'fixed'`, and a simple portal to `document.body`. See "Studio Extension Pane" section below.
- `src/lib/studio/scroll-animator/scrollAnimatorRuntime.ts` — Shared runtime bridge: reactive percentage from ScrollTrigger, `jumpToPercentage` via trigger's measured range, attach/detach lifecycle.
- `src/lib/studio/scroll-animator/transactionGuard.ts` — Suppresses source sync for ScrollAnimator transforms (only `keyframes` persists) and SparkControls transforms (only `settings` persists). Uses narrow structural types (no private imports).
- `src/lib/studio/editor-camera/editorCameraControlsBridge.ts` — Future-facing, typed bridge for Studio editor CameraControls tuning. Currently unattached (no supported public path to the CameraControls instance). Documented in code.
- `src/lib/spark/createSparkStudioRenderer.ts` — Factory for dual SparkRenderer setup. Includes `applySettings()` for live propagation and `reconfigureMaxPagedSplats()` for controlled renderer/pager recreation.
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

The `guardScrollAnimatorTransactions` helper runs via `useTransactions().onTransaction()`. For any transaction whose object is a branded `ScrollAnimator`, it clears `transaction.sync` unless `attributeName` is exactly `keyframes` or ends with `.keyframes` (path-prefixed). For `SparkControls`, it clears sync unless `attributeName` is `settings` or ends with `.settings`. Descendant attributes like `keyframes.0`, `settings.lodSplatScale`, or `scene.keyframes.position` are blocked. This prevents Studio's transform controls from writing `position`, `rotation`, or `scale` into Svelte source, while allowing the intended persisted attributes through.

Keyframe mutations use `transactions.buildTransaction()` which derives source metadata from the object's `userData.threlteStudio` automatically. No private metadata imports needed.

## SparkControls — Studio-Editable Spark Settings

`SparkControls extends Object3D` is a branded settings controller that appears in the Studio outline as a selectable object named "Spark". It holds all editable Spark 2.1 rendering-quality, LOD, foveation, and paging-budget controls.

**Mandatory fields (from device profile):**
- `lodSplatScale`, `lodRenderScale`, `maxStdDev`, `maxPagedSplats` — LOD quality and budget
- `coneFov0`, `coneFov` — Full-width cone angles in **degrees** (Spark 2.1 API, not normalized scalars)
- `coneFoveate`, `behindFoveate` — Detail scale factors at cone boundaries

**Additional quality/LOD controls:**
- `minPixelRadius`, `maxPixelRadius`, `minAlpha`, `preBlurAmount`, `blurAmount`, `falloff`, `clipXY`, `focalAdjustment` — Shader quality parameters
- `sortRadial`, `minSortIntervalMs` — Sort behavior
- `enableLod`, `enableLodFetching`, `lodSplatCount` (null = automatic), `lodInflate` — LOD toggles

**Validation:** All numeric values are clamped to field-specific bounds. `maxPagedSplats` is rounded up to the nearest multiple of `65,536` (Spark page size). `coneFov0 <= coneFov` is enforced (if violated, `coneFov` is raised to match). NaN/Infinity fall back to defaults.

**Live propagation:**
- Ordinary settings (all except `maxPagedSplats`) are applied live to both editor and real SparkRenderer via `applyLiveSettings()`. Foveation changes (`coneFov0`, `coneFov`, `coneFoveate`, `behindFoveate`) mark `lodDirty = true` on the real renderer, forcing a new LOD traversal even without camera movement.
- `maxPagedSplats` requires controlled renderer/pager recreation via `reconfigureMaxPagedSplats()`. This disposes both SparkRenderer instances and creates new ones with the new capacity. The SplatMesh and its scene transform are preserved. The dual-renderer architecture and camera routing are maintained. A recreation lock prevents concurrent rapid edits.

**Transaction guard:** Only `settings` persists through source sync. Transform attributes (`position`, `rotation`, `scale`) are blocked.

**Cone angle defaults:** Desktop uses Spark 2.1 defaults (`coneFov0: 90`, `coneFov: 120`). Mobile uses slightly tighter cones (`coneFov0: 70`, `coneFov: 110`). These are full-width **degrees**, not the accidental sub-degree values from an old API.

**Frustum/LOD findings:** Spark 2.1 uses angular foveation, not strict frustum culling. Objects outside the perspective frustum but within the foveation cone (up to 180°) are still refined. `clipXY` controls shader draw clipping of splat centers only, not LOD paging/refinement. The `behindFoveate` parameter controls refinement behind the viewer — setting it to a low value (e.g. `0.1`) reduces but does not eliminate off-screen refinement. No public API provides strict frustum-only LOD cutoff.

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
- **SplatMesh** is created with `paged: true` for RAD streaming. Owned by Threlte `<T>` for declarative transforms. Disposed in `onDestroy`.
- **WebGLRenderer** uses `antialias: false`. DPR clamped to `Math.min(devicePixelRatio, 2)` on desktop, `1` on mobile.
- **renderMode="always"** on `<Canvas>` ensures Spark streaming/sorting renders every frame.
- Theatre.js is **not** used.

## Threlte Studio Integration

- `<Studio extensions={[ScrollAnimatorExtension]}>` wraps the viewer scene. The `threlteStudio()` Vite plugin is registered before `svelte()` in `vite.config.ts`.
- Studio editor cameras are marked with `camera.userData.editorCamera = true`.
- Three literal `<T>` nodes in `RadStoryScene.svelte` host the `ScrollAnimator` instances and the `SparkControls` — not wrapped in reusable components — so Studio's source sync metadata targets independent `keyframes` and `settings` attributes respectively.
- Extension uses **only public** `@threlte/studio/extensions` imports (`useObjectSelection`, `useTransactions`). No private module imports or Vite aliases.

## Scroll Layout

Fixed canvas + scrollable document: `<Canvas>` in `.viewer-stage` (`position: fixed; inset: 0`), `.scroll-spacer` (400vh) in document flow.

## Camera Debug State

Visually hidden `<div class="camera-debug" data-testid="camera-state">` with:
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

Preferred for manual Studio authoring verification. Loads quickly, renders a small Baby Yoda splat at the origin, and avoids GPU stalls that make automation unreliable with larger files. Scroll 0% shows a close-up view; scroll 100% shows a top-down grid view from y=30.

Quick manual check with `playwright-cli`:
1. `playwright-cli open http://localhost:5173/` (after `npm run dev`)
2. Fill the URL input with the lightweight RAD URL, click Start
3. `playwright-cli screenshot` — confirms Baby Yoda renders at scroll 0%
4. `playwright-cli eval "window.scrollTo(0, document.body.scrollHeight)"` then `playwright-cli screenshot` — confirms top-down grid view at scroll 100%
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

For real-splat visual verification, use `playwright-cli screenshot` with the lightweight RAD URL (see above). Screenshots capture the compositor output correctly even when `readPixels()` returns black in headless mode.

**Spark controls e2e:** The Spark object appears in the Studio hierarchy and is selectable via `page.getByText('Spark')`. In the stub build, the Inspector may not render full settings content, but the Spark object's presence and selectability are verified.

## CORS Note

Remote RAD files and their `.radc` chunk files must be served with CORS headers.
