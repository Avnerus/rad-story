import { describe, it, expect } from 'vitest'
import { SparkControls, SETTINGS_KEYS, SPARK_PAGE_SIZE, type SparkSettings } from '$lib/spark/SparkControls'
import { buildProfileSettingsTransaction } from '$lib/studio/spark-controls/sparkSettingsTransaction'
import { getGlobalBaseline, computeOverrides } from '$lib/spark/deviceProfile'
import { guardScrollAnimatorTransactions, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
import type { ProfileSettings } from '$lib/scenes/sceneObjects'

describe('profile-aware Spark settings transaction', () => {
  it('builds correct profileSettings transaction shape', () => {
    const controls = new SparkControls()
    const historic: ProfileSettings = { desktop: {}, mobile: {} }
    const value: ProfileSettings = {
      desktop: { blurAmount: 0.7 },
      mobile: {},
    }

    const tx = buildProfileSettingsTransaction(controls, value, historic)

    expect(tx.object).toBe(controls)
    expect(tx.propertyPath).toBe('profileSettings')
    expect(tx.value).toBe(value)
    expect(tx.historicValue).toBe(historic)
    expect(tx.createHistoryRecord).toBe(true)
    expect(tx.sync).toBe(true)
  })

  it('profileSettings transaction passes through guard', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [
      {
        object: controls,
        sync: { attributeName: 'profileSettings' },
      },
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
    expect(txs[0].sync!.attributeName).toBe('profileSettings')
  })

  it('nested profileSettings.desktop is blocked by guard', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [
      {
        object: controls,
        sync: { attributeName: 'profileSettings.desktop' },
      },
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('nested profileSettings.mobile.blurAmount is blocked by guard', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [
      {
        object: controls,
        sync: { attributeName: 'profileSettings.mobile.blurAmount' },
      },
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('historicValue and value are distinct after edit', () => {
    const controls = new SparkControls()
    const historicOverrides: ProfileSettings = { desktop: {}, mobile: {} }

    // Simulate edit: change blurAmount
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.7
    const newSettings = controls.settings

    // Compute new overrides
    const newDesktopOverrides = computeOverrides('desktop', newSettings)
    const newOverrides: ProfileSettings = {
      desktop: newDesktopOverrides,
      mobile: {},
    }

    const tx = buildProfileSettingsTransaction(controls, newOverrides, historicOverrides)

    expect(tx.historicValue.desktop).toEqual({})
    // blurAmount is definitely in the overrides
    expect(tx.value.desktop.blurAmount).toBe(0.7)
    // historic had no blurAmount override
    expect('blurAmount' in tx.historicValue.desktop).toBe(false)
  })

  it('undo restores historic overrides', () => {
    const controls = new SparkControls()
    const originalSettings = controls.settings

    // Forward: edit blurAmount
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.7
    const editedSettings = controls.settings

    // Undo: restore original settings through settings setter
    controls.settings = originalSettings
    const restoredSettings = controls.settings

    // Verify restored settings match original
    expect(restoredSettings.blurAmount).toBe(originalSettings.blurAmount)
    for (const key of SETTINGS_KEYS) {
      expect(restoredSettings[key]).toBe(originalSettings[key])
    }

    // Redo: re-apply edited settings
    controls.settings = editedSettings
    const redoneSettings = controls.settings
    expect(redoneSettings.blurAmount).toBe(0.7)
  })

  it('coupled invariant edit persists both fields in overrides', () => {
    const controls = new SparkControls()
    // Default: coneFov0=90, coneFov=120

    // Edit coneFov0 to 150 (forces coneFov to 150)
    ;(controls as unknown as Record<string, unknown>).coneFov0 = 150
    const newSettings = controls.settings

    const overrides = computeOverrides('desktop', newSettings)
    expect(overrides.coneFov0).toBe(150)
    expect(overrides.coneFov).toBe(150)
  })

  it('profile isolation: editing desktop preserves mobile overrides', () => {
    const controls = new SparkControls()

    // Simulate existing mobile overrides
    const existingMobile: Partial<SparkSettings> = {
      maxPagedSplats: 2 * SPARK_PAGE_SIZE,
    }

    // Edit desktop
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.7
    const newSettings = controls.settings

    const newDesktopOverrides = computeOverrides('desktop', newSettings)
    const newOverrides: ProfileSettings = {
      desktop: newDesktopOverrides,
      mobile: existingMobile,
    }

    // Desktop has blurAmount override
    expect(newOverrides.desktop.blurAmount).toBe(0.7)
    // Mobile preserved
    expect(newOverrides.mobile.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
    // Desktop does NOT have mobile's overrides
    expect('maxPagedSplats' in newOverrides.desktop).toBe(false)
  })

  it('reset to baseline removes override key', () => {
    const controls = new SparkControls()
    const baseline = getGlobalBaseline('desktop')

    // Edit
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.7
    let overrides = computeOverrides('desktop', controls.settings)
    expect(overrides.blurAmount).toBe(0.7)

    // Reset
    ;(controls as unknown as Record<string, unknown>).blurAmount = baseline.blurAmount
    overrides = computeOverrides('desktop', controls.settings)
    expect('blurAmount' in overrides).toBe(false)
  })

  it('false boolean override is preserved (not truthy check)', () => {
    const controls = new SparkControls()

    // sortRadial default is true
    ;(controls as unknown as Record<string, unknown>).sortRadial = false
    const overrides = computeOverrides('desktop', controls.settings)
    expect(overrides.sortRadial).toBe(false)
    expect('sortRadial' in overrides).toBe(true)
  })

  it('zero numeric override is preserved', () => {
    const controls = new SparkControls()
    // preBlurAmount default is 0, so setting to 0 produces no override
    const overrides1 = computeOverrides('desktop', controls.settings)
    expect('preBlurAmount' in overrides1).toBe(false)

    // Set to non-zero
    ;(controls as unknown as Record<string, unknown>).preBlurAmount = 1
    const overrides2 = computeOverrides('desktop', controls.settings)
    expect(overrides2.preBlurAmount).toBe(1)

    // Reset to 0
    ;(controls as unknown as Record<string, unknown>).preBlurAmount = 0
    const overrides3 = computeOverrides('desktop', controls.settings)
    expect('preBlurAmount' in overrides3).toBe(false)
  })
})
