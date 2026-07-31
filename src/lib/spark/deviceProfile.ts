import type { DeviceProfile } from '$lib/types'
import type { SparkSettings } from './SparkControls'
import { SPARK_PAGE_SIZE, SETTINGS_KEYS, FIELD_DEFS } from './SparkControls'
import type { DeviceProfileName } from '$lib/types'

// ---------------------------------------------------------------------------
// Complete 22-field global baselines per profile
// ---------------------------------------------------------------------------

/**
 * Build a complete 22-field SparkSettings baseline for a profile.
 * Merges profile-specific overrides with canonical Spark defaults so that
 * comparisons always use all 22 effective fields.
 */
function buildBaseline(overrides: Partial<SparkSettings>): SparkSettings {
  const baseline = {} as SparkSettings
  for (const [key, def] of Object.entries(FIELD_DEFS)) {
    ;(baseline as unknown as Record<string, unknown>)[key] = def.default
  }
  return { ...baseline, ...overrides } as SparkSettings
}

/**
 * Desktop profile — matches Spark 2.1 defaults for the eight profile-specific
 * fields, plus canonical defaults for the remaining 14 fields.
 */
const DESKTOP_BASELINE: SparkSettings = buildBaseline({
  lodSplatScale: 1,
  lodRenderScale: 1,
  maxStdDev: 8,
  maxPagedSplats: 16 * SPARK_PAGE_SIZE,
  coneFov0: 90,
  coneFov: 120,
  coneFoveate: 0.2,
  behindFoveate: 0.1,
})

/**
 * Mobile profile — conservative settings for mobile devices.
 */
const MOBILE_BASELINE: SparkSettings = buildBaseline({
  lodSplatScale: 0.5,
  lodRenderScale: 2,
  maxStdDev: 4,
  maxPagedSplats: 4 * SPARK_PAGE_SIZE,
  coneFov0: 70,
  coneFov: 110,
  coneFoveate: 0.4,
  behindFoveate: 0.3,
})

/** Global effective baselines keyed by profile name. */
const GLOBAL_BASELINES: Record<DeviceProfileName, SparkSettings> = {
  desktop: DESKTOP_BASELINE,
  mobile: MOBILE_BASELINE,
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detect if the current device is mobile / iOS.
 * Uses a UA fallback (Spark's `isMobile` is not always available).
 */
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
}

/**
 * Detect the active device profile name.
 * Returns 'mobile' when UA indicates mobile, 'desktop' otherwise.
 */
export function detectProfileName(): DeviceProfileName {
  return detectMobile() ? 'mobile' : 'desktop'
}

/**
 * Get the global effective SparkSettings baseline for a profile name.
 * Returns a deep copy so callers can safely mutate the result.
 */
export function getGlobalBaseline(name: DeviceProfileName): SparkSettings {
  return { ...GLOBAL_BASELINES[name] }
}

/**
 * Get all global baselines (deep copies).
 */
export function getAllGlobalBaselines(): Record<DeviceProfileName, SparkSettings> {
  return {
    desktop: { ...GLOBAL_BASELINES.desktop },
    mobile: { ...GLOBAL_BASELINES.mobile },
  }
}

/**
 * Compute effective settings by merging a global baseline with scene-local
 * overrides. Only the active profile's overrides are applied.
 */
export function computeEffectiveSettings(
  profileName: DeviceProfileName,
  sceneOverrides: Record<DeviceProfileName, Partial<SparkSettings>>,
): SparkSettings {
  const baseline = GLOBAL_BASELINES[profileName]
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
  profileName: DeviceProfileName,
  effectiveSettings: SparkSettings,
): Partial<SparkSettings> {
  const baseline = GLOBAL_BASELINES[profileName]
  const overrides: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) {
    if (effectiveSettings[key] !== baseline[key]) {
      overrides[key] = effectiveSettings[key]
    }
  }
  return overrides as Partial<SparkSettings>
}

// ---------------------------------------------------------------------------
// Legacy compatibility — DeviceProfile for renderer construction
// ---------------------------------------------------------------------------

/**
 * Return device-appropriate Spark / renderer settings.
 * Used by SparkStudioBridge for initial renderer construction.
 */
export function getDeviceProfile(): DeviceProfile {
  const mobile = detectMobile()

  if (mobile) {
    return {
      isMobile: true,
      dpr: 1,
      sparkRenderer: {
        lodSplatScale: 0.5,
        lodRenderScale: 2,
        maxStdDev: 4,
        maxPagedSplats: 262_144,
        coneFov0: 70,
        coneFov: 110,
        coneFoveate: 0.4,
        behindFoveate: 0.3,
      },
    }
  }

  return {
    isMobile: false,
    dpr: Math.min(window.devicePixelRatio, 2),
    sparkRenderer: {
      lodSplatScale: 1,
      lodRenderScale: 1,
      maxStdDev: 8,
      maxPagedSplats: 1_048_576,
      coneFov0: 90,
      coneFov: 120,
      coneFoveate: 0.2,
      behindFoveate: 0.1,
    },
  }
}
