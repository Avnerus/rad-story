# Follow-up mission: make Spark controls genuinely editable, persistent, and safe

## Objective

Correct the Spark controls implementation from commit `dd736e3`. The first pass has good structure and reported green checks, but diff verification found several untested correctness gaps. Deliver working Studio Inspector controls, reliable live application, and a safe `maxPagedSplats` lifecycle. Do not merely update the status report or add shallow tests around the current behavior.

## Verified problems to address

### 1. Inspector controls and source sync are not proven

`RadStoryScene.svelte` currently passes one nested prop:

```svelte
<T is={sparkControls} name="Spark" settings={sparkControls.settings} />
```

The transaction guard permits only a root `settings` transaction and explicitly blocks descendant paths such as `settings.lodSplatScale`. The e2e additions verify only that an item containing text `Spark` exists and remains visible after a click. They do not open Inspector, locate any of the 21 fields, edit one, verify live state, or verify source sync.

Prove how public Threlte Studio Inspector/source sync handles this custom object. If nested `settings` does not expose independently editable numeric/boolean controls with working source sync, redesign the controller to expose top-level public properties/setters and literal `<T>` attributes for each supported control. Update the transaction guard to whitelist only those exact supported attributes/path-prefixed equivalents, while still blocking transforms and descendants/unrelated fields.

The finished UI must show usable controls, not a serialized opaque object or only an outline node.

### 2. `maxPagedSplats` recreation loses live settings

`replaceRenderers()` creates new renderers from the original `sparkOptions`. Ordinary changes made through `applySettings()` are never copied into `sparkOptions` or another retained settings snapshot. Therefore changing `maxPagedSplats` resets prior edits such as `lodSplatScale`, cone angles, blur, sorting, and LOD toggles.

Additionally, the bridge change handler takes an exclusive branch for `maxPagedSplats`; if a source-sync assignment changes capacity and another field together, the other changes are not applied.

Retain one validated current settings snapshot in the renderer handle and apply the complete snapshot to replacement renderers before they become active. A capacity change and any simultaneous ordinary changes must all survive recreation.

### 3. Recreation leaves a disposed pager attached

Installed Spark 2.1 behavior:

- `SparkRenderer.dispose()` disposes `renderer.pager` and sets only the renderer's own field to `undefined`.
- `PagedSplats.dispose()` does not clear `PagedSplats.pager`.
- On later LOD setup, Spark assigns a pager only when `mesh.paged && !mesh.paged.pager`.

The current replacement code never clears or safely rebinds `SplatMesh.paged.pager`. After old renderer disposal, the loaded `PagedSplats` can retain a truthy reference to a disposed pager, preventing the new renderer from attaching its pager.

Implement a lifecycle backed by installed public API evidence:

- identify every affected loaded `PagedSplats`;
- prevent use of the disposed pager;
- attach/reload against the new pager safely;
- handle in-flight fetch work and viewer destruction;
- preserve or deliberately restore the mesh, URL, transform, and source-sync state;
- prove the new pager has the requested capacity and the old pager/resources are no longer used.

If Spark 2.1 cannot safely rebind a loaded `PagedSplats` through public APIs, replace the SplatMesh as part of a controlled keyed reload rather than retaining an invalid pager reference. Do not use private fields/casts to fake support. A brief automatic RAD reload is acceptable; a page reload or manual remount is not.

### 4. `lodSplatCount` cannot return to automatic

`applyLiveSettings()` skips `lodSplatCount` when its value is `null`. This works only while the renderer field was never set. After assigning a numeric count, setting the control back to automatic leaves the old number active.

Map the controller's `null` representation to `renderer.lodSplatCount = undefined`, mark LOD dirty as needed, and test numeric → automatic on both current and replacement renderers.

### 5. Validation is incomplete

- Constructor `initial` values bypass all validation.
- The angle invariant is enforced only when `coneFov0` and `coneFov` occur in the same setter call. Editing either one alone can produce `coneFov0 > coneFov`.
- Validate boolean input without turning arbitrary truthy strings such as `"false"` into `true`.
- Enforce other coupled invariants where relevant, including a coherent `minPixelRadius <= maxPixelRadius`.
- Confirm the practical cone-angle upper bound from installed Spark worker/docs rather than asserting `180` without evidence.

All constructor and single-field Studio edits must pass through the same validation path and produce deterministic change notifications.

### 6. Default regression

Installed Spark 2.1 defaults `blurAmount` to `0.3`. `SparkControls` defaults it to `0`, and initial bridge application therefore silently changes rendering even before the user edits anything.

Audit every added non-profile control against the installed Spark 2.1 constructor defaults. Match those defaults unless the existing app intentionally supplied an override before this feature. Update the stub, tests, status table, and AGENTS.md accordingly.

### 7. Live invalidation/change detection is too broad and too narrow

`applyLiveSettings()` currently reports a foveation change whenever the complete snapshot contains foveation keys, even if values are identical. Conversely, it does not provide field-level handling for other settings that require LOD traversal, generator regeneration, re-sort, or render invalidation.

Compare old and new values and classify changed fields:

- shader/uniform-only;
- sort-affecting;
- LOD budget/traversal-affecting;
- paging-capacity/recreate;
- LOD enable/automatic-state transitions.

Call the necessary public Spark dirty/update mechanisms and Threlte invalidation for actual changes only. Preserve `renderMode="always"` but do not rely on it to conceal missing Spark state invalidation.

### 8. Camera-routing and recreation tests are weaker than reported

The new tests do not prove:

- default → editor → default routing with exact camera identity;
- preservation of live settings across recreation;
- real pager replacement/rebinding;
- rapid repeated capacity edits;
- disposal during reconfiguration;
- loaded mesh/transform preservation;
- simultaneous capacity plus ordinary changes.

Add focused evidence for these claims. Continue to trust and preserve the existing `sparkOverride` `try/finally` architecture.

## Files likely involved

- `src/lib/spark/SparkControls.ts`
- `src/lib/spark/createSparkStudioRenderer.ts`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/components/SparkSplats.svelte` if safe capacity changes require controlled mesh reload
- `src/lib/studio/scroll-animator/transactionGuard.ts`
- `src/lib/types.ts`
- `src/lib/spark/deviceProfile.ts`
- Spark controller, renderer bridge, transaction guard, and e2e tests
- `tests/fixtures/spark-stub.ts`
- `AGENTS.md`

## Constraints

- Use only public installed Spark 2.1 and Threlte Studio APIs in production code.
- Do not patch `node_modules`, update dependencies, or use private deep imports.
- Preserve two Spark renderers, real-camera-only LOD driving, editor shared LOD, `sparkOverride` restoration, `paged: true`, `pagedExtSplats: true`, and `renderMode="always"`.
- Never expose `enableDriveLod` or allow Studio to change renderer ownership.
- Preserve ScrollAnimator, ScrollTrigger, camera animation, landing/viewer flow, and unrelated UI.
- Do not commit the user's unrelated `package-lock.json` modification.
- Keep existing useful first-pass tests, but correct tests that encode a wrong default or ineffective behavior.

## Acceptance criteria

- Selecting exactly one outline object named `Spark` exposes all eight device-profile fields and the agreed additional quality/LOD fields as usable Inspector controls.
- At least representative number, boolean, nullable/automatic, foveation, and capacity fields are edited through real Studio UI in e2e/manual evidence.
- Supported field edits persist through source sync; transforms and unsupported fields do not.
- Constructor input and all single/multi-field edits are validated consistently.
- `coneFov0 <= coneFov` and `minPixelRadius <= maxPixelRadius` always hold after editing either side.
- Added controls preserve installed Spark defaults before the user edits them; specifically `blurAmount` is not silently changed from `0.3`.
- `lodSplatCount` supports automatic → numeric → automatic on both renderers.
- Actual changed fields trigger only the necessary render/sort/LOD work.
- All ordinary settings survive a later `maxPagedSplats` change.
- Simultaneous capacity and ordinary setting changes are all applied.
- Capacity changes produce a genuinely usable pager with the normalized requested capacity; no `PagedSplats` retains or uses a disposed pager.
- Repeated capacity edits and destruction are safe and leak-free.
- Loaded RAD rendering resumes automatically after capacity change, with mesh/source-authored transform preserved.
- Default → editor → default camera routing remains correct across settings edits and renderer recreation.
- Frustum documentation remains accurate: cone/foveation controls bias off-screen refinement; `clipXY` is draw clipping, not LOD cutoff.
- AGENTS.md and status claims match evidence and do not overstate unverified behavior.

Re-check every acceptance item immediately before finalizing.

## Tests to create and run

Add or strengthen tests for:

- validated constructor input;
- each angle edited independently across the other;
- coupled pixel-radius invariants;
- invalid boolean input;
- installed Spark defaults, especially `blurAmount: 0.3`;
- actual changed-field detection and correct dirty/invalidation classification;
- `lodSplatCount` automatic → numeric → automatic;
- complete settings preservation across capacity recreation;
- simultaneous capacity plus other changes;
- loaded `PagedSplats` old-pager detachment/new-pager attachment or controlled mesh reload;
- rapid capacity edits and destruction;
- exact default/editor/default camera routing after recreation;
- real Inspector field visibility and representative edits;
- source-sync persistence of supported fields and suppression of transforms/unsupported paths.

Run and report:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Perform the previously omitted manual check with `https://avner.us/baby_yoda-lod.rad`. Verify at least one ordinary quality edit, cone/foveation edits without camera movement, numeric → automatic LOD count, and `maxPagedSplats` recreation/reload. Report observable rendering/refinement recovery and any automation limitations honestly.

## Things Pi must not change

- Do not replace the dual-renderer architecture or let the editor camera drive LOD.
- Do not add the real renderer to the scene.
- Do not accept outline presence alone as proof of editor controls.
- Do not leave fake/no-op fields in Inspector.
- Do not retain disposed pager references.
- Do not reset live settings during capacity change.
- Do not broaden transaction source sync beyond the explicit Spark control whitelist.
- Do not patch dependencies or include unrelated user changes.

## Expected completion report format

Write `.codex-handoff/status.md` with:

1. Root causes and fixes for each numbered problem above
2. Files changed
3. Final controls/defaults/ranges/units table
4. Inspector and source-sync evidence
5. Changed-field invalidation matrix
6. `maxPagedSplats` lifecycle, old/new pager evidence, settings/mesh preservation
7. Camera-routing evidence
8. Acceptance checklist
9. Tests created and exact command results
10. Real Baby Yoda manual verification
11. Remaining limitations
12. Commit hash(es)

Update `AGENTS.md` with concise, current information and source references for a fresh agent session. Remove or correct first-pass claims that are not true after the final design; do not add an implementation diary.

Always write `status.md` as the **last action before committing and pushing**. Re-check that every acceptance criterion is met before writing it. After the final push, do not perform more verification, inspect files, or modify anything.
