# Status: Spark reload ownership finalized, non-vacuous evidence added

## Summary

Finalized the Spark reload activation ownership and rollback contract. Added deterministic stub controls for progress visibility, exact old/new ID assertions, unconditional wrapper transform persistence, final-generation ownership, and mid-reload selection behavior. All acceptance criteria met.

## Final activation ownership and rollback contract

**Phases:**
1. **Before activation callback:** Coordinator owns the newly created mesh and its `dispose()` function. If superseded or destroyed before `onReloadComplete`, the coordinator calls `dispose()` on the mesh directly.
2. **During activation (attachment):** Component owns the replacement mesh. It removes the old mesh from `SplatWrapper` and adds the new one. The coordinator awaits the `onReloadComplete` callback; `requestReload()` and `isReloading` remain pending.
3. **During pager handoff:** Component polls via RAF for `mesh.paged.pager === realRenderer.pager`. Three failure modes trigger rollback:
   - **Rejection:** `catch` block calls `detachMesh()` if this generation is still current, then re-throws.
   - **Supersession:** `waitForPagerHandoff` resolves (doesn't reject). Post-handoff check detaches the superseded mesh if a newer generation has taken over.
   - **Destroy:** `onDestroy` sets `destroyed = true`, disposes coordinator and current mesh. In-flight callback sees `destroyed` and exits cleanly.
4. **Confirmed pager handoff:** Replacement becomes the sole active mesh. Coordinator publishes `status.success()`.

**Idempotency:** `detachMesh()` checks `wrapper.children.includes(mesh)` before removing. `dispose()` is idempotent (stub sets `disposed = true`). An older generation cannot detach the newest mesh: `coordinator?.generation === generation && mesh === newMesh`.

## Exact supersession/failure/destroy behavior

| Scenario | Behavior | Verified by |
|----------|----------|-------------|
| Activation rejects after attachment | `detachMesh()` called exactly once on failed replacement; coordinator catches, calls `status.fail()` | Unit: `rejection after attachment` |
| Gen 1 attached, gen 2 fires during handoff | Gen 1's `waitForPagerHandoff` resolves; post-handoff check detaches gen 1 mesh; gen 2 completes normally | Unit: `supersession after activation starts` |
| Destroy during attached activation | `onDestroy` disposes current mesh and coordinator; no late status emitted | Unit: `destroy after activation starts` |
| Superseded gen cannot publish stale status | Coordinator checks `generation === current` before any terminal status | Unit: `superseded async activation cannot publish stale terminal state` |

## Acceptance table

| Acceptance criterion | Test or evidence | Result |
|----------------------|-----------------|--------|
| Async activation keeps `requestReload()`/`isReloading` pending until pager match | Unit: `coordinator signals success after async completion resolves` | ✅ |
| Activation rejects after attachment → rollback cleanup | Unit: `rejection after attachment invokes rollback cleanup exactly once` | ✅ |
| Gen 1 superseded by gen 2 → gen 1 detached, gen 2 unaffected | Unit: `supersession after activation starts` | ✅ |
| Destroy during attached activation → no late status, no leaked mesh | Unit: `destroy after activation starts: no late status emitted` | ✅ |
| Deterministic progress visible while gate closed, clears on release | E2E: `stub capacity reload: deterministic progress visible then clears` | ✅ |
| Exact old/new mesh IDs, old disposed, new pager === drivingPagerId, normalized capacity, one active mesh | E2E: `stub capacity reload: exact old/new IDs, disposal, pager handoff` | ✅ |
| Non-default wrapper transform set before reload, asserted identically after | E2E: `stub capacity reload: wrapper transform and other settings persist` | ✅ |
| Rapid edits settle on final generation/capacity owning sole mesh/pager | E2E: `stub capacity reload: rapid edits settle on final generation` | ✅ |
| Mid-reload selection change updates pane in place | E2E: `stub mid-reload selection change: pane updates in place` | ✅ |
| `npm run check` 0 errors, 0 warnings | Command output | ✅ |
| `npm run lint` clean | Command output | ✅ |
| `npm run test:unit` green | 245 passed | ✅ |
| `npm run test:e2e` green | 57 passed | ✅ |
| `npm run build` success | Command output | ✅ |

## Exact old/new IDs and generation diagnostics

The `exact old/new IDs` e2e test:
1. Captures `oldActiveMeshId` (last non-disposed mesh ID) and `oldDrivingPagerId` before reload
2. Triggers capacity edit (halves current capacity)
3. After reload: asserts `oldMeshDisposed === true`, `oldPagerDisposed === true`
4. Asserts `newActiveMeshId !== oldActiveMeshId`
5. Asserts `newActiveMeshPagerId === drivingPagerId`
6. Asserts `drivingPagerMaxSplats` equals normalized capacity
7. Asserts `activeMeshCount === 1`

The `rapid edits` e2e test:
1. Fires three rapid capacity edits: 131072 → 196608 → 262144
2. Asserts final input value is 262144
3. Asserts `drivingPagerMaxSplats === 262144`
4. Asserts `activeMeshCount === 1`
5. Asserts `activeMeshPagerId === drivingPagerId`

The `transform persistence` e2e test:
1. Sets wrapper position to `(7, 13, 21)`, rotation to `(0.3, 0.5, 0.7)`, scale to `(1.5, 1.5, 1.5)`
2. Triggers capacity reload
3. Unconditionally asserts all 9 transform values identical after reload

## Changed files and rationale

| File | Change |
|------|--------|
| `src/lib/components/SparkSplats.svelte` | Added `detachMesh()` helper; added post-handoff supersession check; added `getWrapper()` export; added test-only wrapper registration hook |
| `src/lib/components/RadStoryScene.svelte` | Updated `splatsRef` type to include `getWrapper` |
| `tests/fixtures/spark-stub.ts` | Added `__stubActivationGate` for deterministic pager withholding; added `_testWrapper` and `__spark_stub_set_wrapper` hook; added `wrapper` and `drivingGeneration` to diagnostics |
| `tests/unit/SparkReloadCoordinator.test.ts` | Added 3 tests: rejection after attachment, supersession after activation starts, destroy after activation starts |
| `tests/e2e/rad-story.spec.ts` | Replaced stub capacity section: deterministic progress test, exact old/new IDs test, final-generation rapid edits, unconditional transform persistence, mid-reload selection, subscription lifecycle |
| `AGENTS.md` | Added activation ownership/rollback section; updated stub diagnostics and e2e descriptions |

## Exact command results

```
$ npm run check
svelte-check found 0 errors and 0 warnings

$ npm run lint
(no output — clean)

$ npm run test:unit
Test Files  14 passed (14)
Tests  245 passed (245)

$ npm run test:e2e
57 passed (25.0s)

$ npm run build
✓ built in 4.52s
```

## Remaining limitations

1. **Real Spark manual evidence not re-run:** Production pager/attachment behavior was not materially changed (only rollback cleanup added). Prior real Spark evidence (Baby Yoda capacity reload 1048576 → 524288, GPU stall workarounds) remains valid.
2. **Wrapper transform test is stub-only:** The unconditional transform assertion uses `__spark_stub_diagnostics.wrapper`. In production, the wrapper is preserved by design (stable `Object3D` child swap), but a non-default transform cannot be set imperatively in the e2e stub without the diagnostic hook.
3. **Pager handoff timeout is bounded (5s):** If the driving renderer's pager is never created (e.g., Spark worker failure), `waitForPagerHandoff` rejects after 5s. The rollback cleanup detaches the replacement mesh, leaving `mesh = null` and the wrapper empty. A subsequent reload request can recover.
