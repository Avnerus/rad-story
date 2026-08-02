# Mission: Remove test-only diagnostics from production hot paths

## Objective

Improve runtime performance by ensuring debug/diagnostic work that exists solely for automated tests does not execute on every animation frame or ScrollTrigger update in normal builds. Gate that work with a Vite environment variable used only by tests, while preserving all production camera, animation, Studio, and rendering behavior and preserving the e2e diagnostic contract in test builds.

Prefer the existing test-only `VITE_E2E_STUB_SPARK=true` build flag unless a narrowly named diagnostic flag is demonstrably necessary. Application code must read the flag through `import.meta.env` so Vite can statically replace it; do not make production hot paths depend on the runtime `window.__spark_stub` marker.

## Files likely involved

- `src/lib/components/SceneRuntime.svelte`
- `vite.config.ts`, `playwright.config.ts`, and/or `package.json` only if test command configuration needs adjustment
- A Vite environment declaration file under `src/` if TypeScript requires an explicit type for the selected variable
- Relevant unit/e2e tests under `tests/`
- `AGENTS.md`

Keep the scope narrow. Inspect other per-frame and per-scroll callbacks only enough to identify test-only diagnostics; do not broadly refactor runtime code.

## Constraints

- In `SceneRuntime`, the following are test diagnostics and should be absent or inert unless the test-only Vite flag is enabled:
  - camera/target world-coordinate snapshot updates used by `[data-testid="camera-state"]`
  - `cameraProgress` diagnostic updates
  - the per-frame `cameraIsActive` identity check
  - rendering/updating the hidden `camera-state` diagnostic element
- Avoid invoking a diagnostic function from the unconditional per-frame camera-look-at task or from the unconditional ScrollTrigger callback. A condition only inside a function that is still called on every frame/scroll is weaker than desired; structure the code so production does not make the diagnostic call at all, and preferably does not register a diagnostic-only Threlte task.
- Keep the real per-frame `cameraTarget.getWorldPosition(...)` plus `appCamera.lookAt(...)` behavior. That is application functionality, not debug work.
- Keep scene traversal and `ScrollAnimator.applyScrollPercentage()` on initial setup and ScrollTrigger updates.
- Keep `scrollAnimatorRuntime.updateProgress()` because it drives the Studio authoring UI; it is not merely a test diagnostic.
- Do not gate the editor `CameraFrustumHelper`'s per-frame `helper.update()`; the helper is a visible editor feature. Its window diagnostic may remain test-gated.
- Do not change the opt-in `StatsWidget` behavior (`?debug=true`); it is an explicitly requested user-facing performance display.
- Preserve the existing e2e-visible camera diagnostic schema and semantics when the test flag is enabled: `data-progress`, camera world coordinates, target world coordinates, and `data-active`.
- Prefer a compile-time constant such as:

  ```ts
  const testDiagnosticsEnabled = import.meta.env.VITE_E2E_STUB_SPARK === 'true'
  ```

  If introducing a separate variable, give it a precise name such as `VITE_E2E_DIAGNOSTICS`, enable it only in automated test build commands, type it, and document why it is separate. Do not expose a query parameter or runtime global as the new switch.
- Avoid per-frame allocations and avoid introducing polling, timers, or additional reactive work.
- Preserve all unrelated user changes and keep source-sync, reload, routing, and Spark settings behavior unchanged.

## Acceptance criteria

- A normal development or production build does not register a diagnostic-only frame task, update test-only camera/target/progress reactive state on scroll, or render the hidden `camera-state` test element.
- A Vite test build with the selected test-only environment variable retains the current camera diagnostic element and all attributes used by Playwright.
- Production still performs camera look-at every frame and applies all ScrollAnimators on initial setup and every ScrollTrigger update.
- Editor-camera toggle e2e assertions still observe correct `data-active` transitions in a test build.
- Scroll-position e2e assertions still observe current progress, camera coordinates, and target coordinates in a test build.
- The flag is statically read from `import.meta.env`, is enabled by test tooling only, and is not controlled by a URL parameter or `window` marker.
- Add focused automated coverage for the gating behavior. At minimum, prove the diagnostic is available in the configured e2e build; where practical, add a build/component-level assertion that it is omitted with the flag disabled or factor the condition into a small testable helper. Do not weaken existing e2e coverage.
- `AGENTS.md` is updated concisely with the current diagnostic gating contract and relevant source/test references. Remove or correct stale claims that imply the production runtime always renders or updates the camera diagnostic.
- Re-check every item in this Acceptance criteria section before finalizing.

## Tests to run

- Add and run focused new tests covering the environment-gated diagnostic behavior.
- `npm run check`
- `npm run test:unit`
- Run the relevant Playwright camera/scroll/routing specs that consume `[data-testid="camera-state"]`.
- Run the full `npm run test:e2e` if time/resources permit.
- Perform a normal build with the test flag unset and a test build with the flag enabled, confirming the intended compile-time/runtime behavior in both.

Report exact commands and outcomes, including any tests not run and why.

## Things Pi must not change

- Do not remove or reduce production camera look-at, ScrollAnimator playback, or Studio percentage propagation.
- Do not gate functional editor helpers, Spark rendering/reload work, or the opt-in FPS widget merely because they run frequently.
- Do not change camera keyframes, scene files, RAD URLs, Spark profile values, or source-sync transaction rules.
- Do not rename the existing diagnostic DOM attributes or alter their values in enabled test builds unless tests and this mission explicitly require it.
- Do not use `window.__spark_stub` as the primary build-time gate for hot-path diagnostics.
- Do not perform unrelated cleanup, dependency upgrades, or broad architecture changes.

## Expected completion report

Write `.codex-handoff/status.md` with:

- Summary of the implementation and chosen Vite variable
- Changed files and the purpose of each change
- Clear explanation of which per-frame/per-scroll operations no longer occur in normal builds
- Confirmation that functional hot-path work remains intact
- Tests added and all commands/results
- Acceptance-criteria checklist
- Any remaining risks or follow-ups
- Commit hash pushed to the current branch

Update `AGENTS.md` with concise, up-to-date feature information and source references suitable for a fresh agent session; it does not need a full implementation log.

Always write `status.md` as the final action before committing and pushing. After pushing, do not run more verification or make any modifications. Before writing the report, re-check that every acceptance criterion is met.
