# Status: Final verification correction — masked assertions removed

## 1. Corrected brand lookup and independent scene count

`CameraFrustumHelper.svelte` now counts branded helpers by reading `child.userData[HELPER_BRAND]` from `scene.children` directly. The previous code checked `child[HELPER_BRAND]` on the Object3D itself (not `userData`), which never matched. The component-state fallback (`if (ownedCount === 0 && helper && helper.parent) ownedCount = 1`) has been removed entirely. The diagnostic now independently inspects scene state.

**Evidence:**
- Source: `for (const child of scene.children) { if (child.userData[HELPER_BRAND] === true) ownedCount++ }`
- No fallback branch remains
- E2e: `ownedHelperCount === 1` on select, `0` on deselect, `3/3` after 3 cycles

## 2. Exact parent/target identity evidence

The diagnostic now exposes `sceneUuid` (the Three.js scene root UUID). SceneRuntime exposes `__stub_scene_uuid` and `__stub_app_camera_uuid` in stub builds. Tests assert:
- `helperParentUuid === sceneUuid` (exact scene root identity)
- `targetCameraUuid === appCameraUuid` (exact app camera identity)

**Evidence:**
- E2e: `helper parent is exact scene root` — `diag.helperParentUuid === sceneUuid`
- E2e: `helper targets exact app-camera identity` — `diag.targetCameraUuid === appCameraUuid`

## 3. Production resolver extraction and direct unit coverage

`findAllDescendantCameras()` extracted into `src/lib/studio/scroll-animator/descendantCameraResolver.ts`. Both `CameraFrustumHelper.svelte` and `tests/unit/cameraFrustumHelper.test.ts` import from the production module. No copied logic remains in tests.

**Evidence:**
- Source: `import { findAllDescendantCameras } from './descendantCameraResolver'` in CameraFrustumHelper
- Source: `import { findAllDescendantCameras } from '$lib/studio/scroll-animator/descendantCameraResolver'` in test
- Unit: 8 tests covering zero/one/multiple/deeply nested cases against the production function

## 4. Strict Baby Yoda source-target assertion

The `userData.threlteStudio` test now throws if the wrapper is missing, if `threlteStudio` metadata is absent, or if no string containing `baby_yoda` is found in the metadata tree. No fallback to generic key checks.

**Evidence:**
- E2e: `SplatWrapper has Studio source metadata targeting baby_yoda.svelte` — unconditional `expect(normalized).toContain('baby_yoda.svelte')`

## 5. Declarative wrapper transform values and reload/remount assertions

`baby_yoda.svelte` declares explicit identity transform on the SplatWrapper: `<T is={splatWrapper} name="SplatWrapper" position={[0,0,0]} rotation={[0,0,0]} scale={[1,1,1]} />`.

Two tests verify persistence:
- **Capacity reload:** Sets unmistakable non-default transform `(7,13,21)/(0.3,0.5,0.7)/(1.5,1.5,1.5)`, triggers reload, asserts all 9 values preserved exactly
- **Scene remount:** Asserts full position/rotation/scale before and after SPA navigation — declarative values persist from scene source

**Evidence:**
- E2e: `wrapper transform persists across capacity reload` — `expect(wrapperAfter).toEqual(wrapperTransform)`
- E2e: `wrapper declarative transform persists across scene remount` — `expect(wrapperAfter).toEqual(wrapperBefore)`

## 6. Exactly-once SparkControls lifecycle evidence

Stub module (`spark-stub.ts`) now tracks SparkControls disposal via `__spark_stub_register_controls` (called in SceneRuntime `onMount`) and `__spark_stub_record_controls_disposal` (called in SceneRuntime `onDestroy` before `dispose()`). The `sparkControlsDisposals` map is exposed in `__spark_stub_diagnostics`.

Test uses SPA navigation (Go Home button + `pushState`/`popstate`) to preserve stub module state across the lifecycle check.

**Evidence:**
- E2e: `old SparkControls disposed exactly once, new instance distinct` — old ID has count 1 after unmount, new ID has count 0 after remount

## 7. Precisely scoped editor-camera evidence

Test asserts app-camera debug coordinates (X/Y/Z) and `data-active` attribute remain correct when editor camera is toggled on/off. The test name and status wording now precisely describe what is proven: app-camera position and active ownership, not editor-camera orientation.

**Evidence:**
- E2e: `app-camera debug coordinates and active ownership remain correct while editor camera is active` — X/Y/Z stable, `data-active` toggles `true → false → true`
- Source: `SceneRuntime` always calls `appCamera.lookAt(_targetWorld)` — never touches editor camera

## 8. Changed files and rationale

| File | Change |
|------|--------|
| `src/lib/studio/scroll-animator/descendantCameraResolver.ts` | **New** — extracted `findAllDescendantCameras()` as pure production module |
| `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte` | Import resolver from module; fix brand check to `child.userData[HELPER_BRAND]`; remove fallback; add `sceneUuid` to diagnostic |
| `src/lib/components/SceneRuntime.svelte` | Expose `__stub_scene_uuid` and `__stub_app_camera_uuid` in stub builds; wire SparkControls registration/disposal hooks |
| `src/lib/scenes/baby_yoda.svelte` | Add declarative identity transform `position={[0,0,0]} rotation={[0,0,0]} scale={[1,1,1]}` to SplatWrapper `<T>` |
| `tests/fixtures/spark-stub.ts` | Add `_sparkControlsDisposals` map, `__spark_stub_register_controls`, `__spark_stub_record_controls_disposal`, `sparkControlsDisposals` in diagnostics |
| `tests/unit/cameraFrustumHelper.test.ts` | Import from production module instead of copying logic |
| `tests/e2e/scene-routing.spec.ts` | Add `sceneUuid`/`appCameraUuid` identity assertions; remove conditional source-target fallback; add declarative transform remount test; add SparkControls lifecycle test with SPA navigation; narrow editor-camera test scope |
| `AGENTS.md` | Document resolver module, corrected brand lookup, `sceneUuid` field, SparkControls disposal tracking |

## 9. Acceptance checklist mapped to unconditional assertions

| # | Criterion | Evidence |
|---|-----------|----------|
| 1 | Owned-helper count reads `userData`, no fallback, detects stale | Source: `child.userData[HELPER_BRAND]`; no fallback branch; E2e: `ownedHelperCount` across cycles |
| 2 | Exact scene-root parent UUID and app-camera target UUID | E2e: `helperParentUuid === sceneUuid`, `targetCameraUuid === appCameraUuid` |
| 3 | Zero/one/multiple tests import production resolver | Source: `import { findAllDescendantCameras }` from production module in both component and test |
| 4 | Diagnostic stub-only, safe teardown | Source: `__spark_stub === true` gate; `if (current === exposeHelperDiagnostic) delete`; E2e: remount cleanup |
| 5 | Baby Yoda metadata test fails without exact source | Source: `throw` on missing wrapper/studio/no match; E2e: unconditional `toContain('baby_yoda.svelte')` |
| 6 | Declarative transform on wrapper, asserted before/after remount | Source: `position={[0,0,0]} rotation={[0,0,0]} scale={[1,1,1]}`; E2e: `wrapperBefore === wrapperAfter` |
| 7 | Capacity reload preserves 9 runtime transform values | E2e: `wrapperAfter === wrapperTransform` (all 9 values) |
| 8 | Old SparkControls disposed exactly once, new distinct/not disposed | E2e: old count=1, new count=0, distinct IDs |
| 9 | Editor-camera evidence precisely scoped | E2e: app-camera X/Y/Z + data-active only; no editor orientation claim |
| 10 | `npm run check` zero errors, zero warnings | `svelte-check found 0 errors and 0 warnings` |
| 11 | Lint, unit, e2e, build all pass | See below |
| 12 | `AGENTS.md` documents final accurate contracts | Resolver module, brand fix, `sceneUuid`, disposal tracking |

## 10. Exact full-suite results

```
$ npm run check
svelte-check found 0 errors and 0 warnings

$ npm run lint
(no output — clean)

$ npm run test:unit
Test Files  17 passed (17)
Tests       286 passed (286)

$ npm run test:e2e
85 passed (25.1s)

$ npm run build
✓ built in 4.73s
```

## 11. AGENTS.md update confirmation

Concise corrections applied:
- Added `descendantCameraResolver.ts` to key files with description
- Corrected CameraFrustumHelper entry: imports resolver, `userData` brand check, no fallback
- Corrected Camera Frustum Helper section: `findAllDescendantCameras()` import, `child.userData[HELPER_BRAND]` counting, no component-state fallback
- Updated test diagnostic fields: added `sceneUuid`, clarified independent scene inspection
- Updated Stub diagnostics: added `sparkControlsDisposals`, `__stub_scene_uuid`, `__stub_app_camera_uuid`, registration/disposal hooks
