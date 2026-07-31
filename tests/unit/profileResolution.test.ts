import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SETTINGS_KEYS, SPARK_PAGE_SIZE } from '$lib/spark/SparkControls'

describe('profile resolution', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
    vi.unstubAllGlobals()
  })

  describe('detectProfileName', () => {
    it('returns "desktop" for desktop UA', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { detectProfileName } = await import('$lib/spark/deviceProfile')
      expect(detectProfileName()).toBe('desktop')
    })

    it('returns "mobile" for mobile UA', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0)' },
        writable: true,
      })
      const { detectProfileName } = await import('$lib/spark/deviceProfile')
      expect(detectProfileName()).toBe('mobile')
    })

    it('returns "mobile" for Android UA', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Linux; Android 13)' },
        writable: true,
      })
      const { detectProfileName } = await import('$lib/spark/deviceProfile')
      expect(detectProfileName()).toBe('mobile')
    })

    it('returns "desktop" for iPad UA (non-Mobi)', async () => {
      // iPad UA without Mobi keyword
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0)' },
        writable: true,
      })
      const { detectProfileName } = await import('$lib/spark/deviceProfile')
      expect(detectProfileName()).toBe('mobile') // matches iPad pattern
    })
  })

  describe('getGlobalBaseline', () => {
    it('returns complete 22-field desktop baseline', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')

      expect(Object.keys(baseline).length).toBe(22)
      for (const key of SETTINGS_KEYS) {
        expect(baseline[key]).toBeDefined()
      }
      // Check profile-specific fields
      expect(baseline.lodSplatScale).toBe(1)
      expect(baseline.maxPagedSplats).toBe(16 * SPARK_PAGE_SIZE)
      expect(baseline.coneFov0).toBe(90)
      expect(baseline.coneFov).toBe(120)
      expect(baseline.coneFoveate).toBe(0.2)
      expect(baseline.behindFoveate).toBe(0.1)
      // Check non-profile fields use Spark defaults
      expect(baseline.blurAmount).toBe(0.3)
      expect(baseline.clipXY).toBe(1.4)
      expect(baseline.sortRadial).toBe(true)
      expect(baseline.lodSplatCount).toBeNull()
    })

    it('returns complete 22-field mobile baseline', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('mobile')

      expect(Object.keys(baseline).length).toBe(22)
      expect(baseline.lodSplatScale).toBe(0.5)
      expect(baseline.maxPagedSplats).toBe(4 * SPARK_PAGE_SIZE)
      expect(baseline.coneFov0).toBe(70)
      expect(baseline.coneFov).toBe(110)
      expect(baseline.coneFoveate).toBe(0.4)
      expect(baseline.behindFoveate).toBe(0.3)
      // Non-profile fields still use Spark defaults
      expect(baseline.blurAmount).toBe(0.3)
      expect(baseline.sortRadial).toBe(true)
    })

    it('returns a deep copy (mutations do not affect global)', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline1 = getGlobalBaseline('desktop')
      baseline1.blurAmount = 999
      const baseline2 = getGlobalBaseline('desktop')
      expect(baseline2.blurAmount).toBe(0.3)
    })
  })

  describe('computeEffectiveSettings', () => {
    it('returns baseline when no overrides', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const effective = computeEffectiveSettings('desktop', { desktop: {}, mobile: {} })
      const baseline = getGlobalBaseline('desktop')
      expect(effective).toEqual(baseline)
    })

    it('merges overrides with baseline', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings } = await import('$lib/spark/deviceProfile')
      const effective = computeEffectiveSettings('desktop', {
        desktop: { blurAmount: 0.7, maxStdDev: 2.8 },
        mobile: {},
      })
      expect(effective.blurAmount).toBe(0.7)
      expect(effective.maxStdDev).toBe(2.8)
      // Non-overridden fields use baseline
      expect(effective.lodSplatScale).toBe(1)
      expect(effective.coneFov0).toBe(90)
    })

    it('only applies active profile overrides', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings } = await import('$lib/spark/deviceProfile')
      const effective = computeEffectiveSettings('desktop', {
        desktop: {},
        mobile: { blurAmount: 0.9 },
      })
      expect(effective.blurAmount).toBe(0.3) // desktop baseline, not mobile override
    })

    it('handles false boolean overrides', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings } = await import('$lib/spark/deviceProfile')
      const effective = computeEffectiveSettings('desktop', {
        desktop: { sortRadial: false },
        mobile: {},
      })
      expect(effective.sortRadial).toBe(false)
    })

    it('handles null overrides (lodSplatCount)', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings } = await import('$lib/spark/deviceProfile')
      const effective = computeEffectiveSettings('desktop', {
        desktop: { lodSplatCount: null },
        mobile: {},
      })
      expect(effective.lodSplatCount).toBeNull()
    })
  })

  describe('computeOverrides', () => {
    it('returns empty when settings match baseline', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeOverrides, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')
      const overrides = computeOverrides('desktop', baseline)
      expect(Object.keys(overrides).length).toBe(0)
    })

    it('returns only differing fields', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeOverrides, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')
      const modified = { ...baseline, blurAmount: 0.7, maxStdDev: 2.8 }
      const overrides = computeOverrides('desktop', modified)
      expect(overrides.blurAmount).toBe(0.7)
      expect(overrides.maxStdDev).toBe(2.8)
      expect('lodSplatScale' in overrides).toBe(false)
      expect(Object.keys(overrides).length).toBe(2)
    })

    it('preserves false as override (not truthy check)', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeOverrides, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')
      const modified = { ...baseline, sortRadial: false }
      const overrides = computeOverrides('desktop', modified)
      expect(overrides.sortRadial).toBe(false)
      expect('sortRadial' in overrides).toBe(true)
    })

    it('preserves null as override', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeOverrides, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')
      // Set lodSplatCount to a number, then compute overrides
      const modified = { ...baseline, lodSplatCount: 500_000 }
      const overrides = computeOverrides('desktop', modified)
      expect(overrides.lodSplatCount).toBe(500_000)
      expect('lodSplatCount' in overrides).toBe(true)
    })

    it('removes override when reset to baseline value', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeOverrides, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')
      // Start with modified value
      const modified = { ...baseline, blurAmount: 0.7 }
      let overrides = computeOverrides('desktop', modified)
      expect(overrides.blurAmount).toBe(0.7)

      // Reset to baseline
      const reset = { ...modified, blurAmount: baseline.blurAmount }
      overrides = computeOverrides('desktop', reset)
      expect('blurAmount' in overrides).toBe(false)
    })

    it('handles coupled-field diff (coneFov0 + coneFov)', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeOverrides, getGlobalBaseline } = await import('$lib/spark/deviceProfile')
      const baseline = getGlobalBaseline('desktop')
      // coneFov0=150 forces coneFov=150 (invariant)
      const modified = { ...baseline, coneFov0: 150, coneFov: 150 }
      const overrides = computeOverrides('desktop', modified)
      expect(overrides.coneFov0).toBe(150)
      expect(overrides.coneFov).toBe(150)
    })
  })

  describe('round-trip: baseline + overrides + effective + diff', () => {
    it('round-trips through merge and diff', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings, computeOverrides } = await import('$lib/spark/deviceProfile')

      const inputOverrides = {
        desktop: { blurAmount: 0.7, maxStdDev: 2.8, sortRadial: false },
        mobile: {},
      }
      const effective = computeEffectiveSettings('desktop', inputOverrides)
      const outputOverrides = computeOverrides('desktop', effective)

      expect(outputOverrides).toEqual(inputOverrides.desktop)
    })

    it('round-trips with boolean false', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings, computeOverrides } = await import('$lib/spark/deviceProfile')

      const inputOverrides = {
        desktop: { sortRadial: false, enableLod: false, lodInflate: true },
        mobile: {},
      }
      const effective = computeEffectiveSettings('desktop', inputOverrides)
      const outputOverrides = computeOverrides('desktop', effective)

      expect(outputOverrides.sortRadial).toBe(false)
      expect(outputOverrides.enableLod).toBe(false)
      expect(outputOverrides.lodInflate).toBe(true)
      expect(Object.keys(outputOverrides).length).toBe(3)
    })
  })

  describe('profile isolation', () => {
    it('editing desktop does not affect mobile overrides', async () => {
      Object.defineProperty(globalThis, 'navigator', {
        value: { userAgent: 'Mozilla/5.0 (Windows)' },
        writable: true,
      })
      vi.stubGlobal('devicePixelRatio', 2)
      const { computeEffectiveSettings } = await import('$lib/spark/deviceProfile')

      const overrides = {
        desktop: { blurAmount: 0.7 },
        mobile: { maxPagedSplats: 2 * SPARK_PAGE_SIZE },
      }

      const desktopEffective = computeEffectiveSettings('desktop', overrides)
      const mobileEffective = computeEffectiveSettings('mobile', overrides)

      expect(desktopEffective.blurAmount).toBe(0.7)
      expect(mobileEffective.blurAmount).toBe(0.3) // mobile baseline
      expect(desktopEffective.maxPagedSplats).toBe(16 * SPARK_PAGE_SIZE) // desktop baseline
      expect(mobileEffective.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
    })
  })
})
