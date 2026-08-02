/**
 * Convert a complete SparkSettings snapshot to SparkRendererOptions.
 *
 * Used by SparkStudioBridge to initialize both SparkRenderer instances
 * from the active SparkControls.settings effective snapshot.
 *
 * No baseline literals — all values come from the SparkSettings snapshot.
 * The caller supplies infrastructure options (renderer, onDirty, pagedExtSplats).
 */
import type { SparkRendererOptions } from '@sparkjsdev/spark'
import type { SparkSettings } from './SparkControls'

/**
 * Build SparkRendererOptions from a complete SparkSettings snapshot.
 *
 * Maps `lodSplatCount: null` to `undefined` (Spark's automatic/platform default).
 * Infrastructure options (renderer, onDirty, pagedExtSplats) are merged in by
 * the caller via spread.
 *
 * @param settings — Complete validated SparkSettings snapshot (baseline + overrides).
 */
export function sparkSettingsToRendererOptions(settings: SparkSettings): SparkRendererOptions {
  return {
    lodSplatScale: settings.lodSplatScale,
    lodRenderScale: settings.lodRenderScale,
    maxStdDev: settings.maxStdDev,
    maxPagedSplats: settings.maxPagedSplats,
    coneFov0: settings.coneFov0,
    coneFov: settings.coneFov,
    coneFoveate: settings.coneFoveate,
    behindFoveate: settings.behindFoveate,
    minPixelRadius: settings.minPixelRadius,
    maxPixelRadius: settings.maxPixelRadius,
    minAlpha: settings.minAlpha,
    preBlurAmount: settings.preBlurAmount,
    blurAmount: settings.blurAmount,
    falloff: settings.falloff,
    clipXY: settings.clipXY,
    focalAdjustment: settings.focalAdjustment,
    sortRadial: settings.sortRadial,
    minSortIntervalMs: settings.minSortIntervalMs,
    enableLod: settings.enableLod,
    enableLodFetching: settings.enableLodFetching,
    // null → undefined for Spark's automatic/platform default
    lodSplatCount: settings.lodSplatCount ?? undefined,
    lodInflate: settings.lodInflate,
  }
}
