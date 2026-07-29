# Follow-up mission: make Spark reload race-safe and verify the controls

## Objective

Complete and verify the new Spark Controls extension and `maxPagedSplats` mesh-reload path. The architecture is now directionally correct, but the current implementation has concrete lifecycle races, does not preserve claimed mesh state, resolves before the new mesh/pager is ready, has no tests for the new code, and still reports a failing e2e suite.

Preserve the dedicated public Studio extension, validated `SparkControls`, settings snapshots, dirty classification, corrected defaults, and dual-renderer camera routing.

## Required fixes

### 1. Replace the singleton callback with an owned, race-safe reload protocol

Current `SparkReloadRuntime` stores one global callback. `SparkSplats` implements reload as:

```ts
mesh?.dispose()
mesh = null
await new Promise((r) => setTimeout(r, 50))
mesh = createMesh()
```

This is unsafe:

- rapid requests run concurrently rather than being serialized/coalesced;
- request A can create a mesh, then request B overwrites the state without disposing A's replacement;
- an in-flight request continues after `onDestroy` and can create a mesh after component destruction;
- the arbitrary 50 ms delay proves nothing about renderer/pager disposal;
- the promise resolves after construction, not after mesh initialization or new-pager attachment;
- errors occur after the old mesh is already gone and are silently swallowed.

Implement an owned protocol with monotonically increasing generation/request IDs or an equivalent abort/coalescing design:

- latest capacity request wins;
- every superseded replacement is disposed;
- component destruction invalidates all in-flight requests;
- no arbitrary timing delay is used as lifecycle evidence;
- completion is tied to meaningful public readiness (`SplatMesh.initialized` plus the required scene/update handoff);
- errors are surfaced to the controller/pane and leave a deterministic recoverable state;
- callbacks/subscriptions are instance-owned and cannot collide across viewer remounts or multiple canvases.

### 2. Preserve actual mesh state

The current code creates a new default `SplatMesh` and does not copy transform, name, visibility, layers/render order, or other authored state. The status claim that transform/name/visibility survive is unsupported.

Choose a clean design:

- preferably keep a stable Studio-editable wrapper `Object3D` that owns transform/name/visibility while only its SplatMesh child reloads; or
- capture and restore the exact supported mesh state before swap.

Do not break the existing requirement that Studio-authored splat transforms persist. Document which object is authorable after the change and ensure the outline remains understandable without duplicate `Spark` controllers.

### 3. Prove fresh pager attachment and capacity

Do not infer success from constructing a new mesh.

Add an owned bridge/runtime signal or narrow diagnostic that can prove after reload:

- old mesh is disposed and no longer in the scene;
- old renderer/pager is disposed;
- replacement mesh is initialized and is the only active splat mesh;
- replacement `PagedSplats` does not reference the old pager;
- the driving renderer owns the pager used by the replacement;
- that pager was constructed with normalized requested `maxPagedSplats`;
- rendering/refinement resumes.

Use public installed Spark fields/APIs only. Remove diagnostics if they are test-only, or keep a narrow useful debug surface documented in AGENTS.md.

### 4. Make the editor pane behavior honest and testable

The extension is a reasonable solution, but no field has actually been edited in e2e or manual verification.

- Add stable semantic labels/IDs or `data-testid` attributes for the pane and field inputs.
- Open the pane after selecting `Spark`; assert all 22 unique field labels/inputs exist.
- Edit representative numeric, boolean, foveation, nullable/automatic, and capacity fields.
- Verify validation output, live controller/renderer state, root `settings` transaction, persistence/source change, and undo/redo.
- Confirm capacity displays reload-in-progress and failure state, and prevents misleading overlapping commits if needed.
- When source sync is unavailable, either truly allow live nonpersistent edits or change the warning and disable behavior so UI text matches reality.
- Avoid duplicate transaction-guard ownership if one shared registration suffices.

### 5. Restore a clean e2e environment and full pass

The status reports 8–13 failures and calls them pre-existing without evidence. The test configuration is intended to build with the Spark stub, so GPU stalls indicate the suite may be connecting to a stale real-Spark server or the stub is not active.

- Make the Playwright web server configuration deterministic.
- Do not silently reuse an unrelated server on port 4173.
- Add a small test-visible marker proving the running build uses the Spark stub.
- Run the complete suite against a clean server and fix regressions.
- Do not finalize while any e2e test fails.

## Files likely involved

- `src/lib/components/SparkSplats.svelte`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/spark/SparkReloadRuntime.ts` or its replacement
- `src/lib/spark/createSparkStudioRenderer.ts`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `src/lib/studio/spark-controls/SparkFixedToolbarPane.svelte`
- `tests/fixtures/spark-stub.ts`
- new unit tests for reload coordination
- `tests/e2e/rad-story.spec.ts`
- `playwright.config.ts`
- `AGENTS.md`

## Constraints

- Use public Spark 2.1 and public Threlte Studio APIs only.
- Do not patch dependencies or mutate private pager internals.
- Preserve dual Spark renderers, default-camera-only LOD driving, editor shared LOD, `sparkOverride` restoration, RAD paging, and always rendering.
- Preserve ScrollAnimator behavior, camera/target ownership, scroll position, and landing/viewer flow.
- Preserve all current Spark settings and source-authored transform through capacity reload.
- Do not expose `enableDriveLod`.
- Do not commit the user's unrelated `package-lock.json`.

## Acceptance criteria

- Rapid capacity edits yield exactly one initialized active replacement mesh using the last normalized value.
- Viewer destruction/remount during reload creates no late mesh, stale callback, or leaked resource.
- No arbitrary timeout is used to claim disposal/readiness.
- Actual mesh transform/name/visibility or stable wrapper state survives reload.
- Old and new mesh/pager identities, disposal, attachment, and capacity are directly verified.
- Rendering/refinement resumes after a real Baby Yoda capacity change.
- Spark pane exposes exactly 22 individually labeled controls when exactly one Spark object is selected.
- Representative number, boolean, cone, automatic-count, and capacity edits are exercised and verified.
- Source sync and undo/redo are directly verified for representative edits.
- Pane progress/error/source-sync-unavailable behavior matches what the UI says.
- Exactly one Spark controller and one active splat model remain after reload/remount.
- Default → editor → default camera routing still works after capacity reload.
- A deterministic marker proves e2e uses the Spark stub.
- `check`, lint, all unit tests, full e2e suite, and build pass.
- AGENTS.md and status contain no inferred or stale claims.

Re-check every item with direct evidence before finalizing.

## Tests to create and run

Create tests for:

- generation/coalescing behavior under rapid reloads;
- destroy and remount during initialization;
- initialization/load failure;
- old/replacement disposal and scene membership;
- pager identity/capacity handoff;
- transform/name/visibility preservation;
- all 22 pane controls;
- representative field commits, validation, history/undo, and source sync;
- deterministic stub build marker;
- camera routing after capacity reload.

Run:

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Manually use `https://avner.us/baby_yoda-lod.rad`: open the Spark pane, edit an ordinary number, boolean, cone angle, automatic count, and capacity. For capacity, wait for confirmed reload completion and verify rendering/refinement resumes. Report direct observations, not toolbar presence alone.

## Things Pi must not change

- Do not use a fixed delay as synchronization.
- Do not leave concurrent reload promises uncoordinated.
- Do not recreate meshes after component destruction.
- Do not claim transform or pager preservation without direct evidence.
- Do not accept any failing e2e tests.
- Do not treat toolbar/pane presence as proof that controls work.
- Do not use private APIs or include unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Reload coordinator ownership/state machine
2. Rapid-edit, destroy, failure, and remount behavior
3. Mesh state preservation design
4. Direct old/new mesh and pager evidence
5. Pane field/edit/source-sync/undo evidence
6. Deterministic stub-server evidence
7. Camera routing after reload
8. Acceptance checklist
9. Tests created and exact all-green results
10. Direct Baby Yoda edit/reload observations
11. Files changed
12. Remaining non-core limitations
13. Commit hash(es)

Update `AGENTS.md` concisely with the final verified architecture and source references. Remove superseded callback/delay and unverified claims.

Always write `status.md` as the **last action before committing and pushing**. Re-check all acceptance criteria first. After the final push, do not run more verification, inspect files, or modify anything.
