# Final verification correction: remove masked assertions

## Objective

Preserve the completed scene architecture and reported green suite. Correct the remaining cases where tests currently pass without proving their stated claim. This mission is limited to production helper extraction/diagnostics and strict lifecycle/source-persistence evidence.

## Verified issues

### 1. Owned-helper counting checks the wrong property

Helpers are branded at:

```ts
helper.userData.__camera_frustum_helper_owned = true
```

but `ownedHelperCount` checks:

```ts
(child as Record<string, unknown>)[HELPER_BRAND] === true
```

It therefore never observes the brand. The fallback `if (ownedCount === 0 && helper && helper.parent) ownedCount = 1` masks this bug and cannot detect stale attached helpers after the component sets `helper = null`.

Count the actual `child.userData[HELPER_BRAND]` values in the scene. Remove the fallback. The diagnostic must independently inspect scene state, not infer it from the component's current variable.

### 2. Parent and target identity assertions are not exact

The “scene root” test only asserts that `helperParentUuid` is non-null. The target test only asserts that the UUID is stable across reselection. Neither proves the claimed identity.

Expose a stub-only `sceneUuid` and the intended app-camera UUID through a narrow existing diagnostic/debug contract. Assert:

- `helperParentUuid === sceneUuid`
- `targetCameraUuid === appCameraUuid`
- exactly one branded owned helper is found by independent scene inspection

Keep all new diagnostic fields stub-only and safely removed on destruction.

### 3. Unit tests duplicate rather than test production camera resolution

`tests/unit/cameraFrustumHelper.test.ts` contains its own copy of `findAllDescendantCameras()`. The production component could regress while the copied test stays green.

Extract the pure resolver into a small production TypeScript module, import it from both `CameraFrustumHelper.svelte` and the unit test, and test zero/one/multiple/deeply nested cases against the actual function.

### 4. Studio source-target assertion has a fallback that does not prove the target

The Baby Yoda metadata test conditionally skips the `baby_yoda.svelte` assertion when `userData.threlteStudio` is absent and instead accepts generic Threlte-ish keys.

Remove this fallback. In the supported Studio e2e build, require source metadata to exist and require its exact source path/identifier to include `src/lib/scenes/baby_yoda.svelte` (normalize separators if necessary). Failure to provide target metadata must fail the test.

### 5. Remount and disposal tests do not prove their names

The wrapper remount test only asserts that a wrapper exists after remount. It does not assert that a scene-authored transform persists.

Do not claim that an imperative runtime mutation should survive remount unless Studio has persisted it into source. Instead:

- keep the capacity-reload test for runtime stable-wrapper preservation;
- strictly prove the wrapper's Studio source target;
- add explicit literal transform attributes to the Baby Yoda wrapper if required for source sync authorability, using the scene's intended identity transform unless product appearance calls for another value;
- assert those complete declarative position/rotation/scale values before and after remount.

This demonstrates remount persistence from scene source without changing the intended Baby Yoda placement.

The SparkControls remount test only proves that a Spark hierarchy item reappears. It does not prove `dispose()` was called exactly once. Add a narrow stub-only disposal counter keyed by controller identity, or a focused lifecycle harness, and assert one dispose for the old instance and zero premature disposals for the new instance. Do not substitute the class's idempotency test for runtime exactly-once ownership.

### 6. Editor-camera wording exceeds its evidence

The e2e test proves app-camera coordinates and active ownership remain correct. It does not directly inspect editor-camera orientation. Either add an exact editor-camera orientation assertion across frames or phrase the status evidence narrowly and rely on the inspected `appCamera.lookAt(...)` source for the non-interference conclusion. Do not claim the current position-only assertion proves editor orientation.

## Files likely involved

- `src/lib/studio/scroll-animator/CameraFrustumHelper.svelte`
- new small production helper resolver under `src/lib/studio/scroll-animator/`
- `src/lib/components/SceneRuntime.svelte` or an existing stub diagnostic surface
- `src/lib/scenes/baby_yoda.svelte`
- focused unit/e2e tests
- `AGENTS.md`

Do not change routing, Spark rendering/reload behavior, or general scene composition.

## Constraints

- Keep `/scene/{sceneName}` and `src/lib/scenes/`.
- Keep scene-owned literal wrapper declarations and lean scene files.
- Keep diagnostics absent from production and safely torn down.
- Keep exact-one camera behavior and Studio-owned direct-camera helpers.
- Keep the app camera/editor camera ownership correction.
- Preserve all deterministic Spark progress/reload coverage.
- Do not add a production scene for tests.
- Do not modify the user's unrelated `package-lock.json`.

## Acceptance criteria

1. Owned-helper count reads the helper brand from `userData`, has no component-state fallback, and detects stale branded helpers independently.
2. Tests assert exact scene-root parent UUID and exact app-camera target UUID.
3. Zero/one/multiple descendant resolution tests import and exercise the production resolver.
4. The helper diagnostic remains stub-only and is removed safely on destroy.
5. The Baby Yoda wrapper metadata test fails unless the exact scene source target is present.
6. Baby Yoda declares source-syncable position, rotation, and scale on its wrapper and their full values are asserted before/after remount.
7. Capacity reload still preserves all nine runtime wrapper transform values.
8. Runtime lifecycle evidence proves the old scene's SparkControls is disposed exactly once and the new instance is distinct/not prematurely disposed.
9. Editor-camera evidence and report wording match exactly; no overclaim remains.
10. `npm run check` reports zero errors and zero warnings.
11. Lint, unit, full e2e, and build all pass.
12. `AGENTS.md` documents only the final accurate contracts and source references.

## Tests to run

- `npm run check`
- `npm run lint`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`

Run the complete commands after the focused tests. Report exact totals and warning counts.

## Things Pi must not change

- Do not retain the owned-count fallback.
- Do not keep copied production logic in the unit test.
- Do not retain conditional source-target assertions.
- Do not claim existence-after-remount proves transform persistence or disposal.
- Do not expose diagnostics in production.
- Do not change unrelated application behavior, dependencies, or generated files.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. The corrected brand lookup and independent scene count.
2. Exact parent/target identity evidence.
3. Production resolver extraction and direct unit coverage.
4. Strict Baby Yoda source-target result.
5. Declarative wrapper transform values and reload/remount assertions.
6. Exactly-once SparkControls lifecycle evidence.
7. Precisely scoped editor-camera evidence.
8. Changed files and rationale.
9. Acceptance checklist mapped to unconditional assertions.
10. Exact full-suite results.
11. Concise `AGENTS.md` update confirmation.

Always write `status.md` as the final content change before committing and pushing. Re-check every criterion before writing it. After the report is written, perform no more verification or modification. Commit all intended files, push the current branch, and stop.
