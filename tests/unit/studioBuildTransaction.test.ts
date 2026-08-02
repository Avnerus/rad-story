import { describe, it, expect } from 'vitest'
import { SparkControls } from '$lib/spark/SparkControls'
import type { ProfileSettings } from '$lib/spark/SparkControls'
import { resolvePropertyPath } from '@threlte/core'

/**
 * Integration test: Studio's actual transaction write semantics.
 *
 * Uses Studio's real `resolvePropertyPath` from @threlte/core and the exact
 * write callback pattern from Studio's internal `buildTransaction`.
 *
 * Studio's buildTransaction (from @threlte/studio) creates a transaction with:
 *   - `write(object, data)` that resolves the property path and assigns `target[key] = data`
 *   - For Three.js objects with `.copy()`, it uses `target[key].copy(data)`
 *   - For plain objects (like ProfileSettings), it does direct assignment
 *
 * The `write` callback is what Studio calls for commit, undo, and redo.
 */
interface StudioTransaction {
  object: object
  propertyPath: string
  value: ProfileSettings
  historicValue: ProfileSettings
  createHistoryRecord: boolean
  sync: boolean
  /** Studio's write callback — resolves property path and assigns */
  write(obj: object, data: unknown): void
}

/**
 * Build a transaction using Studio's actual `resolvePropertyPath` and write
 * semantics from @threlte/studio's internal buildTransaction.
 *
 * This replicates the exact callback Studio generates, using the same
 * property resolution and assignment logic. The only difference from
 * Studio's real buildTransaction is the source-metadata derivation
 * (userData.threlteStudio), which is not needed for write semantics.
 */
function buildStudioTransaction(options: {
  object: object
  propertyPath: string
  value: ProfileSettings
  historicValue: ProfileSettings
  createHistoryRecord?: boolean
  sync?: boolean
}): StudioTransaction {
  const { object, propertyPath, value, historicValue, createHistoryRecord = true, sync = true } = options

  // Use Studio's actual property path resolver
  const { target, key } = resolvePropertyPath(object, propertyPath)

  return {
    object,
    propertyPath,
    value,
    historicValue,
    createHistoryRecord,
    sync,
    /**
     * Exact write semantics from Studio's buildTransaction.
     * For plain property paths (no nested dots), target === object and key === propertyPath.
     * For SparkControls.profileSettings, this invokes the profileSettings setter.
     */
    write(obj: object, data: unknown): void {
      // Studio checks for Three.js .copy() first, falls back to direct assignment
      const targetRecord = target as Record<string, unknown>
      const currentValue = targetRecord[key]
      const dataObj = data as Record<string, unknown>
      if (
        typeof data === 'object' &&
        data !== null &&
        'copy' in data &&
        typeof dataObj.copy === 'function' &&
        typeof currentValue === 'object' &&
        currentValue !== null &&
        'copy' in currentValue &&
        typeof (currentValue as Record<string, unknown>).copy === 'function'
      ) {
        ;(currentValue as Record<string, unknown>).copy(data)
        return
      }
      targetRecord[key] = data
    },
  }
}

describe('Studio buildTransaction write semantics (commit/undo/redo)', () => {
  it('forward write via Studio write callback updates settings and profileSettings', () => {
    const controls = new SparkControls()
    let notified: Set<keyof import('$lib/spark/SparkControls').SparkSettings> | null = null
    controls.onChange((keys) => { notified = keys })

    const historicPS = controls.profileSettings
    const newPS: ProfileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }

    const tx = buildStudioTransaction({
      object: controls,
      propertyPath: 'profileSettings',
      value: newPS,
      historicValue: historicPS,
    })

    // Invoke Studio's write callback
    tx.write(controls, tx.value)

    expect(controls.settings.blurAmount).toBe(0.7)
    expect(controls.profileSettings.desktop.blurAmount).toBe(0.7)
    expect(notified).not.toBeNull()
    expect(notified!.has('blurAmount')).toBe(true)
  })

  it('undo write (historicValue) restores original state', () => {
    const controls = new SparkControls()
    let notifyCount = 0
    controls.onChange(() => { notifyCount++ })

    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = { desktop: { blurAmount: 0.9 }, mobile: {} }

    const tx = buildStudioTransaction({
      object: controls,
      propertyPath: 'profileSettings',
      value: newPS,
      historicValue: originalPS,
    })

    // Forward write
    tx.write(controls, tx.value)
    expect(controls.settings.blurAmount).toBe(0.9)
    expect(notifyCount).toBe(1)

    // Undo: Studio calls write(obj, historicValue)
    tx.write(controls, tx.historicValue)
    expect(controls.settings.blurAmount).toBe(0.3)
    expect(notifyCount).toBe(2)
  })

  it('redo write re-applies the new value', () => {
    const controls = new SparkControls()
    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = { desktop: { blurAmount: 0.9 }, mobile: {} }

    const tx = buildStudioTransaction({
      object: controls,
      propertyPath: 'profileSettings',
      value: newPS,
      historicValue: originalPS,
    })

    tx.write(controls, tx.value)
    expect(controls.settings.blurAmount).toBe(0.9)

    tx.write(controls, tx.historicValue)
    expect(controls.settings.blurAmount).toBe(0.3)

    tx.write(controls, tx.value)
    expect(controls.settings.blurAmount).toBe(0.9)
  })

  it('write validates out-of-range persisted values through canonical path', () => {
    const controls = new SparkControls()

    // Stale/hand-authored override with out-of-range value
    const stalePS: ProfileSettings = { desktop: { lodSplatScale: 999, coneFov0: -50 }, mobile: {} }

    const tx = buildStudioTransaction({
      object: controls,
      propertyPath: 'profileSettings',
      value: stalePS,
      historicValue: controls.profileSettings,
    })

    tx.write(controls, tx.value)

    expect(controls.settings.lodSplatScale).toBe(10) // clamped to max
    expect(controls.settings.coneFov0).toBe(0) // clamped to min
  })

  it('write preserves inactive profile across forward/undo/redo', () => {
    const controls = new SparkControls(undefined, 'desktop', {
      desktop: {},
      mobile: { maxPagedSplats: 2 * 65536 },
    })

    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = {
      desktop: { blurAmount: 0.7 },
      mobile: { maxPagedSplats: 2 * 65536 },
    }

    const tx = buildStudioTransaction({
      object: controls,
      propertyPath: 'profileSettings',
      value: newPS,
      historicValue: originalPS,
    })

    tx.write(controls, tx.value)
    expect(controls.profileSettings.mobile.maxPagedSplats).toBe(2 * 65536)

    tx.write(controls, tx.historicValue)
    expect(controls.profileSettings.mobile.maxPagedSplats).toBe(2 * 65536)

    tx.write(controls, tx.value)
    expect(controls.profileSettings.mobile.maxPagedSplats).toBe(2 * 65536)
  })

  it('write with coupled invariant: both fields in notification', () => {
    const controls = new SparkControls()
    let notified: Set<keyof import('$lib/spark/SparkControls').SparkSettings> | null = null
    controls.onChange((keys) => { notified = keys })

    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = {
      desktop: { coneFov0: 150, coneFov: 100 },
      mobile: {},
    }

    const tx = buildStudioTransaction({
      object: controls,
      propertyPath: 'profileSettings',
      value: newPS,
      historicValue: originalPS,
    })

    tx.write(controls, tx.value)

    expect(notified!.has('coneFov0')).toBe(true)
    expect(notified!.has('coneFov')).toBe(true)
    expect(controls.settings.coneFov).toBe(150)
  })

  it('uses Studio resolvePropertyPath for property resolution', () => {
    const controls = new SparkControls()
    const { target, key } = resolvePropertyPath(controls, 'profileSettings')

    // For a simple property path, target is the object itself
    expect(target).toBe(controls)
    expect(key).toBe('profileSettings')
  })
})
