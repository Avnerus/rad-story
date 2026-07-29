# Mission: Studio-editable Spark quality and LOD controls

## Objective

Add one source-synced object named exactly `Spark` to the Threlte Studio hierarchy. Selecting it must expose the important Spark 2.1 rendering-quality and LOD controls in Studio, and edits must affect the active splat rendering in real time.

At the same time, investigate and document why RAD content outside the app/default camera frustum can still be refined or fetched. Prove whether this is Spark 2.1's intended angular foveation behavior or a camera-routing defect in this app's dual-`SparkRenderer` setup, and fix an app bug if evidence establishes one.

The user specifically wants the angle-related refinement controls exposed. In installed Spark 2.1 these are `coneFov0` and `coneFov`, with `coneFoveate` and `behindFoveate` controlling the retained detail. Do not invent a nonexistent `outsideFoveate` property.

## Important findings to verify before implementation

Use the installed `@sparkjsdev/spark` 2.1.0 declarations and implementation as the authority:

- `node_modules/@sparkjsdev/spark/dist/types/SparkRenderer.d.ts`
- the corresponding implementation/source map under `node_modules/@sparkjsdev/spark/dist/`
- official Spark 2.1 docs if clarification is needed

Current evidence:

- `SparkRenderer.frustumCulled` is set to `false`.
- LOD traversal includes visible `SplatMesh` generators and supplies view-to-object transforms plus `lodScale`, `coneFov0`, `coneFov`, `coneFoveate`, and `behindFoveate` to the LOD worker. It is not a strict “inside camera frustum only” traversal.
- Spark 2.1 uses a full-width angular foveation cone. `coneFov0` is the full-detail angle in degrees; `coneFov` is the reduced-detail cone angle in degrees; detail interpolates toward `behindFoveate` out to 180 degrees.
- Nonzero `coneFoveate`/`behindFoveate` intentionally retains coarser LOD outside the central cone and behind the viewer. This can cause out-of-frustum RAD pages to remain selected/refined.
- `clipXY` is a shader draw-clipping multiplier for splat centers (`1` is the exact rectangular X/Y frustum, default `1.4`). It is not documented or implemented as an LOD paging/refinement cutoff, so changing it alone must not be presented as preventing out-of-frustum refinement.
- `driveLod()` derives its view from the camera passed to the renderer update and `current.viewToWorld`. The app intends only the real/default-camera renderer (`enableDriveLod: true`) to drive LOD; the editor renderer shares its `lodInstances`.
- The current device profiles pass `coneFov0: 0.2`/`0.3` and `coneFov: 1`/`0.7`, but Spark 2.1 interprets these as **degrees**, not normalized scalar factors. Determine whether these values are an accidental carry-over from an older API. Replace them with justified degree-based defaults if so, preserving separate mobile/desktop tuning only where useful.
- Changing public renderer fields is possible at runtime, but Spark does not automatically mark every LOD/foveation field change as dirty. Parameter application must explicitly trigger the correct LOD regeneration/render invalidation.
- Allocation/construction fields such as `maxPagedSplats`, `numLodFetchers`, and `pagedExtSplats` are consumed when the pager/renderers are created and are not automatically live-reconfigurable after paging starts. Do not imply they are real-time controls unless a safe, tested recreation path is implemented.

## Files likely involved

- `src/lib/components/RadStoryScene.svelte`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/spark/createSparkStudioRenderer.ts`
- a new small `Object3D` controller/model under `src/lib/spark/` (suggested name `SparkControls.ts`)
- `src/lib/types.ts`
- `src/lib/spark/deviceProfile.ts`
- `tests/unit/createSparkStudioRenderer.test.ts`
- `tests/unit/deviceProfile.test.ts`
- new unit tests for the controller/apply logic
- `tests/e2e/rad-story.spec.ts`
- `AGENTS.md`

Keep the exact file set as small as the clean design permits.

## Required design

### Studio object

- Add exactly one literal Threlte `<T>` node to the scene hierarchy with `name="Spark"`, backed by an owned custom `Object3D`-compatible controller/proxy. It must appear as `Spark` in the Studio outline and be selectable.
- Do not add the real LOD-driving `SparkRenderer` to the Three scene. Preserve the dual-renderer ownership and camera-routing architecture.
- Make the controller source-sync friendly so authored values persist in the Svelte source through Studio. Avoid private Studio imports.
- Prevent meaningless transform authoring if Studio exposes transform fields for this controller. Use the narrowest public transaction guard or other established project pattern necessary, without weakening the existing `ScrollAnimator` guard.
- Initialize the controller from the selected device profile, while keeping literal/source-synced props clear enough for Studio authoring. Avoid two competing sources of truth.

### Controls to expose and apply live

At minimum expose these important, runtime-safe controls with appropriate names, types, finite-value validation, ranges, and invariants:

- General/render quality: `maxStdDev`, `minPixelRadius`, `maxPixelRadius`, `minAlpha`, `preBlurAmount`, `blurAmount`, `falloff`, `clipXY`, `focalAdjustment`, `sortRadial`, `minSortIntervalMs`
- LOD: `enableLod`, `enableLodFetching`, `lodSplatCount` (use a clear numeric convention if “automatic/default” must be represented), `lodSplatScale`, `lodRenderScale`, `lodInflate`
- Angular refinement/foveation: `coneFov0`, `coneFov`, `coneFoveate`, `behindFoveate`

Required angular semantics:

- Label/document `coneFov0` and `coneFov` as full-width angles in **degrees**.
- Enforce or normalize a coherent relationship such as `0 <= coneFov0 <= coneFov <= 360` based on the installed Spark implementation's accepted domain; confirm whether 180 or 360 is the correct practical maximum before choosing.
- `coneFoveate` and `behindFoveate` must use safe nonnegative ranges consistent with Spark's worker implementation.
- Explain in AGENTS.md and the completion report that these controls bias refinement beyond the view direction; Spark 2.1 has no independent public “outside-frustum cutoff angle.”
- Include `clipXY` because it is useful for experimenting with visible frustum-edge clipping, but clearly distinguish it from LOD selection/fetching.

For every edit:

- Propagate the setting consistently to both renderer instances where applicable so editor-camera rendering and default-camera rendering do not visually diverge.
- Preserve `editorRenderer.enableDriveLod === false` and `realRenderer.enableDriveLod === true`; the controller must never allow Studio to break this invariant.
- Mark renderer/sort/LOD state dirty as required. In particular, foveation changes must force a fresh LOD traversal even when the camera did not move. Call `onDirty`/Threlte invalidation through the established ownership path.
- Avoid reconstructing renderers or the pager for ordinary live fields.

If you include creation-only/allocation fields (`maxPagedSplats`, `numLodFetchers`, `pagedExtSplats`, accumulator encoding flags), either implement and test a safe lifecycle reset/recreation with the loaded `SplatMesh` preserved, or present them as non-editable/documented exclusions. Do not silently mutate ineffective fields.

### Controller-to-renderer bridge

- Extend `createSparkStudioRenderer` with a small, testable public method/subscription mechanism for applying a validated settings snapshot or individual change.
- Applying settings before `attach`, after `attach`, and during repeated idempotent disposal must be safe.
- Do not leak renderer objects into unrelated Svelte components.
- Do not use a per-frame polling loop. Changes should propagate reactively/event-driven.
- Avoid unnecessary allocations during normal rendering.

## Frustum and camera-routing investigation

Perform an evidence-based investigation, not only a visual guess:

1. Trace the installed Spark 2.1 LOD worker inputs and confirm how cone foveation treats regions inside the cone, outside the perspective frustum, and behind the viewer.
2. Confirm `clipXY` affects shader draw clipping only and does not remove pages/chunks from LOD traversal.
3. Instrument or test the dual renderer callback enough to prove which exact camera object, world position, world quaternion/direction, FOV, aspect, and projection matrix reach the `enableDriveLod` renderer when:
   - Studio Editor Camera is off and the app/default `PerspectiveCamera` is active.
   - Studio Editor Camera is on.
   - The camera is toggled back off.
4. Verify that editor-camera rendering never changes the real renderer's LOD viewpoint or drives its pager, and that the existing `sparkOverride` is restored even on errors.
5. Reproduce the reported behavior with the lightweight RAD if feasible. Compare the loaded/refined LOD state while rotating/moving content outside the default camera view and while changing `coneFov0`, `coneFov`, `coneFoveate`, and `behindFoveate`.
6. Determine whether the observation is:
   - expected Spark angular foveation/prefetch behavior,
   - caused by the suspicious current degree values,
   - caused by update latency/background fetches,
   - or an actual app camera-routing/matrix bug.
7. Fix only a proven app bug. Do not patch `node_modules` or fork Spark. If strict frustum-only refinement is impossible through Spark 2.1's public API, state that clearly and recommend the closest achievable settings (for example very low/zero outer/behind foveation, if confirmed safe).

Add temporary diagnostics only if needed and remove them before finalizing unless they are small, useful, and explicitly tested.

## Constraints

- Use installed `@sparkjsdev/spark` 2.1.0 API semantics; no `any`-based guesses and no private Spark internals in production code.
- Use only public Threlte Studio APIs.
- Preserve the dual `SparkRenderer` architecture and existing `sparkOverride` `try/finally` behavior.
- Preserve RAD paging (`paged: true`), `pagedExtSplats: true`, real-camera-driven LOD, editor-camera shared LOD, `renderMode="always"`, and current SplatMesh lifecycle.
- Preserve mobile/desktop defaults unless correcting the degree-unit issue with documented evidence.
- Do not add a custom Studio extension/pane unless the normal Studio Inspector genuinely cannot provide usable controls; prefer the requested outline object plus Inspector.
- Do not change camera scroll animation, ScrollAnimator behavior, landing/viewer state, or unrelated styling.
- Do not modify generated dependency files or anything under `node_modules`.
- Do not include the user's unrelated `package-lock.json` working-tree change in your commits unless you establish it is required for this feature and explicitly explain why in the report.

## Acceptance criteria

- The Studio outline contains exactly one selectable object named `Spark`.
- Selecting `Spark` exposes the listed quality and LOD parameters with usable editing behavior.
- `coneFov0`, `coneFov`, `coneFoveate`, and `behindFoveate` are present and affect refinement live; angle fields are clearly degrees.
- A value edit is reflected by the relevant real and editor renderer fields without remounting the viewer or moving the camera.
- Foveation edits force LOD recomputation; rendering invalidates appropriately.
- Source sync persists supported authored control values.
- Invalid/NaN/infinite/out-of-range input cannot corrupt renderer state; angle relationships remain coherent.
- The fixed dual-renderer invariants cannot be edited away: only the real/default-camera renderer drives LOD/paging.
- Tests prove that Editor Camera on/off does not take ownership of default-camera LOD selection and that the camera handed to the driving renderer is correct.
- The frustum investigation has a specific conclusion backed by installed-source references and runtime/test evidence.
- `clipXY` is not mislabeled as an LOD refinement cutoff.
- Creation-only parameters are either safely recreated and tested or deliberately excluded/documented.
- Existing behavior and existing tests remain green.
- `AGENTS.md` is updated with concise, current architecture/features and relevant source references for a fresh agent session; do not turn it into a full implementation log.

Before finalizing, re-check every acceptance criterion above and explicitly account for each one in the status report.

## Tests to create and run

Create tests for this new feature, not only implementation:

- Unit tests for the new controller's defaults, branding/type/name, validation, finite-value handling, angle normalization/invariants, change notifications, and idempotent disposal/unsubscription.
- Unit tests for applying every supported setting before/after renderer creation and to both renderers.
- Unit tests proving foveation changes set `lodDirty`/trigger recomputation and render invalidation without camera movement.
- Unit tests proving `enableDriveLod` remains false/true for editor/real renderers even when controller settings are applied.
- Unit tests for correct camera routing through default → editor → default transitions, including error restoration.
- Update device-profile tests for justified degree-based cone defaults.
- E2E coverage that `Spark` appears exactly once in the outline, can be selected, exposes representative general/LOD/angular fields, and source-sync/live behavior works in the Spark stub environment.
- If stable, add a focused regression demonstrating the default camera remains the LOD driver while Editor Camera is active.

Run:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Also perform a concise manual check with `https://avner.us/baby_yoda-lod.rad` if the environment permits, specifically exercising angle/foveation changes without moving the camera.

## Things you must not change

- Do not replace or collapse the two Spark renderers.
- Do not let the Studio editor camera drive LOD fetching.
- Do not add the real-camera renderer to the scene.
- Do not alter ScrollTrigger scrub semantics or ScrollAnimator playback/source-sync behavior.
- Do not expose `enableDriveLod`, renderer ownership, raw renderer/worker/pager objects, or unsafe allocation internals as editable Studio fields.
- Do not claim strict frustum-only paging unless it is actually proven.
- Do not patch dependency source, update dependencies, or commit unrelated user changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary of implementation
2. Files changed
3. Studio controls added, including defaults/ranges/units and whether each is live or creation-only
4. Frustum/LOD investigation:
   - installed Spark source locations examined
   - exact LOD/foveation behavior found
   - exact camera-routing evidence
   - whether a bug was found and what was fixed
   - closest settings for minimizing out-of-frustum refinement
5. Acceptance criteria checklist (every item explicitly checked)
6. Tests created
7. Tests run and results
8. Manual verification performed and observations
9. Remaining limitations or follow-ups
10. Commit hash(es)

Always write `status.md` as the **last action before committing and pushing**. Re-check that every acceptance criterion is met before writing it. After the final push, do not run more verifications, inspect files, or make further modifications.
