import type { DeviceProfile, DeviceProfileName } from '$lib/types'
import type { SparkSettings } from './SparkControls'
import { SPARK_PAGE_SIZE, FIELD_DEFS } from './SparkControls'
import { computeEffectiveSettings as _computeEffectiveSettings, computeOverrides as _computeOverrides, type ProfileSettings } from './profileResolution'

// ---------------------------------------------------------------------------
// Complete 22-field global baselines per profile
// ---------------------------------------------------------------------------

/**
 * Build a complete 22-field SparkSettings baseline for a profile.
 * Merges profile-specific overrides with canonical Spark defaults so that
 * comparisons always use all 22 effective fields.
 */
function buildBaseline(overrides: Partial<SparkSettings>): SparkSettings {
  const defaults = {
    lodSplatScale: FIELD_DEFS.lodSplatScale.default as number,
    lodRenderScale: FIELD_DEFS.lodRenderScale.default as number,
    maxStdDev: FIELD_DEFS.maxStdDev.default as number,
    maxPagedSplats: FIELD_DEFS.maxPagedSplats.default as number,
    coneFov0: FIELD_DEFS.coneFov0.default as number,
    coneFov: FIELD_DEFS.coneFov.default as number,
    coneFoveate: FIELD_DEFS.coneFoveate.default as number,
    behindFoveate: FIELD_DEFS.behindFoveate.default as number,
    minPixelRadius: FIELD_DEFS.minPixelRadius.default as number,
    maxPixelRadius: FIELD_DEFS.maxPixelRadius.default as number,
    minAlpha: FIELD_DEFS.minAlpha.default as number,
    preBlurAmount: FIELD_DEFS.preBlurAmount.default as number,
    blurAmount: FIELD_DEFS.blurAmount.default as number,
    falloff: FIELD_DEFS.falloff.default as number,
    clipXY: FIELD_DEFS.clipXY.default as number,
    focalAdjustment: FIELD_DEFS.focalAdjustment.default as number,
    sortRadial: FIELD_DEFS.sortRadial.default as boolean,
    minSortIntervalMs: FIELD_DEFS.minSortIntervalMs.default as number,
    enableLod: FIELD_DEFS.enableLod.default as boolean,
    enableLodFetching: FIELD_DEFS.enableLodFetching.default as boolean,
    lodSplatCount: FIELD_DEFS.lodSplatCount.default as number | null,
    lodInflate: FIELD_DEFS.lodInflate.default as boolean,
  } as SparkSettings
  return { ...defaults, ...overrides } as SparkSettings
}

/**
 * Desktop profile — matches Spark 2.1 defaults for the eight profile-specific
 * fields, plus canonical defaults for the remaining 14 fields.
 */
const DESKTOP_BASELINE: SparkSettings = buildBaseline({
  lodSplatScale: 1,
  lodRenderScale: 1,
  maxStdDev: 2.8,
  maxPagedSplats: 32 * SPARK_PAGE_SIZE,
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
  maxStdDev: 2.8,
  maxPagedSplats: 16 * SPARK_PAGE_SIZE,
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
  sceneOverrides: ProfileSettings,
): SparkSettings {
  return _computeEffectiveSettings(profileName, sceneOverrides, GLOBAL_BASELINES[profileName])
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
  return _computeOverrides(effectiveSettings, baseline)
}

/**
 * Return device-appropriate detection and Canvas DPR.
 * Spark settings are not duplicated here — the canonical source is
 * `GLOBAL_BASELINES` accessed via `getGlobalBaseline()`.
 */
export function getDeviceProfile(): DeviceProfile {
  const mobile = detectMobile()
  const profileName: DeviceProfileName = mobile ? 'mobile' : 'desktop'

  return {
    profileName,
    dpr: mobile ? 1 : Math.min(window.devicePixelRatio, 2),
  }
}
