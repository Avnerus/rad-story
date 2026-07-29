# Final follow-up mission: wire reload state and verify capacity/source sync

## Objective

Keep the current `SparkReloadCoordinator`, stable `SplatWrapper`, Spark Controls extension, and all-green test setup. Close the remaining wiring and evidence gaps without another architectural rewrite.

The current code is close, but the status checks requirements that it later admits were not verified.

## Required work

### 1. Connect reload progress and errors to the pane

`SparkControlsExtension` defines `uiState.reloading` and `uiState.reloadError`, but nothing updates either field. `SparkSplats` never registers `coordinator.onReloadError()`. The coordinator catches factory errors internally, so the bridge's `.catch()` will not receive them.

Add a small instance-owned runtime/status channel associated with the current `SparkControls` or scene:

- capacity commit immediately reports reload pending/in progress;
- success clears progress only after replacement mesh initialization and scene swap;
- failure exposes a useful message in `spark-error`;
- a later successful request clears the prior error;
- superseded requests do not flash false completion/errors;
- destruction clears state and cannot update a dead pane;
- source-sync-unavailable mode still shows correct live reload progress.

Do not introduce a new global singleton.

### 2. Verify real pager handoff using public fields

Installed Spark 2.1 declarations publicly expose `SparkRenderer.pager`, `SplatMesh.paged`, and `PagedSplats.pager`. Use those public fields through an owned bridge/test diagnostic to verify:

- old driving renderer/pager identity;
- old mesh/PagedSplats identity;
- replacement renderer/pager identity;
- replacement mesh/PagedSplats identity;
- old objects are no longer active;
- replacement `mesh.paged.pager === realRenderer.pager`;
- replacement pager capacity corresponds to normalized `maxPagedSplats`;
- the reload completion signal used by the pane does not claim full completion before this handoff is observed.

If pager attachment occurs on the next render/update after `SplatMesh.initialized`, model that explicitly rather than equating mesh initialization with pager readiness. Use a bounded event/frame-driven readiness check with cancellation—not an arbitrary sleep.

### 3. Exercise `maxPagedSplats`

Add a capacity e2e test in the stub build with diagnostic counters/IDs:

- edit `maxPagedSplats` through the actual pane;
- verify normalization to a `65,536` multiple;
- verify reload progress appears and clears;
- verify renderer pair and mesh identities change;
- verify only one wrapper/active mesh remains;
- verify other edited settings and wrapper transform persist;
- perform rapid edits and verify the final value wins;
- verify no late replacement after viewer destruction/remount.

Extend the Spark stub narrowly to model pager identity/capacity and disposal sufficiently for this test.

### 4. Verify source sync and undo honestly

Preview/stub e2e lacks the Vite source-sync plugin, so it cannot prove persistence or undo. Add the strongest suitable evidence:

- unit/component tests with a mocked public `useTransactions()` contract that assert the root `settings` transaction's `value`, `historicValue`, `sync: true`, and `createHistoryRecord: true`;
- prove undo applies the historic full settings snapshot through the writable setter and re-propagates live values;
- manually use the dev server with source sync enabled, edit one harmless representative field, observe the actual Svelte source change and Studio undo/redo, then restore the desired authored value before finalizing.

Report exact observed source attribute/object and undo/redo values. Do not check source sync/undo acceptance based only on code inspection.

### 5. Strengthen field-level evidence

- Numeric e2e must assert controller/renderer diagnostic state, not only that the input retains typed text.
- Boolean e2e must assert live state outside the checkbox.
- Nullable test must verify numeric → renderer value and empty → automatic/undefined.
- Cone invariant test must verify both `coneFov0` and the adjusted `coneFov`.
- Capacity test must verify actual reload/handoff as above.

### 6. Perform the omitted real capacity check

With the real Baby Yoda RAD:

- wait until initial paging/rendering is active;
- edit an ordinary quality value and observe it live;
- change `maxPagedSplats`;
- observe progress, mesh replacement, new pager handoff/capacity, and rendering/refinement recovery;
- verify camera/scroll behavior and wrapper transform remain unchanged.

The report must clearly distinguish real Spark from the stub build.

## Files likely involved

- `src/lib/components/SparkSplats.svelte`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/spark/SparkReloadRuntime.ts`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- a small instance-owned status/diagnostic bridge
- `tests/fixtures/spark-stub.ts`
- `tests/unit/SparkReloadCoordinator.test.ts`
- component/transaction tests for the extension logic
- `tests/e2e/rad-story.spec.ts`
- `AGENTS.md`

## Constraints

- Preserve the current coordinator/wrapper design and all prior correct fixes.
- Use public Spark and Studio APIs only.
- No fixed timing sleeps as pager-readiness logic.
- Preserve dual renderers, default-camera LOD ownership, camera/ScrollAnimator state, source-authored wrapper transform, and all Spark settings.
- Do not expose `enableDriveLod`.
- Do not regress the 48/48 e2e suite.
- Do not commit the user's unrelated `package-lock.json`.

## Acceptance criteria

- Pane progress/error UI is driven by real coordinator state.
- Completion means replacement mesh is active and its public `PagedSplats.pager` is the new driving renderer's pager.
- Requested normalized pager capacity is directly observed.
- Capacity pane edit, rapid edits, and destroy/remount are covered end to end.
- Representative numeric, boolean, nullable, and cone tests verify live state beyond input appearance.
- Source-sync transaction contents and undo behavior are tested.
- Dev-server manual source sync and undo/redo are directly observed.
- Real Baby Yoda capacity reload and rendering recovery are directly observed.
- Stub and real verification are clearly distinguished.
- Check, lint, unit, full e2e, and build all pass.
- Status checklist contains no item contradicted by limitations.

## Tests to run

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

## Things Pi must not change

- Do not replace the reload architecture again.
- Do not claim pager readiness from `SplatMesh.initialized` alone.
- Do not treat input text/checkbox state as proof of renderer state.
- Do not claim source sync/undo from a preview build where it is disabled.
- Do not omit the real capacity edit.
- Do not include unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Reload status/error wiring
2. Direct old/new mesh, PagedSplats, renderer, pager, and capacity evidence
3. Capacity/rapid/destroy e2e evidence
4. Live state assertions for representative fields
5. Transaction and undo unit evidence
6. Dev-server source-sync and undo/redo observations
7. Real Baby Yoda capacity/recovery observations
8. Stub-versus-real distinction
9. Acceptance checklist
10. Exact all-green command results
11. Files changed
12. Remaining non-core limitations
13. Commit hash(es)

Update `AGENTS.md` concisely with verified final behavior and relevant source references. Remove any stale statement equating initialization with pager readiness.

Always write `status.md` as the **last action before committing and pushing**. Re-check every acceptance item first. After the final push, do not run more verification, inspect files, or modify anything.
