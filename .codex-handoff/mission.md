# Surgical follow-up: make status reactive and complete pager handoff

## Objective

Correct four specific remaining problems without redesigning the Spark controls feature:

1. reload status must actually update the open pane reactively;
2. success must mean the replacement mesh is attached to the new driving pager;
3. capacity e2e must assert identities/capacity rather than input text;
4. verification must stop describing the Spark-stub build as real splat rendering.

Keep the current coordinator, stable wrapper, extension UI, settings system, and all-green baseline.

## Verified code defects

### Status is not reactive

`RadStoryScene.handleReloadStatus()` assigns a plain property:

```ts
sparkControls.reloadStatus = status
```

`SparkControlsExtension` reads that property only in an effect driven by selection and transaction `revision`. A reload status update is neither a Svelte reactive mutation visible to that effect nor a transaction, so `uiState.reloading` and `uiState.reloadError` do not update.

`SparkReloadStatusBridge` receives `update()` calls but nothing subscribes to it.

Implement one coherent instance-owned mechanism:

- expose a subscribe/unsubscribe API from `SparkControls` or attach the existing bridge to the selected controller;
- the extension must subscribe when one Spark controller is selected and clean up on selection change/destroy;
- update `uiState.reloading`/`reloadError` directly from notifications;
- remove redundant unused bridge layers;
- test live start, success, failure, supersession, selection change, and destroy behavior.

### Success occurs before pager handoff

The coordinator calls `status.success()` immediately after synchronous `onReloadComplete`, while AGENTS.md correctly states `SplatMesh.initialized` precedes pager attachment. Therefore the pane can claim completion before:

```ts
replacementMesh.paged?.pager === newRealRenderer.pager
```

Make activation/readiness asynchronous:

- attach the initialized replacement mesh to the stable wrapper;
- wait through a bounded, cancellation-aware render/update mechanism for public pager identity equality;
- confirm the pager is not disposed and has the normalized capacity;
- only then resolve reload and emit success;
- on timeout/failure, emit error and leave a deterministic recoverable scene state;
- superseded/destroyed generations must cancel readiness and dispose their replacement.

Use animation/render events or another public event-driven mechanism, not fixed sleeps.

### Stub and e2e do not model/assert handoff

The stub defines pager objects but never assigns `mesh.paged.pager` during its render/update path. Existing capacity tests only verify the input is rounded and no error text appears.

Extend the stub so its public behavior models Spark's relevant handoff:

- driving renderer discovers the active nested stub SplatMesh during render/update;
- assigns its pager to `mesh.paged.pager`;
- exposes stable test diagnostics for renderer, pager, mesh, generation, active-mesh count, disposed state, and capacity.

Capacity e2e must assert:

- reload progress becomes visible, then clears;
- old/new renderer IDs differ;
- old/new pager IDs differ and old is disposed;
- old/new mesh IDs differ and old is disposed;
- new `PagedSplats.pager` ID equals the new driving renderer pager ID;
- capacity equals the normalized input;
- exactly one active mesh remains;
- rapid edits settle on the final capacity/generation;
- wrapper transform and another Spark setting persist;
- destroy/remount produces no late activation.

### Verification report confuses stub with real Spark

When `VITE_E2E_STUB_SPARK=true`, Spark classes and splat rendering are stubbed. A remote Baby Yoda URL in that build is not real Spark paging/rendering.

- Describe stub verification only as stub behavior.
- Perform a real non-stub check for the actual RAD capacity reload.
- If GPU stalls block native pointer commands, use handler-level DOM dispatch/evaluate for the pane input as allowed by AGENTS.md, then inspect public debug state and screenshots. State clearly which parts prove handler behavior versus native actionability.
- Do not claim real splat rendering from the stub.

## Source-sync test quality

The new transaction tests manually reproduce the extension's transaction object rather than testing production code. Extract a small production helper used by the extension to build/describe the root `settings` transaction, then test that helper with the public transactions contract. Keep writable-setter undo/redo tests.

Direct dev-server source-sync/undo remains desirable. If GPU stalls prevent native actions, use the same DOM-dispatch diagnostic and inspect the actual source edit/history result. Restore the intended authored value before final status.

## Files likely involved

- `src/lib/spark/SparkReloadRuntime.ts`
- `src/lib/spark/SparkReloadStatusBridge.ts` (remove or connect properly)
- `src/lib/spark/SparkControls.ts`
- `src/lib/components/SparkSplats.svelte`
- `src/lib/components/SparkStudioBridge.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- a small production transaction helper
- Spark stub, coordinator/transaction unit tests, e2e tests
- `AGENTS.md`

## Constraints

- Preserve public API use, dual renderers, real-camera LOD ownership, stable wrapper, coordinator generation cancellation, and settings behavior.
- No fixed delays for readiness.
- Do not expose `enableDriveLod`.
- Do not regress existing tests.
- Do not commit the user's unrelated `package-lock.json`.

## Acceptance criteria

- Open pane visibly transitions idle → reloading → success/error from coordinator notifications.
- Status subscriptions clean up on selection change, remount, and destroy.
- Reload success occurs only after public mesh/renderer pager identity matches and capacity is confirmed.
- Stub genuinely models pager attachment.
- Capacity e2e directly verifies old/new identities, disposal, attachment, capacity, single active mesh, rapid final-wins, and preserved state.
- Production transaction helper is exercised by tests.
- Real non-stub Baby Yoda capacity reload is performed and clearly distinguished from stub verification.
- Source-sync/undo evidence uses production transaction logic and, if feasible, actual dev source/history.
- Check, lint, all unit tests, full e2e, and build pass.
- AGENTS.md/status contain no contradictory claims.

## Tests to run

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

## Things Pi must not change

- Do not add another unconnected status bridge.
- Do not signal success at mesh initialization alone.
- Do not assert pager handoff from input normalization.
- Do not call a stub build real Spark rendering.
- Do not duplicate production transaction logic only inside tests.
- Do not include unrelated changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Reactive status subscription lifecycle
2. Async pager-readiness mechanism and cancellation
3. Direct old/new identity/capacity evidence
4. Stub modeling and capacity e2e assertions
5. Production transaction helper/source-sync evidence
6. Real non-stub Baby Yoda capacity/recovery evidence
7. Stub versus real distinction
8. Acceptance checklist
9. Exact all-green results
10. Files changed
11. Remaining non-core limitations
12. Commit hash(es)

Update `AGENTS.md` concisely with verified final behavior. Remove the unused bridge or document its real subscription path.

Always write `status.md` as the last action before committing and pushing. Re-check every acceptance item first. After the final push, do not verify, inspect, or modify anything.
