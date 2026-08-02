# Mission: unify Spark configuration, scope source sync, and rename the dynamic URL query parameter

## Objective

Make the profile `BASELINE` structures in `src/lib/spark/deviceProfile.ts` the
only global source of Spark renderer settings, while preserving file-backed
scene overrides as the only additional persisted layer.

At the same time:

1. Spark settings edited for the ad-hoc/dynamic URL viewer must remain live for
   that mounted session but must never source-sync into a Svelte file or alter a
   global baseline.
2. File-backed edit routes such as `/scene/baby_yoda/edit` must retain their
   current `profileSettings` source-sync and undo/redo behavior.
3. Rename the landing/ad-hoc query parameter from `url` to `splat_url` to avoid
   conflicting with Vite's external-source protection.

## Current-state findings

- `DESKTOP_BASELINE` and `MOBILE_BASELINE` already define complete 22-field
  effective Spark settings through `buildBaseline()` and
  `getGlobalBaseline()`.
- `getDeviceProfile()` separately repeats eight Spark settings under
  `profile.sparkRenderer`; this is the configuration redundancy to remove.
- `SparkStudioBridge.svelte` currently initializes both renderers from
  `profile.sparkRenderer`, then calls `applySettings(initial, initial)`, which
  is a no-op because the old and new snapshots are equal. Consequently the
  initial renderer does not reliably derive all 22 fields, including
  file-backed scene overrides, from the authoritative `SparkControls` state.
- `RadStoryScene.svelte` is the reusable ad-hoc URL scene. It declares
  `<T is={sparkControls} name="Spark" />` without a scene-local
  `profileSettings` literal. Allowing source sync here could modify the generic
  component and turn a session edit into an unintended global behavior.
- `SceneRuntime.svelte` registers the controller through
  `activeSparkControlsRuntime`; this is the natural place to carry explicit
  persistence metadata to `SparkControlsExtension`.
- `App.svelte` reads and writes the query parameter named `url`. Relevant e2e
  coverage and README text still use that name.

## Files likely involved

Primary production files:

- `src/lib/spark/deviceProfile.ts`
- `src/lib/types.ts`
- `src/lib/scenes/sceneObjects.ts`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/SceneRuntime.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/scenes/baby_yoda.svelte` (and any other registered scene files)
- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `src/lib/studio/scroll-animator/transactionGuard.ts`
- `src/App.svelte`

Documentation and tests likely involved:

- `README.md`
- `PERFORMANCE.md` (remove/update the configuration-redundancy caveat after it
  is genuinely resolved)
- `AGENTS.md`
- `tests/unit/deviceProfile.test.ts`
- `tests/unit/profileResolution.test.ts`
- `tests/unit/sceneObjects.test.ts`
- `tests/unit/activeSparkControlsRuntime.test.ts`
- `tests/unit/transactionGuard.test.ts` and/or
  `tests/unit/profileTransactionGuard.test.ts`
- focused Spark bridge/renderer tests under `tests/unit/`
- `tests/e2e/rad-story.spec.ts`
- `tests/e2e/scene-routing.spec.ts`
- source-sync e2e tests under `tests/e2e/`

Use repository search to find any other `profile.sparkRenderer`, `?url=`,
`searchParams.get('url')`, or `searchParams.set('url')` references, but do not
perform unrelated cleanup.

## Required design and constraints

### 1. One global Spark-settings source

- `DESKTOP_BASELINE` and `MOBILE_BASELINE`, accessed through the existing
  baseline APIs, must be the only global literals for the 22 Spark settings.
- Delete the duplicated `sparkRenderer` settings object from
  `getDeviceProfile()` and from the local `DeviceProfile` type. Remove the
  now-unused custom `SparkRendererOptions` type if it has no remaining purpose.
- `getDeviceProfile()` may continue to own device detection and Canvas DPR.
  Keep `profileName`; retain `isMobile` only if production code genuinely uses
  it (tests alone are not a reason to keep redundant state).
- Simplify `createSceneObjects()` so it consumes the profile name and optional
  scene `ProfileSettings`, not an otherwise-unused full `DeviceProfile` plus a
  duplicate profile-name argument.
- The active `SparkControls.settings` snapshot is the authoritative complete
  effective runtime snapshot: active profile baseline plus the active
  file-backed scene overrides. Use it to initialize both SparkRenderer
  instances before their first meaningful render/update.
- Ensure all applicable live fields are initialized, including correct mapping
  of `lodSplatCount: null` to Spark's automatic/`undefined` form.
  `maxPagedSplats` must be supplied at renderer/pager construction time.
- Infrastructure-only options such as `renderer`, `onDirty`,
  `pagedExtSplats`, and dual-renderer `enableDriveLod` roles are not profile
  settings and may remain explicit app configuration.
- Avoid a second manual list of baseline values. A small, centralized mapping
  helper from a complete `SparkSettings` snapshot to Spark constructor/live
  options is acceptable when needed for type/null conversion.
- Preserve complete-current-settings behavior when `maxPagedSplats` causes
  renderer recreation and mesh reload.

Critical invariant:

```text
effective renderer settings
  = BASELINE[active profile]
  + file-backed scene's persisted active-profile overrides
```

For the ad-hoc viewer, the override layer begins empty and live pane edits are
session-only.

### 2. Explicit source-sync capability per mounted controller

- Do not infer persistence from URL shape, route strings, Vite availability,
  Threlte private metadata, or whether a `<T>` happens to contain an attribute.
- Add an explicit, typed capability to the active Spark controller
  registration (for example `sourceSyncEnabled` or
  `persistProfileSettings`). Keep attach/detach identity and stale-registration
  safety intact.
- `RadStoryScene` must explicitly register its Spark settings as
  non-persistable/session-only.
- File-backed scene edit mode must register as persistable. Prefer a safe
  default plus explicit call-site intent where ambiguity could cause a generic
  component to be modified.
- The Spark Controls pane must still apply every valid dynamic-viewer edit live,
  including coupled invariants, renderer propagation, capacity recreation, and
  reload status. It must not build or commit a source-syncing transaction in
  the non-persistable mode.
- Make the UI accurately explain that ad-hoc settings are session-only. Keep the
  existing Vite-plugin-unavailable warning behavior distinct if both states can
  occur.
- Add defense in depth at the transaction guard: a `profileSettings`
  transaction targeting the active non-persistable SparkControls must have its
  `sync` cleared even if it originates outside the pane (for example Inspector
  or a future extension). File-backed controllers must retain the existing
  exact-root `profileSettings` whitelist. Transforms, individual settings, and
  nested `profileSettings.*` paths remain blocked everywhere.
- Use public Threlte Studio APIs only. Do not import private source-sync or
  transaction metadata.

The important behavior is not merely hiding a persistence button: after a
dynamic-viewer Spark edit, neither `RadStoryScene.svelte` nor
`deviceProfile.ts` may be modified by Studio source sync.

### 3. Query parameter rename

- Read the ad-hoc initial value from `splat_url`.
- On Start, write `splat_url=<validated RAD URL>`.
- Stop reading and writing the legacy parameter named `url`. When updating the
  current URL, delete an existing `url` parameter so the Vite-conflicting name
  cannot remain alongside `splat_url`.
- Preserve unrelated parameters such as `debug`.
- Update tests and documentation from `?url=` to `?splat_url=`.
- Do not rename component props/local variables whose ordinary name `url` does
  not participate in the query string; this mission concerns the public query
  parameter only.

## Acceptance criteria

- [ ] `DESKTOP_BASELINE` and `MOBILE_BASELINE` are the only global source of all
      22 Spark setting values.
- [ ] `DeviceProfile`/`getDeviceProfile()` no longer contains a duplicated
      `sparkRenderer` settings object.
- [ ] Both initial SparkRenderer instances receive the complete effective
      `sparkControls.settings` snapshot, including active file-scene overrides,
      before first use.
- [ ] Changing `maxPagedSplats` still recreates both renderers with the complete
      current snapshot and reloads the mesh safely.
- [ ] Ad-hoc dynamic URL Spark edits apply live but cannot source-sync any Spark
      setting or `profileSettings` attribute into source.
- [ ] The transaction guard also blocks externally-originated Spark source sync
      for the non-persistable controller.
- [ ] File-backed `/scene/{name}/edit` Spark edits still source-sync the exact
      root `profileSettings` object, preserve the inactive profile, and retain
      undo/redo.
- [ ] Existing ScrollAnimator source-sync policy is unchanged.
- [ ] `?splat_url=<encoded RAD URL>` pre-fills the landing input and Start writes
      `splat_url` while preserving unrelated query parameters.
- [ ] The app neither reads nor writes the legacy `url` query parameter, and
      Start removes it if present.
- [ ] README, PERFORMANCE.md, and AGENTS.md describe the new authoritative
      configuration and dynamic/file-backed persistence distinction accurately.
- [ ] New and updated tests cover baseline-only initialization, initial scene
      override application, dynamic source-sync blocking, file-scene source
      sync preservation, runtime registration metadata/lifecycle, and the
      `splat_url` rename.
- [ ] `npm run check`, `npm run lint`, `npm run test:unit`,
      `npm run test:e2e`, and `npm run build` pass.

Before finalizing, re-check every acceptance item explicitly. Do not infer that
passing tests alone proves the source-sync boundary is correct.

## Tests to add or update

At minimum:

1. Device profile/baseline unit tests:
   - complete desktop/mobile baselines still have all 22 fields;
   - pulled values (`maxStdDev: 2.8`, desktop pager capacity
     `32 * 65,536`, mobile capacity `16 * 65,536`) are authoritative;
   - `getDeviceProfile()` returns detection/DPR metadata without Spark-setting
     duplicates.
2. Renderer initialization unit tests:
   - initial renderer construction receives all effective baseline settings;
   - an active-profile scene override is present on both real/editor renderers
     immediately, not only after a later edit;
   - `lodSplatCount: null` maps to automatic behavior;
   - recreation preserves every non-capacity setting.
3. Active-controller runtime tests:
   - persistence capability is exposed/reactive with the active controller;
   - replacement and stale detach cannot restore/clear the wrong capability.
4. Transaction guard/pane tests:
   - dynamic non-persistable `profileSettings` sync is stripped;
   - file-backed exact-root `profileSettings` sync remains allowed;
   - nested paths and all other Spark attributes remain blocked;
   - dynamic edits still update the controller and renderer live.
5. E2E source-sync regression:
   - in the ad-hoc viewer, edit a Spark field with source sync available and
     prove no source file is rewritten/targeted;
   - in `/scene/baby_yoda/edit`, retain the existing persisted
     `profileSettings` behavior.
6. Query tests:
   - `?splat_url=` pre-fills correctly;
   - `?url=` is ignored;
   - Start writes `splat_url`, removes `url`, preserves `debug`, and survives a
     reload.

Create new focused tests where existing suites do not make these invariants
clear. Update stale fixtures/types rather than weakening type coverage.

## Things Pi must not change

- Do not alter the actual values in the newly updated desktop/mobile baselines
  unless a failing test reveals a transcription error. The pulled values are
  intentional.
- Do not change RAD asset URLs, camera keyframes, camera-target behavior,
  routing grammar, playback-vs-edit Studio hosting, or the dual-renderer
  architecture.
- Do not disable the entire Spark Controls pane in the ad-hoc viewer; settings
  must remain live and useful for the session.
- Do not disable file-backed `profileSettings` source sync.
- Do not persist ad-hoc settings to local storage, the query string, a generic
  component, or the global baselines as a substitute for source sync.
- Do not introduce backward compatibility that continues reading/writing the
  legacy `url` query parameter; the purpose is to remove that conflict.
- Do not modify generated dependencies or files under `node_modules`.
- Do not perform unrelated formatting, refactors, dependency upgrades, or
  performance-setting changes.

## AGENTS.md update

Update `AGENTS.md` with concise current-state information and source references
for a fresh session. It should explain:

- baselines are the sole global Spark settings source;
- renderers initialize from the active `SparkControls.settings` effective
  snapshot;
- file-backed scenes persist `profileSettings`, while the ad-hoc dynamic URL
  scene is explicitly session-only and guarded from source sync;
- the public ad-hoc query parameter is `splat_url`.

Do not add a full implementation log.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary of the implemented design.
2. Changed files grouped by configuration, source-sync policy, query rename,
   tests, and documentation.
3. Exact explanation of initial renderer settings flow.
4. Exact explanation of how dynamic and file-backed source sync are
   distinguished and defended.
5. Tests added/updated and the full commands/results.
6. Acceptance-criteria checklist, item by item.
7. Any residual risks or follow-up recommendations.
8. Final commit hash and pushed branch.

Always write `status.md` as the last action before the final commit/push. Before
writing it, finish all implementation, tests, documentation, and the explicit
acceptance-criteria re-check. After pushing, perform no more verifications or
modifications; the pushed status must describe the exact final state.
