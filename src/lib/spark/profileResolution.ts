/**
 * Pure profile resolution utilities.
 *
 * No dependencies on SparkControls class — only on exported constants and types.
 * This avoids circular imports with deviceProfile.ts and SparkControls.ts.
 */
import type { SparkSettings } from './SparkControls'
import { SETTINGS_KEYS } from './SparkControls'
import type { DeviceProfileName } from '$lib/types'

// ---------------------------------------------------------------------------
// Profile overrides type
// ---------------------------------------------------------------------------

/**
 * Nested profile overrides persisted on a SparkControls via source sync.
 * Both `desktop` and `mobile` parent keys must be present.
 * Child objects contain only fields that differ from the global baseline.
 */
export type ProfileSettings = Record<DeviceProfileName, Partial<SparkSettings>>

// ---------------------------------------------------------------------------
// Pure computation functions
// ---------------------------------------------------------------------------

/**
 * Compute effective settings by merging a global baseline with scene-local
 * overrides. Only the active profile's overrides are applied.
 */
export function computeEffectiveSettings(
  profileName: DeviceProfileName,
  sceneOverrides: ProfileSettings,
  baseline: SparkSettings,
): SparkSettings {
  const overrides = sceneOverrides[profileName] ?? {}
  const effective = { ...baseline }
  for (const key of SETTINGS_KEYS) {
    if (key in overrides) {
      effective[key] = overrides[key]!
    }
  }
  return effective
}

/**
 * Compute minimal overrides for a profile: only fields that differ from
 * the global baseline. Uses own-property presence (not truthiness) to
 * distinguish "no override" from valid falsey values like `false`, `0`,
 * or `null`.
 */
export function computeOverrides(
  effectiveSettings: SparkSettings,
  baseline: SparkSettings,
): Partial<SparkSettings> {
  const overrides: Partial<SparkSettings> = {}
  for (const key of SETTINGS_KEYS) {
    if (effectiveSettings[key] !== baseline[key]) {
      overrides[key] = effectiveSettings[key]
    }
  }
  return overrides
}
