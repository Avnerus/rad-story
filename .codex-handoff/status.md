# Status: metadata notification and documentation accuracy

## 1. Exact runtime condition changed

`ActiveSparkControlsRuntime.attach()` notification condition expanded from:

```ts
if (previous !== controls || previousSyncEnabled !== this._sourceSyncEnabled)
```

to:

```ts
const previousProfileName = this._profileName
// ... update state ...
if (
  previous !== controls ||
  previousProfileName !== this._profileName ||
  previousSyncEnabled !== this._sourceSyncEnabled
)
```

Captures the previous `profileName` before updating registration state. Subscribers are now notified on same-controller re-attach when **any** metadata changes: controller identity, profile name, or source-sync capability.

## 2. Documentation corrections

- `AGENTS.md` line ~20: `createSceneObjects(profile, profileName, profileSettings)` → `createSceneObjects(profileName, profileSettings)`
- `AGENTS.md` line ~107: `createSceneObjects(profile, profile.profileName)` → `createSceneObjects(profile.profileName)`
- `AGENTS.md` test reference: added "same-controller reattach with changed profile name" to the listed test cases

## 3. Focused test added and command results

**New test:** `same-controller reattach with changed profile name notifies subscribers` — attaches same fake controller as `'desktop'`, clears notifications, re-attaches as `'mobile'` with same `sourceSyncEnabled: true`. Verifies exactly one notification and `profileName === 'mobile'`.

| Command | Result |
|---------|--------|
| `npm run check` | 0 errors, 0 warnings |
| `npm run lint` | Clean |
| `npm run test:unit` | 26 files, 427 tests passed |
| `git diff --check` | Clean |

## 4. Acceptance checklist

- [x] Same-controller profile-name-only reattachment notifies subscribers.
- [x] Existing controller replacement, permission-change notification, and stale-detach behavior remain unchanged.
- [x] A focused unit test covers the profile-name-only metadata change.
- [x] AGENTS.md contains no obsolete `createSceneObjects(profile, profileName, ...)` call/signature.
- [x] The completion report accurately describes changed tests and results.
- [x] `npm run check`, `npm run lint`, `npm run test:unit`, and `git diff --check` pass.

## 5. Final commit hash

See pushed commit on `main` at `github.com:Avnerus/rad-story`.
