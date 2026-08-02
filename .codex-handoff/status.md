# Status: Remove test-only diagnostics from production hot paths

## Summary

Extracted all test-only camera diagnostic state, per-frame tasks, and DOM rendering from `SceneRuntime.svelte` into a new `CameraDiagnostics.svelte` component, gated behind `import.meta.env.VITE_E2E_STUB_SPARK === 'true'`. This uses the existing e2e stub build flag — no new environment variable introduced.

In production builds, Vite replaces `import.meta.env.VITE_E2E_STUB_SPARK` with `undefined`, the `{#if}` block evaluates to `false`, and Rollup tree-shakes the entire `CameraDiagnostics` import and its reactive state. The production `SceneRuntime` has zero diagnostic overhead.

## Changed Files

| File | Change |
|------|--------|
| `src/lib/components/SceneRuntime.svelte` | Removed all diagnostic reactive state (`cameraProgress`, `cameraWorld*`, `targetWorld*`, `cameraIsActive`), removed `updateDebugState()` calls from ScrollTrigger hot path and per-frame task, removed diagnostic-only `useTask` (cameraIsActive check), removed `_camWorld` scratch vector, removed inline `<div class="camera-debug">`. Added `import` and conditional `<CameraDiagnostics>` render. Camera look-at task now contains only `getWorldPosition` + `lookAt`. |
| `src/lib/components/CameraDiagnostics.svelte` | **New file.** Encapsulates all diagnostic reactive state, per-frame coordinate updates, scroll percentage subscription from `scrollAnimatorRuntime.percentage`, camera-active check via `useTask`, and the `<div data-testid="camera-state">` element with all `data-*` attributes. |
| `tests/unit/cameraDiagnosticsGating.test.ts` | **New file.** 9 unit tests verifying: no diagnostic `$state` in SceneRuntime, no `updateDebugState`/`cameraProgress` in ScrollTrigger hot path, exactly one `useTask` (look-at only, no diagnostics), compile-time gate with `VITE_E2E_STUB_SPARK`, no inline `camera-debug` div in SceneRuntime, and complete attribute/reactive state contract in CameraDiagnostics. |
| `AGENTS.md` | Updated SceneRuntime description (removed "debug state"), added CameraDiagnostics to key files, rewrote "Camera Debug State" section to document the gating contract, new component, tree-shaking behavior, and test references. |

## What No Longer Runs in Production

1. **No diagnostic reactive state** — `cameraProgress`, `cameraWorldX/Y/Z`, `targetWorldX/Y/Z`, `cameraIsActive` are not declared in `SceneRuntime`
2. **No diagnostic calls in ScrollTrigger `onUpdate`** — `applyScrollToAllAnimators()` only traverses and applies keyframes; no `cameraProgress` assignment or `updateDebugState()` call
3. **No diagnostic calls in per-frame task** — The single `useTask` only does `cameraTarget.getWorldPosition()` + `appCamera.lookAt()`; no `updateDebugState()` call
4. **No diagnostic-only per-frame task** — The `cameraIsActive` identity check `useTask` is not registered
5. **No diagnostic DOM** — The `<div class="camera-debug">` element is not rendered
6. **No `getWorldPosition()` for camera coordinates** — The `_camWorld` scratch vector and its `getWorldPosition()` call are removed from `SceneRuntime`

## What Remains Intact

- Per-frame `cameraTarget.getWorldPosition(_targetWorld)` + `appCamera.lookAt(_targetWorld)` — essential application functionality
- Scene traversal and `ScrollAnimator.applyScrollPercentage()` on initial setup and every ScrollTrigger update
- `scrollAnimatorRuntime.updateProgress()` — drives the Studio authoring UI
- `ScrollTrigger` creation, scrub behavior, and lifecycle
- SparkControls registration, disposal, and all reload/bridge plumbing
- All stub-only `window.__spark_stub` hooks (scene UUID, camera UUID, controls registration)

## Tests

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run test:unit` | 436 passed (27 files), including 9 new gating tests |
| `npm run test:e2e` | 138 passed (all camera, scroll, routing, playback/edit, Spark controls, capacity reload, and frustum helper specs) |
| `npm run build` (production, flag unset) | Builds successfully; `CameraDiagnostics` tree-shaken (no `camera-debug` references in output) |
| `VITE_E2E_STUB_SPARK=true npx vite build` (stub) | Builds successfully; `camera-debug` and `data-testid="camera-state"` present in output |

## Acceptance Criteria Checklist

- [x] Normal dev/prod build does not register diagnostic-only frame task
- [x] Normal dev/prod build does not update test-only reactive state on scroll
- [x] Normal dev/prod build does not render hidden `camera-state` test element
- [x] E2e stub build retains camera diagnostic element and all attributes
- [x] Production still performs camera look-at every frame
- [x] Production still applies all ScrollAnimators on setup and ScrollTrigger updates
- [x] `scrollAnimatorRuntime.updateProgress()` preserved (drives Studio UI)
- [x] Editor-camera toggle e2e assertions observe correct `data-active` transitions in stub build
- [x] Scroll-position e2e assertions observe progress, coordinates, and target in stub build
- [x] Flag is `import.meta.env.VITE_E2E_STUB_SPARK` (compile-time, test tooling only)
- [x] Focused automated coverage added (9 tests in `cameraDiagnosticsGating.test.ts`)
- [x] `AGENTS.md` updated with gating contract and source references
- [x] No per-frame allocations, polling, timers, or additional reactive work introduced

## Commit

`1c8cd21` — pushed to `main`
