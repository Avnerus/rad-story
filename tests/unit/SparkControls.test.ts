import { describe, it, expect, vi } from 'vitest'
import { SparkControls, SPARK_PAGE_SIZE, type SparkSettings } from '$lib/spark/SparkControls'

describe('SparkControls', () => {
  describe('name, type, and brand', () => {
    it('has name "Spark"', () => {
      const c = new SparkControls()
      expect(c.name).toBe('Spark')
    })

    it('has isSparkControls brand', () => {
      const c = new SparkControls()
      expect(c.isSparkControls).toBe(true)
    })

    it('has type "SparkControls"', () => {
      const c = new SparkControls()
      expect(c.type).toBe('SparkControls')
    })
  })

  describe('default settings', () => {
    it('returns all default values', () => {
      const c = new SparkControls()
      const s = c.settings
      expect(s.lodSplatScale).toBe(1)
      expect(s.lodRenderScale).toBe(1)
      expect(s.maxStdDev).toBe(8)
      expect(s.maxPagedSplats).toBe(16 * SPARK_PAGE_SIZE)
      expect(s.coneFov0).toBe(90)
      expect(s.coneFov).toBe(120)
      expect(s.coneFoveate).toBe(0.4)
      expect(s.behindFoveate).toBe(0.2)
      expect(s.minPixelRadius).toBe(0)
      expect(s.maxPixelRadius).toBe(512)
      expect(s.minAlpha).toBe(0.5 * (1 / 255))
      expect(s.preBlurAmount).toBe(0)
      expect(s.blurAmount).toBe(0)
      expect(s.falloff).toBe(1)
      expect(s.clipXY).toBe(1.4)
      expect(s.focalAdjustment).toBe(1)
      expect(s.sortRadial).toBe(true)
      expect(s.minSortIntervalMs).toBe(0)
      expect(s.enableLod).toBe(true)
      expect(s.enableLodFetching).toBe(true)
      expect(s.lodSplatCount).toBeNull()
      expect(s.lodInflate).toBe(false)
    })
  })

  describe('initial values', () => {
    it('accepts partial initial values', () => {
      const c = new SparkControls({
        lodSplatScale: 2,
        coneFov0: 60,
        coneFov: 100,
      })
      const s = c.settings
      expect(s.lodSplatScale).toBe(2)
      expect(s.coneFov0).toBe(60)
      expect(s.coneFov).toBe(100)
      // Unspecified fields get defaults
      expect(s.lodRenderScale).toBe(1)
      expect(s.behindFoveate).toBe(0.2)
    })
  })

  describe('validation', () => {
    it('clamps lodSplatScale to [0.01, 10]', () => {
      const c = new SparkControls()
      c.settings = { lodSplatScale: 0 }
      expect(c.settings.lodSplatScale).toBe(0.01)
      c.settings = { lodSplatScale: 100 }
      expect(c.settings.lodSplatScale).toBe(10)
    })

    it('clamps lodRenderScale to [0.1, 10]', () => {
      const c = new SparkControls()
      c.settings = { lodRenderScale: -1 }
      expect(c.settings.lodRenderScale).toBe(0.1)
      c.settings = { lodRenderScale: 99 }
      expect(c.settings.lodRenderScale).toBe(10)
    })

    it('clamps maxStdDev to [1, 100]', () => {
      const c = new SparkControls()
      c.settings = { maxStdDev: 0 }
      expect(c.settings.maxStdDev).toBe(1)
      c.settings = { maxStdDev: 999 }
      expect(c.settings.maxStdDev).toBe(100)
    })

    it('normalizes maxPagedSplats to positive multiples of 65536', () => {
      const c = new SparkControls()
      c.settings = { maxPagedSplats: 100 }
      expect(c.settings.maxPagedSplats).toBe(SPARK_PAGE_SIZE)
      c.settings = { maxPagedSplats: 100_000 }
      expect(c.settings.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
      c.settings = { maxPagedSplats: -1 }
      expect(c.settings.maxPagedSplats).toBe(SPARK_PAGE_SIZE)
    })

    it('clamps coneFov0 to [0, 180]', () => {
      const c = new SparkControls()
      c.settings = { coneFov0: -10 }
      expect(c.settings.coneFov0).toBe(0)
      c.settings = { coneFov0: 200 }
      expect(c.settings.coneFov0).toBe(180)
    })

    it('clamps coneFov to [0, 180]', () => {
      const c = new SparkControls()
      c.settings = { coneFov: -10 }
      expect(c.settings.coneFov).toBe(0)
      c.settings = { coneFov: 200 }
      expect(c.settings.coneFov).toBe(180)
    })

    it('enforces coneFov0 <= coneFov invariant', () => {
      const c = new SparkControls()
      c.settings = { coneFov0: 150, coneFov: 100 }
      expect(c.settings.coneFov0).toBe(150)
      expect(c.settings.coneFov).toBe(150) // coneFov raised to match coneFov0
    })

    it('clamps coneFoveate to [0, 1]', () => {
      const c = new SparkControls()
      c.settings = { coneFoveate: -0.5 }
      expect(c.settings.coneFoveate).toBe(0)
      c.settings = { coneFoveate: 2 }
      expect(c.settings.coneFoveate).toBe(1)
    })

    it('clamps behindFoveate to [0, 1]', () => {
      const c = new SparkControls()
      c.settings = { behindFoveate: -1 }
      expect(c.settings.behindFoveate).toBe(0)
      c.settings = { behindFoveate: 3 }
      expect(c.settings.behindFoveate).toBe(1)
    })

    it('clamps minPixelRadius to [0, 256]', () => {
      const c = new SparkControls()
      c.settings = { minPixelRadius: -10 }
      expect(c.settings.minPixelRadius).toBe(0)
      c.settings = { minPixelRadius: 500 }
      expect(c.settings.minPixelRadius).toBe(256)
    })

    it('clamps maxPixelRadius to [1, 4096]', () => {
      const c = new SparkControls()
      c.settings = { maxPixelRadius: 0 }
      expect(c.settings.maxPixelRadius).toBe(1)
      c.settings = { maxPixelRadius: 9999 }
      expect(c.settings.maxPixelRadius).toBe(4096)
    })

    it('clamps minAlpha to [0, 1]', () => {
      const c = new SparkControls()
      c.settings = { minAlpha: -1 }
      expect(c.settings.minAlpha).toBe(0)
      c.settings = { minAlpha: 2 }
      expect(c.settings.minAlpha).toBe(1)
    })

    it('clamps preBlurAmount to [0, 5]', () => {
      const c = new SparkControls()
      c.settings = { preBlurAmount: -1 }
      expect(c.settings.preBlurAmount).toBe(0)
      c.settings = { preBlurAmount: 10 }
      expect(c.settings.preBlurAmount).toBe(5)
    })

    it('clamps blurAmount to [0, 5]', () => {
      const c = new SparkControls()
      c.settings = { blurAmount: -1 }
      expect(c.settings.blurAmount).toBe(0)
      c.settings = { blurAmount: 10 }
      expect(c.settings.blurAmount).toBe(5)
    })

    it('clamps falloff to [0, 1]', () => {
      const c = new SparkControls()
      c.settings = { falloff: -1 }
      expect(c.settings.falloff).toBe(0)
      c.settings = { falloff: 2 }
      expect(c.settings.falloff).toBe(1)
    })

    it('clamps clipXY to [0.5, 5]', () => {
      const c = new SparkControls()
      c.settings = { clipXY: 0.1 }
      expect(c.settings.clipXY).toBe(0.5)
      c.settings = { clipXY: 10 }
      expect(c.settings.clipXY).toBe(5)
    })

    it('clamps focalAdjustment to [0.1, 5]', () => {
      const c = new SparkControls()
      c.settings = { focalAdjustment: 0 }
      expect(c.settings.focalAdjustment).toBe(0.1)
      c.settings = { focalAdjustment: 10 }
      expect(c.settings.focalAdjustment).toBe(5)
    })

    it('clamps minSortIntervalMs to [0, 10000] and rounds to integer', () => {
      const c = new SparkControls()
      c.settings = { minSortIntervalMs: -1 }
      expect(c.settings.minSortIntervalMs).toBe(0)
      c.settings = { minSortIntervalMs: 15000 }
      expect(c.settings.minSortIntervalMs).toBe(10000)
      c.settings = { minSortIntervalMs: 500.7 }
      expect(c.settings.minSortIntervalMs).toBe(501)
    })

    it('handles NaN and Infinity by falling back to default', () => {
      const c = new SparkControls()
      c.settings = { lodSplatScale: NaN }
      expect(c.settings.lodSplatScale).toBe(1) // default
      c.settings = { lodSplatScale: Infinity }
      expect(c.settings.lodSplatScale).toBe(1) // default (non-finite → default)
      c.settings = { lodSplatScale: -Infinity }
      expect(c.settings.lodSplatScale).toBe(1) // default (non-finite → default)
    })

    it('handles boolean fields', () => {
      const c = new SparkControls()
      c.settings = { sortRadial: false }
      expect(c.settings.sortRadial).toBe(false)
      c.settings = { enableLod: false }
      expect(c.settings.enableLod).toBe(false)
      c.settings = { enableLodFetching: false }
      expect(c.settings.enableLodFetching).toBe(false)
      c.settings = { lodInflate: true }
      expect(c.settings.lodInflate).toBe(true)
    })

    it('handles lodSplatCount null (automatic)', () => {
      const c = new SparkControls()
      c.settings = { lodSplatCount: null }
      expect(c.settings.lodSplatCount).toBeNull()
      c.settings = { lodSplatCount: 500_000 }
      expect(c.settings.lodSplatCount).toBe(500_000)
      c.settings = { lodSplatCount: 0 }
      expect(c.settings.lodSplatCount).toBe(10_000) // clamped to min
    })
  })

  describe('change notifications', () => {
    it('calls onChange callback when settings change', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.settings = { lodSplatScale: 2 }
      expect(fn).toHaveBeenCalledTimes(1)
      expect(fn).toHaveBeenCalledWith(expect.objectContaining(new Set(['lodSplatScale'])))
    })

    it('does not call onChange when settings are unchanged', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.settings = { lodSplatScale: 1 } // same as default
      expect(fn).not.toHaveBeenCalled()
    })

    it('reports all changed fields', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.settings = {
        lodSplatScale: 2,
        coneFov0: 60,
        behindFoveate: 0.5,
      }
      expect(fn).toHaveBeenCalledTimes(1)
      const changed = fn.mock.calls[0][0] as Set<keyof SparkSettings>
      expect(changed).toContain('lodSplatScale')
      expect(changed).toContain('coneFov0')
      expect(changed).toContain('behindFoveate')
      // coneFov should also be reported if it was adjusted by invariant
      // (default coneFov is 120, coneFov0 is 60, so no adjustment needed)
      expect(changed).not.toContain('coneFov')
    })

    it('reports coneFov change when invariant adjusts it', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.settings = { coneFov0: 150, coneFov: 100 }
      const changed = fn.mock.calls[0][0] as Set<keyof SparkSettings>
      expect(changed).toContain('coneFov0')
      expect(changed).toContain('coneFov')
      expect(c.settings.coneFov).toBe(150)
    })

    it('unsubscribes correctly', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      const unsub = c.onChange(fn)

      c.settings = { lodSplatScale: 2 }
      expect(fn).toHaveBeenCalledTimes(1)

      unsub()
      c.settings = { lodSplatScale: 3 }
      expect(fn).toHaveBeenCalledTimes(1) // not called again
    })

    it('is idempotent on dispose', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)
      c.dispose()
      c.dispose() // safe to call multiple times

      c.settings = { lodSplatScale: 2 }
      expect(fn).not.toHaveBeenCalled() // no listeners after dispose
    })
  })

  describe('settings getter returns deep copy', () => {
    it('modifying returned object does not affect internal state', () => {
      const c = new SparkControls()
      const s1 = c.settings
      s1.lodSplatScale = 999
      const s2 = c.settings
      expect(s2.lodSplatScale).toBe(1) // still default
    })
  })
})
