# Final follow-up mission: metadata notification and documentation accuracy

## Objective

Close three small verification issues without changing the completed Spark
configuration/source-sync design:

1. Same-controller reattachment must notify subscribers when `profileName`
   changes, not only when `sourceSyncEnabled` changes.
2. Remove stale `createSceneObjects(profile, profileName, ...)` documentation
   from AGENTS.md.
3. Make the final status report accurate: the last diff added 11 runtime
   capability tests, not 14.

## Files likely involved

- `src/lib/studio/spark-controls/activeSparkControlsRuntime.ts`
- `tests/unit/activeSparkControlsRuntime.test.ts`
- `AGENTS.md`
- `.codex-handoff/status.md`

## Constraints

- Capture the previous profile name before updating registration state, and
  notify when controller identity, profile name, or source-sync capability
  changes.
- Add a focused unit test that reattaches the same controller with a different
  profile name and unchanged source-sync permission, then verifies one
  notification and the new `profileName` value.
- Correct both stale AGENTS.md references:
  - key-file summary must say
    `createSceneObjects(profileName, profileSettings)`;
  - scene-contract example must call
    `createSceneObjects(profile.profileName)` (or the exact current equivalent),
    not the removed full-profile argument.
- Correct test-count claims in the final report. Prefer describing covered
  cases over fragile numeric counts, but any number stated must match the diff.
- Pi's replicated `buildTransaction` write test remains accepted. Do not revisit
  the internal import.
- No dedicated tests for removed legacy query parameters are required.

Critical implementation shape:

```ts
const previousProfileName = this._profileName
// update active registration
if (
  previous !== controls ||
  previousProfileName !== this._profileName ||
  previousSyncEnabled !== this._sourceSyncEnabled
) {
  // notify
}
```

Use the project's actual formatting and names.

## Acceptance criteria

- [ ] Same-controller profile-name-only reattachment notifies subscribers.
- [ ] Existing controller replacement, permission-change notification, and
      stale-detach behavior remain unchanged.
- [ ] A focused unit test covers the profile-name-only metadata change.
- [ ] AGENTS.md contains no obsolete `createSceneObjects(profile,
      profileName, ...)` call/signature.
- [ ] The completion report accurately describes changed tests and results.
- [ ] `npm run check`, `npm run lint`, `npm run test:unit`, and
      `git diff --check` pass. Run broader tests only if these small changes
      unexpectedly touch broader behavior.

Re-check every acceptance item before finalizing.

## Tests to run

- Add the focused runtime unit test described above.
- Run `npm run check`.
- Run `npm run lint`.
- Run `npm run test:unit`.
- Run `git diff --check`.

Trust existing reported e2e/build results for the unchanged feature behavior;
rerun them only if necessary because of an unexpected wider edit.

## Things Pi must not change

- Do not change baseline values, renderer option mapping, source-sync policy,
  query behavior, scene files, camera behavior, or persistence format.
- Do not add/remove legacy-query tests.
- Do not alter the accepted transaction-write test.
- Do not refactor runtime listener signatures or unrelated tests.
- Do not modify dependencies or `node_modules`.

## AGENTS.md update

Keep AGENTS.md concise and fresh-session useful. Only correct the obsolete
`createSceneObjects` signature/call and, if needed, clarify that same-controller
profile or permission metadata changes notify subscribers.

## Expected completion report

Write `.codex-handoff/status.md` with:

1. Exact runtime condition changed.
2. Documentation corrections.
3. Focused test added and command results.
4. Acceptance checklist.
5. Final commit hash and pushed branch.

Complete code, tests, documentation, and acceptance review first. Write
`status.md` as the last action before the final commit/push, then perform no
further verification or modification after pushing.
