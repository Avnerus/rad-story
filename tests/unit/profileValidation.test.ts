import { describe, it, expect } from 'vitest'
import { SparkControls, SPARK_PAGE_SIZE, type SparkSettings } from '$lib/spark/SparkControls'
import type { ProfileSettings } from '$lib/spark/SparkControls'
import { getGlobalBaseline } from '$lib/spark/deviceProfile'

describe('SparkControls profile validation', () => {
  const desktopBaseline = getGlobalBaseline('desktop')

  describe('constructor validates active profile overrides', () => {
    it('clamps out-of-range numeric overrides', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: { lodSplatScale: 100, coneFov0: -10 },
        mobile: {},
      }, desktopBaseline)

      expect(ctrl.settings.lodSplatScale).toBe(10) // clamped to max
      expect(ctrl.settings.coneFov0).toBe(0) // clamped to min
    })

    it('rounds maxPagedSplats to page size multiple', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: { maxPagedSplats: 100_000 },
        mobile: {},
      }, desktopBaseline)

      expect(ctrl.settings.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE) // rounded up
    })

    it('applies coneFov0 <= coneFov invariant', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: { coneFov0: 150, coneFov: 100 },
        mobile: {},
      }, desktopBaseline)

      expect(ctrl.settings.coneFov0).toBe(150)
      expect(ctrl.settings.coneFov).toBe(150) // raised to match coneFov0
    })

    it('applies minPixelRadius <= maxPixelRadius invariant', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: { minPixelRadius: 300, maxPixelRadius: 100 },
        mobile: {},
      }, desktopBaseline)

      expect(ctrl.settings.minPixelRadius).toBe(256) // clamped to max bound first
      // After clamping to 256, 256 <= 512 (baseline) so no invariant violation
    })

    it('handles NaN/Infinity overrides', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: { blurAmount: NaN, lodSplatScale: Infinity },
        mobile: {},
      }, desktopBaseline)

      expect(ctrl.settings.blurAmount).toBe(0.3) // NaN → default
      expect(ctrl.settings.lodSplatScale).toBe(1) // Infinity → not finite → default
    })

    it('handles malformed input (non-object, null)', () => {
      const ctrl = new SparkControls(undefined, 'desktop', null as unknown as ProfileSettings, desktopBaseline)
      // Should not crash, should use baseline
      expect(ctrl.settings.blurAmount).toBe(desktopBaseline.blurAmount)
    })

    it('preserves inactive profile overrides', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: {},
        mobile: { maxPagedSplats: 2 * SPARK_PAGE_SIZE },
      }, desktopBaseline)

      const ps = ctrl.profileSettings
      expect(ps.mobile.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
      expect('maxPagedSplats' in ps.desktop).toBe(false)
    })
  })

  describe('profileSettings setter validates and normalizes', () => {
    it('validates out-of-range values', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

      ctrl.profileSettings = {
        desktop: { blurAmount: 100, coneFov0: -50 },
        mobile: {},
      }

      expect(ctrl.settings.blurAmount).toBe(5) // clamped to max
      expect(ctrl.settings.coneFov0).toBe(0) // clamped to min
    })

    it('rounds maxPagedSplats in setter', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

      ctrl.profileSettings = {
        desktop: { maxPagedSplats: 100_000 },
        mobile: {},
      }

      expect(ctrl.settings.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
    })

    it('applies cone invariant in setter', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

      ctrl.profileSettings = {
        desktop: { coneFov0: 150, coneFov: 100 },
        mobile: {},
      }

      expect(ctrl.settings.coneFov0).toBe(150)
      expect(ctrl.settings.coneFov).toBe(150)
    })

    it('handles NaN/Infinity in setter', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

      ctrl.profileSettings = {
        desktop: { blurAmount: NaN, lodSplatScale: Infinity },
        mobile: {},
      }

      expect(ctrl.settings.blurAmount).toBe(0.3) // NaN → default
      expect(ctrl.settings.lodSplatScale).toBe(1) // Infinity → not finite → default
    })

    it('handles malformed input in setter', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      const originalBlur = ctrl.settings.blurAmount

      ctrl.profileSettings = 'not an object'
      expect(ctrl.settings.blurAmount).toBe(originalBlur) // falls back to baseline

      ctrl.profileSettings = null
      expect(ctrl.settings.blurAmount).toBe(originalBlur)
    })

    it('defensive copy: mutating input after assignment does not affect controller', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      const input: ProfileSettings = {
        desktop: { blurAmount: 0.7 },
        mobile: {},
      }

      ctrl.profileSettings = input
      expect(ctrl.settings.blurAmount).toBe(0.7)

      // Mutate input after assignment
      input.desktop.blurAmount = 999
      expect(ctrl.settings.blurAmount).toBe(0.7) // unchanged
    })

    it('defensive copy: getter output mutation does not affect controller', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      ctrl.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }

      const ps = ctrl.profileSettings
      ps.desktop.blurAmount = 999
      expect(ctrl.settings.blurAmount).toBe(0.7) // unchanged
      expect(ctrl.profileSettings.desktop.blurAmount).toBe(0.7) // getter returns fresh copy
    })

    it('emits one coherent notification with all changed fields', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      let notified: Set<keyof SparkSettings> | null = null
      ctrl.onChange((keys) => { notified = keys })

      ctrl.profileSettings = {
        desktop: { blurAmount: 0.7, maxStdDev: 2.8 },
        mobile: {},
      }

      expect(notified).not.toBeNull()
      expect(notified!.has('blurAmount')).toBe(true)
      expect(notified!.has('maxStdDev')).toBe(true)
      // No extra fields
      expect(notified!.size).toBe(2)
    })

    it('notification includes coupled invariant fields', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      let notified: Set<keyof SparkSettings> | null = null
      ctrl.onChange((keys) => { notified = keys })

      ctrl.profileSettings = {
        desktop: { coneFov0: 150, coneFov: 100 },
        mobile: {},
      }

      expect(notified).not.toBeNull()
      expect(notified!.has('coneFov0')).toBe(true)
      expect(notified!.has('coneFov')).toBe(true)
    })

    it('does not emit notification when no effective change', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      let callCount = 0
      ctrl.onChange(() => { callCount++ })

      ctrl.profileSettings = { desktop: {}, mobile: {} }
      expect(callCount).toBe(0)
    })

    it('preserves inactive profile while editing active', () => {
      const ctrl = new SparkControls(undefined, 'desktop', {
        desktop: {},
        mobile: { maxPagedSplats: 2 * SPARK_PAGE_SIZE },
      }, desktopBaseline)

      ctrl.profileSettings = {
        desktop: { blurAmount: 0.7 },
        mobile: { maxPagedSplats: 2 * SPARK_PAGE_SIZE },
      }

      const ps = ctrl.profileSettings
      expect(ps.desktop.blurAmount).toBe(0.7)
      expect(ps.mobile.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
    })
  })

  describe('profileSettings getter returns validated minimal overrides', () => {
    it('active profile overrides are recomputed from settings vs baseline', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

      // Set via individual setter (triggers validation)
      ctrl.blurAmount = 0.7

      const ps = ctrl.profileSettings
      expect(ps.desktop.blurAmount).toBe(0.7)
      expect(Object.keys(ps.desktop).length).toBe(1)
    })

    it('both parents always present', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      const ps = ctrl.profileSettings

      expect('desktop' in ps).toBe(true)
      expect('mobile' in ps).toBe(true)
    })

    it('returns defensive copy', () => {
      const ctrl = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
      ctrl.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }

      const ps1 = ctrl.profileSettings
      const ps2 = ctrl.profileSettings
      expect(ps1).not.toBe(ps2) // different objects
      expect(ps1.desktop).not.toBe(ps2.desktop) // different nested objects
    })
  })
})
