import { describe, it, expect, vi } from 'vitest'
import { SparkControls, SPARK_PAGE_SIZE, SETTINGS_KEYS, type SparkSettings } from '$lib/spark/SparkControls'

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

  describe('default settings match installed Spark 2.1 defaults', () => {
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
      expect(s.blurAmount).toBe(0.3) // Spark 2.1 default
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

  describe('constructor validates initial values', () => {
    it('clamps initial numeric values', () => {
      const c = new SparkControls({
        lodSplatScale: 100, // exceeds max 10
        coneFov0: -10, // below min 0
      })
      expect(c.settings.lodSplatScale).toBe(10)
      expect(c.settings.coneFov0).toBe(0)
    })

    it('validates initial maxPagedSplats to multiple of 65536', () => {
      const c = new SparkControls({ maxPagedSplats: 100_000 })
      expect(c.settings.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
    })

    it('enforces cone invariant in constructor', () => {
      const c = new SparkControls({ coneFov0: 150, coneFov: 100 })
      expect(c.settings.coneFov0).toBe(150)
      expect(c.settings.coneFov).toBe(150) // raised
    })

    it('enforces pixel radius invariant in constructor', () => {
      const c = new SparkControls({ minPixelRadius: 200, maxPixelRadius: 100 })
      expect(c.settings.minPixelRadius).toBe(200)
      expect(c.settings.maxPixelRadius).toBe(200) // raised
    })

    it('handles NaN/Infinity in constructor', () => {
      const c = new SparkControls({ lodSplatScale: NaN })
      expect(c.settings.lodSplatScale).toBe(1) // default
    })
  })

  describe('top-level property getters', () => {
    it('lodSplatScale getter returns current value', () => {
      const c = new SparkControls()
      expect(c.lodSplatScale).toBe(1)
      c.lodSplatScale = 2
      expect(c.lodSplatScale).toBe(2)
    })

    it('lodSplatCount getter returns null (auto)', () => {
      const c = new SparkControls()
      expect(c.lodSplatCount).toBeNull()
      c.lodSplatCount = 500_000
      expect(c.lodSplatCount).toBe(500_000)
      c.lodSplatCount = null
      expect(c.lodSplatCount).toBeNull()
    })
  })

  describe('top-level property setters validate', () => {
    it('clamps lodSplatScale', () => {
      const c = new SparkControls()
      c.lodSplatScale = 100
      expect(c.lodSplatScale).toBe(10)
    })

    it('clamps maxPagedSplats to page size multiple', () => {
      const c = new SparkControls()
      c.maxPagedSplats = 100
      expect(c.maxPagedSplats).toBe(SPARK_PAGE_SIZE)
    })

    it('enforces coneFov0 <= coneFov when editing coneFov0 alone', () => {
      const c = new SparkControls()
      // Default: coneFov0=90, coneFov=120
      c.coneFov0 = 150 // exceeds coneFov
      expect(c.coneFov0).toBe(150)
      expect(c.coneFov).toBe(150) // automatically raised
    })

    it('enforces coneFov0 <= coneFov when editing coneFov alone', () => {
      const c = new SparkControls()
      // Default: coneFov0=90, coneFov=120
      c.coneFov = 50 // below coneFov0
      expect(c.coneFov0).toBe(90)
      expect(c.coneFov).toBe(90) // raised to match coneFov0
    })

    it('enforces minPixelRadius <= maxPixelRadius when editing min alone', () => {
      const c = new SparkControls()
      // Default: min=0, max=512
      c.minPixelRadius = 600
      expect(c.minPixelRadius).toBe(256) // clamped to max bound first
      // After clamping to 256, 256 <= 512 so no invariant violation
    })

    it('enforces minPixelRadius <= maxPixelRadius when editing max alone', () => {
      const c = new SparkControls()
      c.minPixelRadius = 100
      c.maxPixelRadius = 50 // below min
      expect(c.maxPixelRadius).toBe(100) // raised to match min
    })

    it('validates boolean input', () => {
      const c = new SparkControls()
      c.sortRadial = false
      expect(c.sortRadial).toBe(false)
      c.sortRadial = true
      expect(c.sortRadial).toBe(true)
      c.sortRadial = 'false' // string "false" → false
      expect(c.sortRadial).toBe(false)
      c.sortRadial = 'anything' // truthy string → true
      expect(c.sortRadial).toBe(true)
    })

    it('lodSplatCount numeric → null (auto)', () => {
      const c = new SparkControls()
      c.lodSplatCount = 500_000
      expect(c.lodSplatCount).toBe(500_000)
      c.lodSplatCount = null
      expect(c.lodSplatCount).toBeNull()
    })
  })

  describe('change notifications', () => {
    it('calls onChange when a single field changes', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.lodSplatScale = 2
      expect(fn).toHaveBeenCalledTimes(1)
      const changed = fn.mock.calls[0][0] as Set<keyof SparkSettings>
      expect(changed).toContain('lodSplatScale')
    })

    it('does not call onChange when value is unchanged', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.lodSplatScale = 1 // same as default
      expect(fn).not.toHaveBeenCalled()
    })

    it('reports coneFov change when invariant adjusts it', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)

      c.coneFov0 = 150
      const changed = fn.mock.calls[0][0] as Set<keyof SparkSettings>
      expect(changed).toContain('coneFov0')
      expect(changed).toContain('coneFov')
      expect(c.coneFov).toBe(150)
    })

    it('reports maxPixelRadius change when invariant adjusts it', () => {
      const c = new SparkControls()
      c.minPixelRadius = 100
      const fn = vi.fn()
      c.onChange(fn)

      c.maxPixelRadius = 50
      const changed = fn.mock.calls[0][0] as Set<keyof SparkSettings>
      expect(changed).toContain('maxPixelRadius')
      expect(c.maxPixelRadius).toBe(100)
    })

    it('unsubscribes correctly', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      const unsub = c.onChange(fn)

      c.lodSplatScale = 2
      expect(fn).toHaveBeenCalledTimes(1)

      unsub()
      c.lodSplatScale = 3
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('is idempotent on dispose', () => {
      const c = new SparkControls()
      const fn = vi.fn()
      c.onChange(fn)
      c.dispose()
      c.dispose()

      c.lodSplatScale = 2
      expect(fn).not.toHaveBeenCalled()
    })
  })

  describe('SETTINGS_KEYS completeness', () => {
    it('contains all 22 setting keys', () => {
      expect(SETTINGS_KEYS.length).toBe(22)
    })

    it('every key has a corresponding getter/setter', () => {
      const c = new SparkControls()
      for (const key of SETTINGS_KEYS) {
        expect(c[key]).toBeDefined()
      }
    })
  })

  describe('settings getter returns deep copy', () => {
    it('modifying returned object does not affect internal state', () => {
      const c = new SparkControls()
      const s1 = c.settings
      s1.lodSplatScale = 999
      expect(c.lodSplatScale).toBe(1) // still default
    })
  })
})
