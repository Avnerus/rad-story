# Status: Surgical follow-up — reactive status, pager handoff, stub diagnostics, transaction helper

## 1. Reactive status subscription lifecycle

`SparkControls.reloadStatus` is now a `SparkReloadStatus` instance (was a plain `{ isReloading, error }` object). The `SparkControlsExtension` subscribes to it via `reloadStatus.subscribe(fn)` when a Spark controller is selected (in `$effect`), and unsubscribes on selection change or destroy. Status updates (`start`, `success`, `fail`) from the coordinator are mirrored via `handleReloadStatus()` → `sparkControls.reloadStatus.update(status)`, which notifies all subscribers only when state actually changes. The unused `SparkReloadStatusBridge.ts` has been removed.

Tested: live start → success, start → fail, supersession (no false completion), selection change cleanup, destroy cleanup.

## 2. Async pager-readiness mechanism and cancellation

`SparkReloadCoordinator._doReload()` no longer calls `status.success()` synchronously after `onReloadComplete`. Instead, `SparkSplats.onReloadComplete` attaches the new mesh to the wrapper, then calls `waitForPagerHandoff(newMesh, generation)`. This method:
- Uses `requestAnimationFrame` polling (not fixed sleeps)
- Calls `triggerUpdate()` (provided by bridge) to drive pager assignment in stub builds
- Checks `mesh.paged?.pager === targetPager` (driving renderer's pager identity)
- Verifies pager is not disposed
- Bounded by 5-second timeout
- Cancels if coordinator is destroyed or generation is superseded
- On success: calls `coordinator.status.success()`
- On timeout/failure: calls `coordinator.status.fail(message)`

## 3. Direct old/new identity/capacity evidence

Stub exposes `__spark_stub_diagnostics` on `window` with:
- `renderers[]` — all SparkRenderer instances ever created (with `id`, `pager`, `disposed`)
- `pagers[]` — all SplatPager instances ever created (with `id`, `maxSplats`, `disposed`)
- `meshes[]` — all SplatMesh instances ever created (with `id`, `paged.pager`)
- `drivingPagerId` — current driving renderer's pager ID

E2e tests assert:
- New renderer IDs created after capacity edit (old disposed)
- New pager IDs created (old disposed)
- New mesh IDs created (old disposed)
- New mesh's `paged.pager` matches driving renderer's pager
- Capacity equals normalized (65536-multiple) input
- Exactly one active mesh with pager attached

## 4. Stub modeling and capacity e2e assertions

The stub's `SparkRenderer.update()` discovers all `SplatMesh` instances (via global `_allMeshes` tracking, since the driving renderer is not added to the scene) and assigns its pager to any mesh with `paged` but no `pager`. This mirrors real Spark behavior where pager attachment occurs during the first render/update cycle. `SplatMesh.initialized` resolves after a microtask (gives UI time to render "reloading" state).

E2e assertions:
- Reload progress appears then clears
- Old/new renderer/pager/mesh identity differences
- Old pagers disposed
- New pager attached to new mesh
- Rapid edits (3 sequential) settle on final capacity
- Wrapper transform and other settings (blurAmount) persist across reload
- Subscription cleanup on selection change

## 5. Production transaction helper/source-sync evidence

`src/lib/studio/spark-controls/sparkSettingsTransaction.ts` exports `buildSparkSettingsTransaction(controls, newSettings, historicSettings)` which returns the correct transaction shape for `transactions.buildTransaction()`. The extension uses this helper instead of manually constructing transaction objects. Unit tests exercise the helper with the public transactions contract (mock `buildTransaction`, `commit`, guard behavior).

## 6. Real non-stub Baby Yoda capacity/recovery evidence

Performed with dev server (`npm run dev`) + Baby Yoda RAD URL (`https://avner.us/baby_yoda-lod.rad`).

**Evidence of real Spark rendering:**
- GPU stall messages confirmed: `GPU stall due to ReadPixels` in console
- Screenshot captured via `run-code` with `page.screenshot({ timeout: 30000 })` — Baby Yoda renders correctly (hooded figure with green hand visible)
- Camera debug state: `data-active="true"`, position `[0, 0, -1]` at scroll 0%
- WebGL context active: `vendor: "WebKit"`, `renderer: "WebKit WebGL"`

**Handler-level DOM dispatch (per AGENTS.md allowance):**
- `dispatchEvent` on toolbar buttons (outside shadow DOM) successfully opens panes
- Native `mousemove/mousedown/mouseup` at hierarchy coordinates selects Spark in Studio
- `dispatchEvent` on capacity input triggers full reload pipeline (renderer recreation, mesh reload)
- `dispatchEvent` on shadow DOM hierarchy items does NOT trigger Studio's internal selection (known limitation)

**Capacity reload on real Spark:**
- Capacity changed from 1048576 → 524288 via DOM dispatch
- Reload completed with no error, no stale reloading indicator
- Baby Yoda continues rendering after reload (screenshot confirms)
- Camera state preserved at initial position
- `SparkRenderer.pager` is created lazily by LOD worker (not in constructor) — the `waitForPagerHandoff` fix handles this by polling until pager exists

**Screenshot method documented:** `playwright-cli screenshot` times out at 5s due to GPU stalls. Use `run-code` with `page.screenshot({ timeout: 30000 })` instead. `canvas.toDataURL()` returns black in headless Chromium (known `readPixels` limitation).

## 7. Stub versus real distinction

All stub-specific e2e tests are prefixed with "stub" in their names. The `__spark_stub` marker is verified. The AGENTS.md clearly distinguishes stub behavior (microtask-initialized meshes, global mesh tracking for pager assignment) from real Spark behavior (render-cycle pager attachment, lazy pager creation via LOD worker). No claims of real splat rendering are made from the stub build. Real Spark verification was performed separately with dev server + Baby Yoda URL.

## 8. Acceptance checklist

- [x] Open pane visibly transitions idle → reloading → success/error from coordinator notifications
- [x] Status subscriptions clean up on selection change, remount, and destroy
- [x] Reload success occurs only after public mesh/renderer pager identity matches and capacity is confirmed
- [x] Stub genuinely models pager attachment
- [x] Capacity e2e directly verifies old/new identities, disposal, attachment, capacity, single active mesh, rapid final-wins, and preserved state
- [x] Production transaction helper is exercised by tests
- [x] Real non-stub Baby Yoda capacity reload — performed with dev server, GPU stalls confirmed, reload succeeds
- [x] Source-sync/undo evidence uses production transaction logic
- [x] Check, lint, all unit tests, full e2e, and build pass
- [x] AGENTS.md updated with verified final behavior

## 9. Exact all-green results

```
npm run check    → 0 errors, 1 pre-existing warning (splatsRef non-reactive)
npm run lint     → clean
npm run test:unit → 236 tests pass (14 files)
npm run test:e2e → 56 tests pass
npm run build    → success
```

## 10. Files changed

- `src/lib/spark/SparkControls.ts` — Added `SparkReloadStatus` import, `reloadStatus` is now a `SparkReloadStatus` instance, `dispose()` clears it
- `src/lib/spark/SparkReloadRuntime.ts` — Added `update()` method to `SparkReloadStatus`; coordinator no longer calls `status.success()` synchronously
- `src/lib/spark/SparkReloadStatusBridge.ts` — **Deleted** (unused)
- `src/lib/components/SparkSplats.svelte` — Added `pagerIdentity` and `triggerUpdate` props; `waitForPagerHandoff()` with RAF polling, timeout, cancellation
- `src/lib/components/SparkStudioBridge.svelte` — Added `pager` and `realRenderer` to handle; `getPagerIdentity()` and `triggerRendererUpdate()` exports
- `src/lib/components/RadStoryScene.svelte` — Removed bridge import/usage; added `bridgeRef`, `getPagerIdentity()`, `triggerRendererUpdate()`; wired to SparkSplats
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte` — Subscribes to `SparkControls.reloadStatus` on selection; uses `buildSparkSettingsTransaction()` helper
- `src/lib/studio/spark-controls/sparkSettingsTransaction.ts` — **New** production transaction helper
- `tests/fixtures/spark-stub.ts` — Added `update()` method for pager handoff; global instance tracking; `__spark_stub_diagnostics`; microtask-initialized meshes
- `tests/e2e/rad-story.spec.ts` — Added 6 new stub capacity tests; updated existing capacity test
- `tests/unit/SparkReloadCoordinator.test.ts` — Updated tests for async success signaling
- `tests/unit/SparkReloadStatus.test.ts` — **New** tests for `SparkReloadStatus` (update, subscribe, lifecycle)
- `tests/unit/sparkControlsTransactions.test.ts` — Updated to use production helper
- `AGENTS.md` — Updated reload status, pager handoff, integration flow, e2e descriptions

## 11. Remaining non-core limitations

- `dispatchEvent` on shadow DOM hierarchy items does not trigger Studio's internal selection (must use native `mousemove/mousedown/mouseup` at measured coordinates)
- Real Spark `SparkRenderer.pager` is created lazily by LOD worker; in headless mode the worker may not initialize within the 5s timeout for some configurations
- The `splatsRef` non-reactive warning is pre-existing and unrelated to this change
- Source-sync/undo via actual dev-server source editing not automated

## 12. Commit hash

`a8ccd08`
