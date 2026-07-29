# Follow-up mission: finish live Spark paging and prove editor controls

## Objective

Finish the two unresolved core requirements in the Spark controls feature:

1. `maxPagedSplats` must genuinely take effect live, with no loaded `PagedSplats` retaining a disposed pager.
2. The editor must visibly expose usable individual controls whose edits apply live and persist through source sync.

Do not finalize with either item documented as a limitation. Preserve the good fixes already made for validation, Spark defaults, changed-field invalidation, settings preservation, and `lodSplatCount` automatic round-trip.

## Verified remaining failures

### `maxPagedSplats` is still not functional after paging starts

The current status explicitly confirms that the existing loaded `PagedSplats` retains its old disposed pager and the new renderer may never attach its new pager. Therefore the requested capacity may not take effect.

Installed Spark 2.1 exposes no supported rebinding API. Implement the controlled reload path already identified in the prior mission:

- changing `maxPagedSplats` must coordinate disposal/recreation of the renderer pair and the affected SplatMesh/PagedSplats;
- instantiate the new renderer pair with the complete current settings before loading the replacement paged mesh;
- automatically reload the same RAD URL so the new `PagedSplats` begins without a stale pager and attaches to the new driving renderer;
- preserve the authored/runtime mesh transform, name, visibility, and Studio source-sync target across reload;
- keep camera, ScrollAnimators, scroll position, and unrelated scene objects mounted;
- coalesce or serialize rapid capacity edits so only the latest requested capacity wins;
- handle URL changes, load failure, and viewer destruction without resurrecting disposed objects;
- dispose the old mesh/renderers/pager exactly once and ensure late async work cannot become active;
- show no page reload and require no user action beyond editing the control.

If the cleanest public solution uses a stable Studio-editable wrapper Object3D with a reloadable SplatMesh child, keep outline identity/source sync clear and update tests/documentation. Do not mutate private Spark fields to clear `PagedSplats.pager`.

### Individual editor controls/source sync remain unproven

The current scene still declares only:

```svelte
<T is={sparkControls} name="Spark" settings={sparkControls.settings} />
```

The 22 top-level accessors are prototype properties and are not declared as literal `<T>` attributes. No e2e test or manual report locates a single numeric/boolean field, edits it, observes renderer state, or proves the source change. Outline presence is insufficient.

Determine the actual supported public Threlte Studio authoring path and implement one that is demonstrably functional:

- If normal Inspector can expose and source-sync the controls, provide the literal/source metadata it requires and prove representative field transactions.
- If normal Inspector cannot reliably author a nested settings object or prototype accessors, add a small public Studio authoring extension/pane activated for exactly one selected `SparkControls`, following the established ScrollAnimator extension/transaction patterns. It may source-sync the complete root `settings` object while presenting individual labeled inputs.

In either design:

- all eight device-profile fields and the agreed additional fields must be individually visible/editable;
- numeric versus boolean versus automatic/null controls must be appropriate;
- angle fields must show degree units;
- capacity must explain its `65,536` page normalization and brief automatic RAD reload;
- edits must pass through `SparkControls` validation;
- source sync must persist the authored value and support undo/redo;
- transforms and unsupported attributes must remain blocked;
- path-prefixed valid attribute names must be handled without allowing descendants such as `settings.lodSplatScale` accidentally;
- selecting another object must not edit Spark;
- remount/reload must not create a duplicate `Spark` outline object or lose current authored values.

## Additional issues to resolve

- Restore a fully passing e2e suite. The report shows `23 passed, 15 failed`; do not label that green or “pre-existing” without evidence. Ensure the intended Spark stub build is actually the server Playwright connects to, including when `reuseExistingServer` could select a stale real-Spark server.
- Add field-level e2e/manual evidence rather than the existing outline-only tests.
- Confirm boolean validation policy matches its documentation. If only booleans and recognized serialized boolean forms are supported, reject/fallback arbitrary strings rather than treating all other nonempty strings as `true`.
- Confirm the cone-angle upper bound from installed Spark code/docs and cite the evidence in the report.
- Keep AGENTS.md honest: remove claims that capacity recreation is complete until the mesh reload path is implemented and verified.

## Files likely involved

- `src/lib/components/RadStoryScene.svelte`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/SparkSplats.svelte`
- `src/lib/spark/SparkControls.ts`
- `src/lib/spark/createSparkStudioRenderer.ts`
- potentially a small coordination/runtime module for atomic renderer + mesh reload
- potentially a public Studio authoring extension for `SparkControls`
- `src/lib/studio/scroll-animator/transactionGuard.ts`
- `tests/e2e/rad-story.spec.ts`
- relevant unit tests and Spark stub
- `playwright.config.ts`
- `AGENTS.md`

## Constraints

- Use only public Spark 2.1 and public Threlte Studio APIs in production.
- Do not patch dependencies, clear private pager fields, or deep-import private modules.
- Preserve the dual renderer architecture and real/default-camera-only LOD driving.
- Preserve `sparkOverride` `try/finally`, `paged: true`, `pagedExtSplats: true`, `renderMode="always"`, and editor shared LOD.
- Preserve camera/target animation, current scroll state, landing/viewer flow, and ScrollAnimator source sync.
- Do not expose `enableDriveLod`.
- Do not commit the user's unrelated `package-lock.json` modification.
- Do not regress the already-corrected `blurAmount: 0.3`, validation invariants, live settings preservation, or numeric → automatic `lodSplatCount`.

## Acceptance criteria

- Exactly one selectable outline object named `Spark` exists before, during, and after capacity reload.
- Every requested Spark field is visibly available as an individual editor control.
- Automated or concrete manual evidence edits at least:
  - one ordinary numeric field;
  - one boolean field;
  - one cone-angle/foveation field;
  - `lodSplatCount` automatic → numeric → automatic;
  - `maxPagedSplats`.
- Representative edits change the real/editor renderer state live and source-sync the expected Svelte attribute/root settings object with undo/redo.
- A capacity edit causes an automatic controlled RAD/SplatMesh reload and the replacement `PagedSplats` attaches to a non-disposed pager with the normalized requested capacity.
- No replacement mesh uses the old pager; old mesh, renderer pair, pager, workers, and textures are disposed safely.
- All other current settings and the mesh transform/name/visibility survive capacity reload.
- Repeated capacity edits resolve to the last value without duplicate meshes/renderers or stale async activation.
- Default → editor → default camera routing remains correct after reload.
- Failure and destruction paths leave no stale scene objects or callbacks.
- The full e2e suite passes in its intended stub configuration.
- `npm run check`, lint, unit tests, e2e tests, and build all pass.
- AGENTS.md and status describe only verified behavior.

Re-check every acceptance criterion before finalizing. Do not check an item that is only inferred.

## Tests to create and run

Add focused tests for:

- renderer + SplatMesh coordinated capacity reload;
- old/new `PagedSplats.pager` identity and disposal state;
- transform/name/visibility/settings preservation;
- rapid edits, URL change, failure, and destroy races;
- exactly one Spark controller and one active SplatMesh after reload;
- camera routing after reload;
- real editor field presence and representative edits;
- source-sync transaction shape, undo/redo, and transform suppression;
- strict boolean validation;
- clean Playwright stub-server startup.

Run:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Perform a real Baby Yoda manual verification with `https://avner.us/baby_yoda-lod.rad`. Change `maxPagedSplats` after paging begins and confirm the model reloads and resumes rendering/refinement. Also edit representative ordinary, boolean, cone, and automatic-count controls. Report what was directly observed.

## Things Pi must not change

- Do not accept a disposed pager reference as a documented limitation.
- Do not treat outline visibility as proof of controls.
- Do not claim tests are green while any suite fails.
- Do not reset other Spark settings or mesh transforms during capacity reload.
- Do not remount the camera/ScrollAnimator scene or reset scroll.
- Do not use private Spark/Studio APIs or include unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Final editor-control design and why it works with public Studio APIs
2. Field-level Inspector/pane and source-sync evidence
3. Coordinated renderer/SplatMesh capacity-reload lifecycle
4. Old/new pager identity, capacity, and disposal evidence
5. State/transform/camera preservation evidence
6. Race/failure cleanup behavior
7. Acceptance checklist with direct evidence per item
8. Tests created and exact results
9. Real Baby Yoda manual verification
10. Remaining limitations, excluding the two core requirements above
11. Files changed
12. Commit hash(es)

Update `AGENTS.md` with concise, accurate architecture/features and source references for a fresh session. Remove stale first-pass claims rather than adding an implementation diary.

Always write `status.md` as the **last action before committing and pushing**. Re-check all acceptance criteria first. After the final push, do not run more verification, inspect files, or modify anything.
