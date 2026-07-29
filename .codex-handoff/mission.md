# Mission: Studio-editable Spark quality and LOD controls

## Objective

Add exactly one source-synced object named `Spark` to the Threlte Studio outline. Selecting it must expose the important Spark 2.1 rendering-quality, LOD, foveation, and paging-budget controls, and edits must affect active splat rendering in real time.

Every numeric value currently passed from `DeviceProfile.sparkRenderer` into `SparkRenderer` is mandatory:

- `lodSplatScale`
- `lodRenderScale`
- `maxStdDev`
- `maxPagedSplats`
- `coneFov0`
- `coneFov`
- `coneFoveate`
- `behindFoveate`

Do not omit or present any of these as an ineffective/read-only field. `maxPagedSplats` is consumed when Spark creates its pager, so changing it live will require a safe controlled renderer/pager reconfiguration rather than ordinary property assignment.

Also investigate why RAD objects outside the app/default camera frustum can still be refined or fetched. Establish whether this is intended Spark 2.1 angular foveation behavior, a consequence of current values, update latency, or an app camera-routing defect. Fix only a proven app bug.

## Installed Spark findings to verify

Use the installed `@sparkjsdev/spark` 2.1.0 declarations, implementation, and source maps as the primary authority:

- `node_modules/@sparkjsdev/spark/dist/types/SparkRenderer.d.ts`
- `node_modules/@sparkjsdev/spark/dist/types/SplatMesh.d.ts`
- corresponding files under `node_modules/@sparkjsdev/spark/dist/`
- official Spark 2.1 documentation where clarification is needed

Current evidence:

- `SparkRenderer.frustumCulled` is set to `false`.
- LOD traversal includes visible LOD-capable `SplatMesh` generators and passes view-to-object transforms plus `lodScale`, `coneFov0`, `coneFov`, `coneFoveate`, and `behindFoveate` into the LOD worker. This is not strict inside-frustum-only traversal.
- `coneFov0` is the full-detail cone's full-width angle in degrees.
- `coneFov` is the reduced-detail cone's full-width angle in degrees.
- Detail interpolates through `coneFoveate` and toward `behindFoveate` out to 180 degrees. Nonzero outer/behind foveation intentionally retains coarser refinement outside the central view.
- Spark 2.1 exposes no independent `outsideFoveate` or “outside-frustum cutoff angle” property. Do not invent one.
- `clipXY` controls shader draw clipping of splat centers. `1` matches the rectangular X/Y frustum and the Spark default `1.4` permits centers 40% beyond it. It does not control LOD paging/refinement.
- `driveLod()` derives its viewpoint from the camera passed to renderer update/current view transform.
- This app intends only the real/default-camera renderer (`enableDriveLod: true`) to drive LOD and paging. The editor renderer (`enableDriveLod: false`) receives shared `lodInstances`.
- Current profiles pass `coneFov0: 0.2`/`0.3` and `coneFov: 1`/`0.7`; Spark 2.1 interprets these as degrees, not normalized scalar factors. Determine whether these are accidental old-API values and replace them with justified degree-based defaults if so.
- Runtime mutation of ordinary renderer fields is possible, but Spark does not automatically mark all LOD/foveation changes dirty.
- `maxPagedSplats`, `numLodFetchers`, and `pagedExtSplats` are used when creating a `SplatPager`. Mutating the field after pager creation does not resize/reconfigure that pager.

## Files likely involved

- `src/lib/components/RadStoryScene.svelte`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/spark/createSparkStudioRenderer.ts`
- a new small `Object3D` controller/model under `src/lib/spark/`, such as `SparkControls.ts`
- `src/lib/types.ts`
- `src/lib/spark/deviceProfile.ts`
- `tests/unit/createSparkStudioRenderer.test.ts`
- `tests/unit/deviceProfile.test.ts`
- new controller/settings tests
- `tests/e2e/rad-story.spec.ts`
- `AGENTS.md`

Keep the file set as small as a clean implementation permits.

## Required design

### Studio object and source sync

- Add one literal Threlte `<T>` node with `name="Spark"`, backed by an owned custom `Object3D`-compatible settings controller.
- It must appear exactly once in the outline, be selectable, and expose its supported fields in the normal Studio Inspector.
- Supported authored values must persist through Studio source sync.
- Avoid private Studio APIs.
- Prevent meaningless transform source sync for this controller using the narrowest public transaction pattern needed. Do not weaken the existing `ScrollAnimator` guard.
- Initialize settings from the device profile while keeping one clear source of truth.
- Do not add the real LOD-driving `SparkRenderer` to the Three scene.

### Mandatory live controls

All eight current device-profile renderer numbers must be editable and live:

| Control | Meaning / requirement |
|---|---|
| `lodSplatScale` | LOD splat budget multiplier |
| `lodRenderScale` | Minimum projected LOD splat size scale |
| `maxStdDev` | Gaussian extent/quality bound |
| `maxPagedSplats` | Paged-splat allocation; integer multiple of Spark page size `65,536` |
| `coneFov0` | Full-detail full-width cone angle in degrees |
| `coneFov` | Reduced-detail full-width cone angle in degrees |
| `coneFoveate` | Detail scale at `coneFov` |
| `behindFoveate` | Detail scale toward 180 degrees/behind viewer |

Also expose these important runtime-safe quality and LOD controls unless the installed API proves one unsafe:

- `minPixelRadius`
- `maxPixelRadius`
- `minAlpha`
- `preBlurAmount`
- `blurAmount`
- `falloff`
- `clipXY`
- `focalAdjustment`
- `sortRadial`
- `minSortIntervalMs`
- `enableLod`
- `enableLodFetching`
- `lodSplatCount`, with a clear representation for automatic/platform default
- `lodInflate`

Optional construction/allocation controls such as `numLodFetchers` or encoding flags may be included only if their live lifecycle is implemented honestly and tested.

For all numeric fields:

- Reject or normalize NaN, infinities, negatives where invalid, fractional integer-only values, and unsafe ranges.
- Use field-specific bounds based on installed Spark semantics, not arbitrary generic bounds.
- Preserve coherent angle relationships. Confirm the installed worker's practical range, then enforce `0 <= coneFov0 <= coneFov` and the correct upper bound.
- Clearly identify `coneFov0` and `coneFov` as full-width **degree** values.
- Ensure `maxPagedSplats` is a safe positive multiple of `65,536`; define deterministic rounding/validation behavior.

### Live propagation

- Propagate applicable ordinary settings to both the editor and real renderer so the two views do not diverge.
- Preserve the invariant `editorRenderer.enableDriveLod === false` and `realRenderer.enableDriveLod === true`. Do not expose `enableDriveLod`.
- Mark render, sort, and LOD state dirty as required. Foveation changes must trigger a new LOD traversal even if the camera did not move.
- Use reactive/event-driven propagation, not per-frame polling.
- Support settings applied before attach, after attach, and during idempotent disposal safely.

### Live `maxPagedSplats` reconfiguration

Changing `maxPagedSplats` in Studio must actually change the live paging allocation. A bare assignment to `SparkRenderer.maxPagedSplats` is not acceptable after `realRenderer.pager` exists.

Design and test a controlled reconfiguration path that:

- safely disposes/recreates the affected Spark renderers and pager, or uses another supported public lifecycle that truly applies the new capacity;
- preserves the loaded `SplatMesh`, its scene transform, URL/source-sync metadata, and authored settings;
- preserves the dual-renderer ownership and camera routing;
- does not leave the old pager attached to `PagedSplats`;
- does not leak workers, textures, renderers, callbacks, or scene objects;
- cannot race repeated rapid capacity edits into multiple live renderer pairs;
- keeps the last valid settings snapshot when recreation completes;
- invalidates rendering and resumes RAD refinement automatically;
- remains safe if the viewer is destroyed during reconfiguration.

It is acceptable for this one allocation setting to briefly restart paging, but it must not require a full page reload or manual viewer remount. Document that behavioral distinction in the Inspector-facing naming/help if possible, AGENTS.md, and the completion report.

If installed Spark public APIs make safe live `maxPagedSplats` reconfiguration impossible while retaining the loaded mesh, stop and report the concrete blocker before substituting fake behavior or private internals.

## Frustum and camera-routing investigation

Perform an evidence-based investigation:

1. Trace Spark 2.1 LOD worker inputs and explain how refinement behaves inside the cone, outside the perspective frustum, and behind the camera.
2. Confirm `clipXY` affects draw clipping only and does not prune LOD pages/chunks.
3. Prove which exact camera object, world position/quaternion/direction, FOV, aspect, and projection matrix reach the driving renderer during default → editor → default camera transitions.
4. Prove the editor camera cannot drive the real renderer's LOD viewpoint or pager.
5. Preserve and test `SparkRenderer.sparkOverride` restoration on success and errors.
6. Reproduce the behavior with the lightweight RAD if feasible. Compare LOD/refinement while changing `coneFov0`, `coneFov`, `coneFoveate`, and `behindFoveate` without moving the camera.
7. Determine whether the report is explained by intended angular foveation, the suspicious current degree values, background fetch/update latency, or an app routing/matrix bug.
8. Fix only proven app defects. Do not patch `node_modules`.
9. If strict frustum-only refinement is unavailable through Spark's public API, state that and document the closest confirmed settings for minimizing off-screen refinement.

## Constraints

- Use installed Spark 2.1 public APIs in production code; no `any`-based guesses, private fields typed through casts, or dependency patches.
- Using documented public renderer state such as `lodDirty` is allowed only if it is part of the installed public declaration; encapsulate it in the renderer bridge.
- Use only public Threlte Studio APIs.
- Preserve the dual-renderer architecture, `sparkOverride` `try/finally`, RAD `paged: true`, `pagedExtSplats: true`, real-camera LOD ownership, editor shared LOD, `renderMode="always"`, and SplatMesh lifecycle.
- Do not alter ScrollAnimator behavior, ScrollTrigger semantics, camera animation, landing/viewer flow, or unrelated styling.
- Do not add a custom Studio pane unless normal Inspector controls cannot meet the requirement.
- Do not update dependencies or modify generated/dependency files.
- Do not commit the user's unrelated `package-lock.json` working-tree change unless it is proven necessary and explicitly accounted for.

## Acceptance criteria

- The Studio outline contains exactly one selectable object named `Spark`.
- Every numeric field currently provided by `DeviceProfile.sparkRenderer` is present, source-synced, validated, and live.
- Representative additional quality/LOD controls listed above are present and live.
- Ordinary edits affect both renderers immediately without a viewer remount or camera movement.
- `maxPagedSplats` edits actually apply to a newly configured live pager/renderer lifecycle without page reload, losing the mesh, leaking resources, or breaking camera routing.
- `maxPagedSplats` accepts only normalized positive multiples of `65,536`.
- `coneFov0`, `coneFov`, `coneFoveate`, and `behindFoveate` visibly affect LOD selection live; the two cone angles are clearly degrees.
- Foveation edits force LOD recomputation.
- Invalid values cannot corrupt renderer state.
- Editor/real `enableDriveLod` ownership cannot be edited away.
- Tests prove correct camera routing through default → editor → default transitions.
- The frustum conclusion is specific and backed by installed-source and runtime/test evidence.
- `clipXY` is not described as an LOD cutoff.
- Current suspicious cone defaults are either corrected with evidence or explicitly justified.
- Existing behavior and tests remain green.
- `AGENTS.md` is updated with concise current architecture, feature behavior, live-versus-recreate settings semantics, and relevant source references.

Before finalizing, re-check and explicitly account for every acceptance criterion.

## Tests to create and run

Create new tests covering:

- Controller name/type/defaults and all current profile fields.
- Validation, finite values, field-specific ranges, integer/page-size normalization, and angle invariants.
- Change notifications and idempotent unsubscribe/disposal.
- Applying each ordinary setting before/after renderer creation and to both renderers.
- Render/sort/LOD invalidation, especially foveation changes without camera movement.
- Immutable `enableDriveLod` ownership.
- `maxPagedSplats` recreation before pager creation, after pager creation, during rapid repeated changes, and during viewer disposal.
- Old pager/renderer cleanup and new pager capacity.
- Loaded mesh, transform, and settings preservation across capacity recreation.
- Default → editor → default camera routing and error restoration.
- Updated device-profile degree defaults.
- E2E proof that `Spark` appears once, is selectable, exposes all eight profile fields plus representative additional controls, and Studio edits persist/apply.
- E2E or stable integration proof that `maxPagedSplats` triggers the controlled lifecycle and returns to rendering.

Run:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

If feasible, manually verify with `https://avner.us/baby_yoda-lod.rad`, including cone/foveation edits without camera movement and a `maxPagedSplats` change.

## Things Pi must not change

- Do not collapse or replace the two-renderer architecture.
- Do not let the editor camera drive LOD/paging.
- Do not add the real renderer to the scene.
- Do not expose `enableDriveLod`, raw renderer/worker/pager objects, or unsafe internals in Studio.
- Do not implement an Inspector field that silently has no runtime effect.
- Do not claim strict frustum-only paging without proof.
- Do not patch Spark or use private Threlte/Spark imports.
- Do not change animation, source-sync, app flow, unrelated UI, dependencies, or unrelated user changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Summary
2. Files changed
3. Complete controls table: default, range, units, validation, and live mechanism
4. Explicit accounting for all eight current device-profile numbers
5. `maxPagedSplats` lifecycle/recreation design and cleanup evidence
6. Frustum/LOD findings with installed source references
7. Camera-routing evidence and bug conclusion
8. Acceptance criteria checklist
9. Tests created
10. Exact test commands/results
11. Manual verification and observations
12. Remaining limitations/follow-ups
13. Commit hash(es)

Request: update `AGENTS.md` with concise, up-to-date feature and architecture information plus source references suitable for a fresh agent session; do not add a chronological implementation log.

Always write `status.md` as the **last action before committing and pushing**. Re-check that all acceptance criteria are met before writing it. After the final push, do not run more verification, inspect files, or make further modifications.
