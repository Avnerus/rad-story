import { describe, it, expect } from 'vitest'
import { sparkSettingsToRendererOptions } from '$lib/spark/sparkSettingsToRendererOptions'
import { SparkControls } from '$lib/spark/SparkControls'
import { getGlobalBaseline } from '$lib/spark/deviceProfile'
import type { ProfileSettings } from '$lib/spark/SparkControls'

describe('sparkSettingsToRendererOptions', () => {
  it('maps all 22 SparkSettings fields to renderer options', () => {
    const baseline = getGlobalBaseline('desktop')
    const options = sparkSettingsToRendererOptions(baseline)

    // All profile-specific fields present
    expect(options.lodSplatScale).toBe(baseline.lodSplatScale)
    expect(options.lodRenderScale).toBe(baseline.lodRenderScale)
    expect(options.maxStdDev).toBe(baseline.maxStdDev)
    expect(options.maxPagedSplats).toBe(baseline.maxPagedSplats)
    expect(options.coneFov0).toBe(baseline.coneFov0)
    expect(options.coneFov).toBe(baseline.coneFov)
    expect(options.coneFoveate).toBe(baseline.coneFoveate)
    expect(options.behindFoveate).toBe(baseline.behindFoveate)
    expect(options.minPixelRadius).toBe(baseline.minPixelRadius)
    expect(options.maxPixelRadius).toBe(baseline.maxPixelRadius)
    expect(options.minAlpha).toBe(baseline.minAlpha)
    expect(options.preBlurAmount).toBe(baseline.preBlurAmount)
    expect(options.blurAmount).toBe(baseline.blurAmount)
    expect(options.falloff).toBe(baseline.falloff)
    expect(options.clipXY).toBe(baseline.clipXY)
    expect(options.focalAdjustment).toBe(baseline.focalAdjustment)
    expect(options.sortRadial).toBe(baseline.sortRadial)
    expect(options.minSortIntervalMs).toBe(baseline.minSortIntervalMs)
    expect(options.enableLod).toBe(baseline.enableLod)
    expect(options.enableLodFetching).toBe(baseline.enableLodFetching)
    expect(options.lodInflate).toBe(baseline.lodInflate)
  })

  it('maps lodSplatCount null to undefined', () => {
    const baseline = getGlobalBaseline('desktop')
    const options = sparkSettingsToRendererOptions(baseline)
    // baseline.lodSplatCount is null
    expect(options.lodSplatCount).toBeUndefined()
  })

  it('preserves numeric lodSplatCount', () => {
    const baseline = getGlobalBaseline('desktop')
    const withCount = { ...baseline, lodSplatCount: 500_000 }
    const options = sparkSettingsToRendererOptions(withCount)
    expect(options.lodSplatCount).toBe(500_000)
  })

  it('no infrastructure options in output (renderer, onDirty, pagedExtSplats)', () => {
    const baseline = getGlobalBaseline('desktop')
    const options = sparkSettingsToRendererOptions(baseline)
    expect(options).not.toHaveProperty('renderer')
    expect(options).not.toHaveProperty('onDirty')
    expect(options).not.toHaveProperty('pagedExtSplats')
  })
})

describe('SparkControls settings snapshot includes scene overrides', () => {
  it('active-profile scene override is in settings snapshot', () => {
    const baseline = getGlobalBaseline('desktop')
    const overrides: ProfileSettings = {
      desktop: { blurAmount: 0.7, coneFov0: 100 },
      mobile: {},
    }
    const controls = new SparkControls(undefined, 'desktop', overrides, baseline)

    const settings = controls.settings
    expect(settings.blurAmount).toBe(0.7)
    expect(settings.coneFov0).toBe(100)
    // Non-overridden fields use baseline
    expect(settings.lodSplatScale).toBe(baseline.lodSplatScale)
    expect(settings.maxPagedSplats).toBe(baseline.maxPagedSplats)
  })

  it('settings snapshot converted to renderer options preserves overrides', () => {
    const baseline = getGlobalBaseline('desktop')
    const overrides: ProfileSettings = {
      desktop: { blurAmount: 0.7, coneFov0: 100 },
      mobile: {},
    }
    const controls = new SparkControls(undefined, 'desktop', overrides, baseline)
    const options = sparkSettingsToRendererOptions(controls.settings)

    expect(options.blurAmount).toBe(0.7)
    expect(options.coneFov0).toBe(100)
    expect(options.lodSplatCount).toBeUndefined() // null → undefined
  })

  it('inactive profile overrides not in active settings', () => {
    const baseline = getGlobalBaseline('desktop')
    const overrides: ProfileSettings = {
      desktop: {},
      mobile: { blurAmount: 0.9 },
    }
    const controls = new SparkControls(undefined, 'desktop', overrides, baseline)

    // Desktop active — mobile override should not appear
    expect(controls.settings.blurAmount).toBe(baseline.blurAmount)
  })
})
