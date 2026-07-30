# Mission: close Spark reload activation lifecycle and evidence gaps

## Objective

Finish the `Spark` controls implementation by making capacity reload completion truly represent full mesh activation: the replacement mesh must be attached to the current driving pager before the coordinator promise resolves, `isReloading` clears, or success is reported. Fix the new Svelte reactivity warning and strengthen the existing stub tests so their assertions directly prove the behavior claimed in the status report.

Do not redesign the feature. Preserve the current `Spark` outline object, 22 live controls, stable wrapper, dual-renderer routing, and public pager-identity approach.

## Files likely involved

- `src/lib/spark/SparkReloadRuntime.ts`
- `src/lib/components/SparkSplats.svelte`
- `src/lib/components/RadStoryScene.svelte`
- `src/lib/studio/spark-controls/SparkControlsExtension.svelte`
- `tests/unit/SparkReloadCoordinator.test.ts`
- `tests/e2e/rad-story.spec.ts`
- `tests/fixtures/spark-stub.ts` only if deterministic activation control is needed
- `AGENTS.md`

## Constraints and critical implementation guidance

- Change the coordinator completion callback type to allow `void | Promise<void>` and `await` it inside `_doReload`.
- A reload request must remain pending through replacement attachment and pager handoff. `requestReload()` and `isReloading` must not finish early.
- Callback rejection must be caught by the coordinator for the current generation, reported through `status.fail(...)` and `onReloadError`, with no unhandled rejection or permanently stuck status.
- Centralize success/failure ownership enough that each current generation has one coherent terminal result. Do not let a superseded generation clear or fail the current generation.
- Preserve race safety: superseded meshes are disposed, only the latest generation becomes authoritative, and destroy cancels safely.
- Make `splatsRef` and `bridgeRef` correctly reactive in Svelte 5 (for example, typed `$state(...)`) so `onMeshReload={splatsRef?.reload}` is reliably updated and `npm run check` has no warning from this feature.
- When subscribing to `SparkControls.reloadStatus`, immediately initialize the pane from its current `isReloading` and `error` values. Selecting `Spark` midway through a reload must show the current state without waiting for another notification.
- Continue using public Spark APIs/fields already established by the implementation. No private Threlte Studio imports or timing sleeps.
- Leave the user's uncommitted `package-lock.json` change untouched.

## Acceptance criteria

- `SparkReloadCoordinator.requestReload()` resolves only after an async completion/activation callback resolves.
- `SparkReloadCoordinator.isReloading` remains true for that full interval.
- Async completion rejection is caught and produces the expected current-generation failure notification without an unhandled rejection.
- Superseded async activation cannot publish success/failure for the newest generation.
- The Spark pane visibly reflects an already-running reload when the object is selected mid-reload.
- Capacity reload still preserves the stable wrapper and its authored transform plus unrelated Spark settings.
- After reload, the active replacement mesh's pager ID directly equals `drivingPagerId`; that exact driving pager has the normalized requested `maxSplats`; the replaced pager/mesh identities are explicitly shown disposed; exactly one current active mesh remains.
- Rapid edits settle on the final normalized capacity and final driving pager/mesh generation, with no stale active mesh or stale UI state.
- The progress test directly observes the reloading state as true before observing it clear. Make stub activation deterministically controllable if the current microtask is too fast; do not merely wait for the final false state.
- `npm run check` reports zero errors and no warning introduced by the Spark implementation.
- Re-check every acceptance item before finalizing.

## Tests to add or strengthen

- Unit: async completion callback keeps the coordinator promise and `isReloading` pending until explicitly resolved.
- Unit: async completion callback rejection is caught, status fails once for the current generation, and error callback is invoked.
- Unit: supersession/destroy during async activation cannot publish a stale terminal state.
- E2E: deterministically assert progress becomes visible, then clears after pager attachment.
- E2E: assert the active replacement mesh pager ID equals `drivingPagerId`, and the pager with that ID has the normalized requested capacity.
- E2E: assert exact old/new identities and disposal/current-active state rather than aggregate `contains`/`at least one` checks.
- E2E: set a non-default wrapper transform before capacity reload and assert its exact values afterward; also retain an unrelated quality setting.
- E2E: rapid capacity edits assert final diagnostic capacity and exactly one current active mesh.
- Run `npm run check`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, and `npm run build`.
- A new real-GPU manual run is optional unless these fixes change production pager behavior beyond awaiting the already-existing callback. Report clearly whether it was run.

## Things Pi must not change

- Do not remove, rename, or reduce the `Spark` outline object or its 22 controls.
- Do not revert corrected degree-based cone defaults or change the documented frustum/refinement explanation.
- Do not replace the stable `SplatWrapper` or dual SparkRenderer architecture.
- Do not add arbitrary delays, private Studio imports, global singleton reload state, or remount the whole scene.
- Do not alter ScrollAnimator, camera ownership, scroll behavior, unrelated UI, or `package-lock.json`.
- Do not weaken existing tests to make them pass.

## Documentation and completion report

Update `AGENTS.md` with concise, fresh-session-relevant information and source references for the final async activation contract, reactive component refs, and deterministic diagnostic coverage. It does not need a full implementation log.

Write the report to `.codex-handoff/status.md` with:

1. Summary of the completion-contract fix.
2. Exact lifecycle and generation semantics.
3. Direct test evidence mapped to every acceptance criterion.
4. Changed files and why.
5. Exact command results.
6. Remaining limitations, clearly separating stub and real Spark evidence.
7. Final commit hash.

Always write `status.md` as the last action before committing and pushing. After pushing, perform no more verification or modifications. Re-check that every acceptance criterion above is met immediately before finalizing the mission.
