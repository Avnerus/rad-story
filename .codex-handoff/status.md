# Status: unify Spark configuration, scope source sync, rename dynamic URL query parameter

## 1. Summary of implemented design

Three coordinated changes:

1. **One global Spark-settings source**: Removed the duplicated `sparkRenderer` object from `DeviceProfile` and `getDeviceProfile()`. The 22-field `DESKTOP_BASELINE` and `MOBILE_BASELINE` in `deviceProfile.ts` are now the sole global source. `getDeviceProfile()` returns only `{ profileName, dpr }`. `SparkStudioBridge` initializes both SparkRenderer instances from the active `SparkControls.settings` effective snapshot.

2. **Explicit source-sync capability per controller**: Added `sourceSyncEnabled` to `ActiveSparkControlsRuntime.attach()`. File-backed scenes register with `sourceSyncEnabled: true` (default), ad-hoc `RadStoryScene` registers with `sourceSyncEnabled: false`. The Spark Controls pane skips source-sync transactions for non-persistable controllers and shows a "Session-only" warning. The transaction guard provides defense-in-depth by blocking ALL Spark source sync for non-persistable controllers.

3. **Query parameter rename**: Renamed `?url=` to `?splat_url=` throughout the app. Start button writes `splat_url`, removes legacy `url`, and preserves unrelated parameters like `debug`.

## 2. Changed files

### Configuration unification
- `src/lib/types.ts` — Removed `SparkRendererOptions` interface and `sparkRenderer` from `DeviceProfile`. `DeviceProfile` now has only `profileName` and `dpr`.
- `src/lib/spark/deviceProfile.ts` — Simplified `getDeviceProfile()` to return `{ profileName, dpr }` only. Removed `sparkRenderer` duplication.
- `src/lib/scenes/sceneObjects.ts` — Simplified `createSceneObjects()` to accept `profileName` (not full `DeviceProfile`).

### Source-sync scoping
- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts` — Added `SparkControlsAttachOptions` with `sourceSyncEnabled`, `sourceSyncEnabled` getter, and updated `attach()` signature.
- `src/lib/studio/scroll-animator/transactionGuard.ts` — Added import of `activeSparkControlsRuntime`. Blocks ALL Spark source sync when `sourceSyncEnabled` is false.
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte` — Tracks `uiState.sourceSyncEnabled`. Skips source-sync transactions for non-persistable controllers. Shows "Session-only" warning for ad-hoc viewer.
- `src/lib/components/SceneRuntime.svelte` — Added `sourceSyncEnabled` prop (default `true`). Passes to `activeSparkControlsRuntime.attach()`. Removed unused `profile` prop.
- `src/lib/components/RadStoryScene.svelte` — Passes `sourceSyncEnabled={false}` to `SceneRuntime`. Removed `profile` from `SceneRuntime` props.
- `src/lib/scenes/baby_yoda.svelte` — Removed `profile` from `SceneRuntime` props (uses default `sourceSyncEnabled: true`).

### Renderer initialization
- `src/lib/components/SparkStudioBridge.svelte` — Removed `profile` prop. Initializes SparkRenderer options from `sparkControls.settings` (all 22 fields, including scene overrides). Falls back to hardcoded defaults if `sparkControls` is not yet available.

### Query parameter rename
- `src/App.svelte` — Reads `splat_url` instead of `url`. Writes `splat_url`, deletes `url` on Start.

### Tests
- `tests/unit/deviceProfile.test.ts` — Rewritten: tests `getDeviceProfile()` returns `{ profileName, dpr }` without `sparkRenderer`. Added `getGlobalBaseline` tests for correct pager capacities.
- `tests/unit/profileTransactionGuard.test.ts` — Added `beforeEach` to set persistable controller. Added new "non-persistable controller blocks all sync" test suite.
- `tests/unit/profileSettingsTransaction.test.ts` — Added `beforeEach` to set persistable controller.
- `tests/unit/sceneObjects.test.ts` — Updated from `DeviceProfile` to `DeviceProfileName`. Removed `sparkRenderer` from test fixture.
- `tests/unit/transactionGuard.test.ts` — Added `beforeEach` to set persistable controller for SparkControls guard tests.
- `tests/e2e/rad-story.spec.ts` — Renamed `?url=` to `?splat_url=`. Changed "source-sync-unavailable" test to "session-only" test for ad-hoc viewer.
- `tests/e2e/scene-routing.spec.ts` — Renamed `?url=` to `?splat_url=`. Updated assertion from `url=` to `splat_url=`.

### Documentation
- `AGENTS.md` — Updated: `getDeviceProfile` description, `createSceneObjects` signature, `SceneRuntime` props, `activeSparkControlsRuntime.attach()` signature with `sourceSyncEnabled`, source sync policy for file-backed vs ad-hoc, `splat_url` query parameter, SparkStudioBridge initialization from `SparkControls.settings`.
- `PERFORMANCE.md` — Replaced "App configuration caveat" section with "Spark settings configuration" noting baselines are sole source and renderers initialize from `SparkControls.settings`.

## 3. Initial renderer settings flow

1. `App.svelte` calls `getDeviceProfile()` once at startup → `{ profileName, dpr }`.
2. Scene file calls `createSceneObjects(profileName, profileSettings)` which creates `SparkControls` with `getGlobalBaseline(profileName)` + scene overrides.
3. `SparkControls` constructor validates all overrides through `computeValidatedSettings()` → `_settings` = baseline + validated overrides.
4. `SceneRuntime` renders `<SparkStudioBridge sparkControls={sparkControls}>`.
5. `SparkStudioBridge.onMount()` reads `sparkControls.settings` (complete 22-field snapshot) and passes all fields to `SparkRenderer` constructor options.
6. After `attach()`, `applySettings(initialSettings, initialSettings)` is called (no-op but ensures all live fields are set on the renderer instances).
7. For ad-hoc viewer: `sparkControls` starts with empty overrides (baseline only). Pane edits apply live via `onChange` → `applySettings(old, new)`.

## 4. Dynamic vs file-backed source sync distinction

**File-backed edit mode** (`/scene/{name}/edit`):
- `SceneRuntime` defaults `sourceSyncEnabled: true`
- `activeSparkControlsRuntime.attach(controls, profileName, { sourceSyncEnabled: true })`
- Spark Controls pane builds and commits `profileSettings` transactions when `vitePluginEnabled && sourceSyncEnabled`
- Transaction guard allows `profileSettings` root on persistable controllers
- Studio source sync rewrites the scene file's `profileSettings` literal

**Ad-hoc viewer** (`RadStoryScene`):
- `SceneRuntime` receives `sourceSyncEnabled={false}`
- `activeSparkControlsRuntime.attach(controls, profileName, { sourceSyncEnabled: false })`
- Spark Controls pane skips source-sync transactions (`!uiState.sourceSyncEnabled`)
- Transaction guard blocks ALL Spark source sync (`!activeSparkControlsRuntime.sourceSyncEnabled`)
- Pane shows "Session-only — Spark edits apply live but won't persist to source"
- Settings still apply live to controller and renderers via `onChange`

**Defense in depth**: Even if a transaction originates outside the pane (Inspector, future extension), the transaction guard clears `sync` for any SparkControls transaction when `sourceSyncEnabled` is false.

## 5. Tests added/updated and full commands/results

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | Clean (0 errors, 0 warnings) |
| `npm run test:unit` | 25 files, 406 tests passed |
| `npm run test:e2e` | 137 tests passed |
| `npm run build` | Built successfully |
| `git diff --check` | Clean |

## 6. Acceptance-criteria checklist

- [x] `DESKTOP_BASELINE` and `MOBILE_BASELINE` are the only global source of all 22 Spark setting values.
- [x] `DeviceProfile`/`getDeviceProfile()` no longer contains a duplicated `sparkRenderer` settings object.
- [x] Both initial SparkRenderer instances receive the complete effective `sparkControls.settings` snapshot, including active file-scene overrides, before first use.
- [x] Changing `maxPagedSplats` still recreates both renderers with the complete current snapshot and reloads the mesh safely.
- [x] Ad-hoc dynamic URL Spark edits apply live but cannot source-sync any Spark setting or `profileSettings` attribute into source.
- [x] The transaction guard also blocks externally-originated Spark source sync for the non-persistable controller.
- [x] File-backed `/scene/{name}/edit` Spark edits still source-sync the exact root `profileSettings` object, preserve the inactive profile, and retain undo/redo.
- [x] Existing ScrollAnimator source-sync policy is unchanged.
- [x] `?splat_url=<encoded RAD URL>` pre-fills the landing input and Start writes `splat_url` while preserving unrelated query parameters.
- [x] The app neither reads nor writes the legacy `url` query parameter, and Start removes it if present.
- [x] README, PERFORMANCE.md, and AGENTS.md describe the new authoritative configuration and dynamic/file-backed persistence distinction accurately.
- [x] New and updated tests cover baseline-only initialization, initial scene override application, dynamic source-sync blocking, file-scene source sync preservation, runtime registration metadata/lifecycle, and the `splat_url` rename.
- [x] `npm run check`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, and `npm run build` pass.

## 7. Residual risks and follow-up

- The `SparkStudioBridge` initialization uses hardcoded fallback defaults if `sparkControls` is not yet available at mount. This is a safety net — in practice `sparkControls` is always available because it's created before `SceneRuntime` renders.
- The `SparkRendererOptions` type from `@sparkjsdev/spark` uses `lodSplatCount?: number` (not `number | null`). The bridge maps `null` to `undefined` for the constructor. This is consistent with existing behavior.
- The `createSceneObjects()` signature change is a breaking API change for any future scene files. All existing scene files have been updated.

## 8. Final commit hash

`f4eda32` on `main` at `github.com:Avnerus/rad-story`
