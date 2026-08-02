# Status: Fix double-scaled camera diagnostic progress

## Root Cause

`CameraDiagnostics.svelte` assigned `cameraProgress = v * 100` where `v` is already a `0..100` percentage from `scrollAnimatorRuntime.percentage`. This produced values up to `10000` in `data-progress`, which passed existing e2e assertions like `progress > 95` because `10000 > 95`.

## Correction

Changed `cameraProgress = v * 100` to `cameraProgress = v` in `CameraDiagnostics.svelte`. Added a unit test that would fail against the double-scaling pattern.

## Changed Files

| File | Change |
|------|--------|
| `src/lib/components/CameraDiagnostics.svelte` | `cameraProgress = v * 100` → `cameraProgress = v` (with clarifying comment) |
| `tests/unit/cameraDiagnosticsGating.test.ts` | Added "no double-scaling" assertion: verifies `cameraProgress = v` (not `v * 100`) |
| `tests/e2e/rad-story.spec.ts` | Added intermediate-scroll assertion (30-70% range) and upper-bound checks (`<= 100.01`) on full-scroll and keyframe-jump progress values |
| `tests/e2e/scene-routing.spec.ts` | Added upper-bound check (`<= 100.01`) on scroll-100% progress |
| `tests/e2e/playback-edit.spec.ts` | Added upper-bound check (`<= 100.01`) on scroll-100% progress |
| `AGENTS.md` | Clarified `data-progress` is `0..100` sourced directly from `scrollAnimatorRuntime.percentage`; noted no-double-scaling unit test |

## Strengthened Assertions

- **rad-story.spec.ts**: Intermediate scroll at 50% asserts `progress >= 30 && progress <= 70 && progress <= 100.01`. Full scroll asserts `progress > 90 && progress <= 100.01`. Keyframe jump to 100% asserts `progress > 95 && progress <= 100.01`.
- **scene-routing.spec.ts**: Scroll 100% asserts `progress > 95 && progress <= 100.01`.
- **playback-edit.spec.ts**: Scroll 100% asserts `progress > 95 && progress <= 100.01`.
- **cameraDiagnosticsGating.test.ts**: Source-level assertion that `cameraProgress = v` (not `v * 100`).

## Tests Run

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run test:unit` | 437 passed (27 files) |
| `npm run test:e2e` | 138 passed |
| `git diff --check` | Clean |

## Acceptance Criteria Checklist

- [x] `data-progress` within `0..100` for all scroll positions in e2e stub builds
- [x] At bottom of ScrollTrigger range, `data-progress` ~100 (not 10000)
- [x] Intermediate scroll assertion demonstrates `data-progress` in expected `0..100` range
- [x] Compile-time `VITE_E2E_STUB_SPARK` gate intact
- [x] Normal builds still instantiate no camera diagnostic component
- [x] Camera coordinates, target coordinates, active-camera, routing, playback/edit unchanged
- [x] Focused automated tests fail against double-scaling and pass after fix
- [x] No diagnostic state or calls restored to `SceneRuntime` hot paths
- [x] `scrollAnimatorRuntime.percentage` unchanged (still `0..100`)

## Commit

`c8e7155` → `809aca1` → pushed to `main`
