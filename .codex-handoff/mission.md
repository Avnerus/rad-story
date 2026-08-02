# Follow-up mission: Fix double-scaled camera diagnostic progress

## Objective

Correct the e2e camera diagnostic progress regression introduced by the diagnostics extraction. `scrollAnimatorRuntime.percentage` already emits percentages in the `0..100` range, but `CameraDiagnostics.svelte` currently assigns `cameraProgress = v * 100`, producing values up to `10000`. Restore the existing `data-progress` semantics and strengthen tests so this cannot pass unnoticed again.

## Files likely involved

- `src/lib/components/CameraDiagnostics.svelte`
- Relevant Playwright specs that assert camera diagnostic progress:
  - `tests/e2e/rad-story.spec.ts`
  - `tests/e2e/scene-routing.spec.ts`
  - `tests/e2e/playback-edit.spec.ts`
- `tests/unit/cameraDiagnosticsGating.test.ts` only if a focused non-brittle contract assertion is useful
- `AGENTS.md` only if its current description needs clarification
- `.codex-handoff/status.md`

## Constraints

- Treat `scrollAnimatorRuntime.percentage` as a `0..100` store, as documented and implemented in `scrollAnimatorRuntime.ts`; do not change the shared runtime's units.
- Remove the extra scaling in `CameraDiagnostics`. The essential correction should be equivalent to:

  ```ts
  cameraProgress = v
  ```

- Preserve the Vite compile-time gate and the production performance improvement. Do not move diagnostic work back into `SceneRuntime` or add any production frame/scroll overhead.
- Preserve all camera/target coordinates, `data-active`, and other diagnostic attributes.
- Strengthen behavioral e2e assertions with meaningful upper bounds or expected ranges. Existing checks such as `progress > 95` allow `10000` and are insufficient on their own.
- Include at least one intermediate-scroll assertion that demonstrates `data-progress` tracks an expected value within `0..100`, plus a bottom-scroll assertion that is near 100 and never above 100 (allow a small rounding/timing tolerance only if actually needed).
- Avoid broad test rewrites or unrelated runtime changes.
- Preserve all unrelated user changes.

## Acceptance criteria

- `data-progress` remains within `0..100` for all scroll positions in e2e stub builds.
- At the bottom of the ScrollTrigger range, `data-progress` is approximately 100 rather than 10000.
- At an intermediate scroll position, `data-progress` reflects the corresponding percentage rather than merely satisfying a loose lower-bound assertion.
- The compile-time `VITE_E2E_STUB_SPARK` gate remains intact.
- Normal builds still instantiate no camera diagnostic component or diagnostic-only task.
- Existing camera coordinate, target coordinate, active-camera, routing, and playback/edit behavior remains unchanged.
- Focused automated tests fail against the double-scaling implementation and pass after the fix.
- Re-check every acceptance criterion before finalizing.

## Tests to run

- Run the focused Playwright specs/cases covering diagnostic progress in ad-hoc, routed playback, and edit modes.
- `npm run check`
- `npm run test:unit`
- Run `npm run test:e2e` if feasible; otherwise clearly report which focused e2e commands ran.
- `git diff --check`

Report exact commands and outcomes. Test results already reported for the buggy commit do not substitute for verifying this follow-up.

## Things Pi must not change

- Do not change `scrollAnimatorRuntime.percentage` from `0..100` to another unit.
- Do not weaken or remove existing e2e coverage.
- Do not restore diagnostic state or calls to `SceneRuntime` hot paths.
- Do not change camera animation, look-at behavior, ScrollTrigger behavior, scene data, Spark settings, source sync, routing, or dependencies.
- Do not perform unrelated refactors.

## AGENTS.md update

Keep `AGENTS.md` concise and fresh-session useful. Ensure it accurately states that the diagnostic `data-progress` value is a `0..100` percentage sourced directly from `scrollAnimatorRuntime.percentage`, with relevant source/test references. Do not add an implementation log.

## Expected completion report

Overwrite `.codex-handoff/status.md` with:

- Root cause and exact correction
- Changed files and purpose
- The strengthened bounded/intermediate progress assertions
- Exact test commands and results
- Acceptance-criteria checklist
- Remaining risks, if any
- Final pushed commit hash and branch

Always write `status.md` as the final action before committing and pushing. Before writing it, re-check every acceptance criterion. After pushing, do not run further verification or make modifications.
