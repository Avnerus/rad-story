# Mission: finalize Spark reload ownership and non-vacuous evidence

## Objective

Keep the now-correct awaited activation contract, and close the remaining ownership and verification gaps:

1. An initialized replacement that enters the async activation callback must be deterministically detached/disposed if that activation is superseded, destroyed, or fails.
2. The e2e suite must directly prove exact old/new object lifecycle, a genuinely non-default wrapper transform, final generation ownership, and a deterministic visible-progress interval.
3. The completion report must state the actual pushed commit identity and must not claim assertions that the tests do not perform.

Do not redesign the Spark controls or renderer architecture.

## Files likely involved

- `src/lib/spark/SparkReloadRuntime.ts`
- `src/lib/components/SparkSplats.svelte`
- `tests/unit/SparkReloadCoordinator.test.ts`
- `tests/e2e/rad-story.spec.ts`
- `tests/fixtures/spark-stub.ts`
- `AGENTS.md`

## Constraints and critical guidance

- Preserve `onReloadComplete: void | Promise<void>` and the coordinator awaiting it.
- Define ownership explicitly across these phases:
  - before activation callback: coordinator owns the newly created mesh/disposer;
  - while/after attachment: component ownership must include rollback cleanup;
  - on confirmed current-generation pager handoff: replacement becomes the sole active mesh.
- A replacement attached by a generation that is later superseded or destroyed must not remain in the wrapper or diagnostics as active. A failed pager handoff must leave a deterministic recoverable state and no leaked attached replacement.
- Cleanup must be safe and idempotent. Avoid double-disposal and do not allow an older generation to detach the newest mesh.
- Add tests for supersession/failure after the activation callback has already begun, not only while the mesh factory is pending.
- Do not add arbitrary production delays. A test-only stub activation gate/frame control is appropriate for deterministic progress assertions.
- Leave the user’s uncommitted `package-lock.json` untouched.

## Acceptance criteria

- Async activation success still keeps `requestReload()` and `isReloading` pending until pager identity matches.
- If activation rejects after attachment, the failed replacement is detached/disposed exactly once and cannot remain the active mesh.
- If generation 1 is attached and waiting when generation 2 supersedes it, generation 1 is detached/disposed without affecting generation 2; after settlement exactly one current mesh remains.
- Destroy during attached activation cleans up without late success/failure or leaked active mesh.
- The progress e2e uses deterministic stub control to prove `spark-reloading` is visible while pager attachment is intentionally withheld, then releases attachment and proves it clears.
- Exact lifecycle e2e captures the pre-reload active mesh ID and driving pager ID, then proves:
  - those exact old objects are disposed/non-current;
  - the exact new active mesh ID differs;
  - its pager ID equals the new `drivingPagerId`;
  - that exact pager has the normalized requested capacity;
  - exactly one active mesh remains.
- Transform persistence e2e sets the wrapper to an unmistakable non-default transform before reload and unconditionally asserts the same position/rotation/scale afterward. Do not use a nullable scene lookup with conditional assertions. Expose a narrow stub diagnostic/test hook if needed.
- Rapid-edit e2e proves the final requested generation/capacity owns the sole active mesh/pager, not just that an input and aggregate capacity agree.
- The pane’s mid-reload selection behavior has an automated assertion, or the status report clearly identifies it as code inspection rather than tested evidence.
- `npm run check` has 0 errors and 0 warnings; lint, unit, e2e, and build remain green.
- Re-check every acceptance item before finalizing.

## Tests to add or strengthen

- Unit/component-level ownership tests:
  - rejection after attachment invokes rollback cleanup exactly once;
  - supersession after activation starts cleans generation 1 but not generation 2;
  - destroy after activation starts cleans the attached replacement;
  - no stale terminal status is emitted.
- Stub e2e:
  - explicit test-only pause/release of pager assignment for progress visibility;
  - exact pre/post mesh and pager IDs with exact disposed/current assertions;
  - diagnostic generation/request identity tied to the active mesh/pager for rapid edits;
  - non-default wrapper position, rotation, and scale set and asserted unconditionally after reload;
  - mid-reload select/reselect assertion if feasible.
- Run `npm run check`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, and `npm run build`.
- Trust the prior real Spark manual evidence; repeat it only if production pager/attachment behavior materially changes.

## Things Pi must not change

- Do not remove or reduce the `Spark` object, its 22 controls, cone-angle controls, or quality parameters.
- Do not change corrected degree defaults or the documented frustum/foveation conclusion.
- Do not replace the stable wrapper, dual renderers, real-camera LOD ownership, or source-sync transaction design.
- Do not add private Studio imports, singleton reload state, production sleeps, whole-scene remounting, or unrelated changes.
- Do not weaken or conditionally skip assertions.
- Do not modify `package-lock.json`.

## Documentation and expected completion report

Update `AGENTS.md` concisely with fresh-session-relevant ownership/rollback behavior, deterministic stub controls, and exact diagnostic fields/source references. Do not add a full implementation diary.

Write `.codex-handoff/status.md` with:

1. Final activation ownership and rollback contract.
2. Exact supersession/failure/destroy behavior.
3. Acceptance table mapping each claim to an actual unconditional assertion.
4. Exact old/new IDs and generation diagnostics asserted by e2e.
5. Changed files and rationale.
6. Exact command results.
7. Remaining limitations, separating code inspection, stub evidence, and real Spark evidence.
8. The actual final pushed commit hash, or clearly explain if the report commit necessarily precedes a final metadata-only commit.

Always write `status.md` as the last content change before committing and pushing. Do not perform more verification or modifications after pushing. Re-check every acceptance criterion immediately before finalizing.
