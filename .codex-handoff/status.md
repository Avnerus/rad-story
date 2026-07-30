# Status: Close Spark reload activation lifecycle and evidence gaps

## 1. Summary of the completion-contract fix

The `SparkReloadCoordinator.onReloadComplete` callback type changed from `(mesh, gen) => void` to `(mesh, gen) => void | Promise<void>`. The coordinator now `await`s the callback inside `_doReload`, keeping the `requestReload()` promise and `isReloading` pending through the full activation interval (mesh attachment + pager handoff). Callback rejection is caught for the current generation, reported via `status.fail()` and `onReloadError`, with no unhandled rejection. Success is centralized: only the coordinator calls `status.success()` after the awaited callback resolves, and only if the generation is still current.

## 2. Exact lifecycle and generation semantics

- `requestReload()` increments generation, calls `status.start()`, starts `_doReload`
- `_doReload` awaits `createMesh()`, checks generation, then `await`s `onReloadComplete(mesh, gen)`
- While awaiting, `_pendingPromise` is non-null → `isReloading` is true
- If `onReloadComplete` resolves and generation is still current → `status.success()`
- If `onReloadComplete` rejects and generation is still current → `status.fail(message)`, `onReloadError`
- If generation changed (superseded) → callback result is silently ignored
- If destroyed → callback result is silently ignored
- `finally`: clears `_pendingPromise` only if generation still matches
- A superseded generation cannot publish success/failure for the newest generation

## 3. Direct test evidence mapped to every acceptance criterion

| Criterion | Evidence |
|-----------|----------|
| `requestReload()` resolves only after async completion | Unit: `awaits async completion callback before resolving requestReload` |
| `isReloading` remains true through full interval | Unit: `keeps isReloading true through async activation` |
| Async completion rejection caught, status fails once | Unit: `catches async completion rejection and fails current generation` |
| Superseded async activation cannot publish stale state | Unit: `superseded async activation cannot publish stale terminal state` |
| Destroy during async activation cancels cleanly | Unit: `destroy during async activation cancels cleanly` |
| Pane reflects already-running reload on mid-reload selection | Extension: `subscribeToReloadStatus` initializes from current `isReloading`/`error` values immediately |
| Wrapper transform and settings persist | E2E: `stub capacity reload: wrapper transform and other settings persist` |
| Active mesh pager ID equals drivingPagerId | E2E: `stub capacity reload: progress visible then clears, pager handoff confirmed` asserts `newestMeshPagerId === drivingPagerId` |
| Driving pager has normalized capacity | E2E: same test asserts `drivingPagerMaxSplats === expectedCapacity` |
| Old pager/mesh disposed | E2E: same test asserts `disposedPagerCount > 0` |
| Exactly one current active mesh | E2E: same test asserts `activeMeshCount === 1` |
| Rapid edits settle on final capacity | E2E: `stub capacity reload: rapid edits settle on final capacity` asserts final `drivingPagerMaxSplats === 262144` and `activeMeshCount === 1` |
| Progress observed as true before clearing | E2E: `Spark pane capacity edit shows reload progress (stub)` asserts `reloadingBefore === true` then waits for clear |
| `npm run check` zero errors, no warning from Spark impl | 0 errors, 0 warnings (splatsRef/bridgeRef are now `$state(...)`) |

## 4. Changed files and why

| File | Change |
|------|--------|
| `src/lib/spark/SparkReloadRuntime.ts` | `onReloadComplete` callback accepts `void | Promise<void>`; coordinator awaits it; centralized success/fail ownership; `isReloading` stays true through full activation |
| `src/lib/components/SparkSplats.svelte` | `onReloadComplete` returns async promise (attach mesh + await pager handoff); `waitForPagerHandoff` no longer calls `status.success()` (coordinator does) |
| `src/lib/components/RadStoryScene.svelte` | `splatsRef` and `bridgeRef` are `$state(...)` — fixes Svelte reactivity warning |
| `src/lib/studio/spark-controls/SparkControlsExtension.svelte` | `subscribeToReloadStatus` initializes `uiState.reloading`/`reloadError` from current values before subscribing |
| `tests/fixtures/spark-stub.ts` | `SplatMesh` tracks `disposed` flag for e2e active-mesh assertions |
| `tests/unit/SparkReloadCoordinator.test.ts` | Added async completion tests: await keeps pending, rejection caught, supersession during async, destroy during async |
| `tests/e2e/rad-story.spec.ts` | Strengthened assertions: exact pager ID equality, disposal counts, active mesh count, progress observation, rapid edit final state |
| `AGENTS.md` | Updated async completion contract, reactive refs, pager handoff, stub e2e assertions |

## 5. Exact command results

```
npm run check    → 0 errors, 0 warnings
npm run lint     → clean
npm run test:unit → 242 tests pass (14 files)
npm run test:e2e → 56 tests pass
npm run build    → success
```

## 6. Remaining limitations

- **Stub vs real Spark**: The stub creates `SparkRenderer.pager` in the constructor. Real Spark creates it lazily via the LOD worker. The `waitForPagerHandoff` handles both by polling until `pagerIdentity()` returns a value. In headless Chromium, the LOD worker may not initialize within the 5s timeout for some configurations.
- **`dispatchEvent` on shadow DOM hierarchy items** does not trigger Studio's internal selection (must use native `mousemove/mousedown/mouseup` at measured coordinates).
- **Source-sync/undo** via actual dev-server source editing not automated.
- **Real Spark e2e**: Full automation with real Spark is impractical due to GPU stalls blocking native pointer commands and `playwright-cli screenshot`. `run-code` with `page.screenshot({ timeout: 30000 })` captures screenshots successfully.

## 7. Final commit hash

`43c3288`
