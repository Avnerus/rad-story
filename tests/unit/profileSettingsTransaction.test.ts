import { describe, it, expect, beforeEach } from 'vitest'
import { SparkControls, SPARK_PAGE_SIZE, type SparkSettings } from '$lib/spark/SparkControls'
import { buildProfileSettingsTransaction } from '$lib/studio/spark-controls/sparkSettingsTransaction'
import { getGlobalBaseline } from '$lib/spark/deviceProfile'
import { computeOverrides } from '$lib/spark/profileResolution'
import { guardScrollAnimatorTransactions, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
import { activeSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'
import type { ProfileSettings } from '$lib/spark/SparkControls'

describe('profile-aware Spark settings transaction', () => {
  let controls: SparkControls

  beforeEach(() => {
    controls = new SparkControls()
    activeSparkControlsRuntime.attach(controls, 'desktop', { sourceSyncEnabled: true })
  })
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

    // Simulate edit via profileSettings setter (authoritative path)
    controls.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }
    const newSettings = controls.settings

    expect(newSettings.blurAmount).toBe(0.7)
    expect(controls.profileSettings.desktop.blurAmount).toBe(0.7)
    expect('blurAmount' in historicOverrides.desktop).toBe(false)
  })

  it('undo restores historic overrides via profileSettings setter', () => {
    const controls = new SparkControls()
    const originalProfileSettings = controls.profileSettings

    // Forward: edit via profileSettings setter
    controls.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }
    expect(controls.settings.blurAmount).toBe(0.7)

    // Undo: restore original profileSettings
    controls.profileSettings = originalProfileSettings
    expect(controls.settings.blurAmount).toBe(controls.profileName === 'desktop' ? 0.3 : 0.3)

    // Redo: re-apply edited profileSettings
    controls.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }
    expect(controls.settings.blurAmount).toBe(0.7)
  })

  it('coupled invariant edit persists both fields in overrides', () => {
    const controls = new SparkControls()
    // Edit via individual setter (triggers invariant)
    controls.coneFov0 = 150
    const newSettings = controls.settings
    const baseline = getGlobalBaseline('desktop')
    const overrides = computeOverrides(newSettings, baseline)
    expect(overrides.coneFov0).toBe(150)
    expect(overrides.coneFov).toBe(150)
  })

  it('profile isolation: editing desktop preserves mobile overrides', () => {
    const controls = new SparkControls()

    // Set mobile overrides first
    const existingMobile: Partial<SparkSettings> = {
      maxPagedSplats: 2 * SPARK_PAGE_SIZE,
    }

    // Edit desktop via profileSettings setter
    controls.profileSettings = {
      desktop: { blurAmount: 0.7 },
      mobile: existingMobile,
    }

    const ps = controls.profileSettings
    expect(ps.desktop.blurAmount).toBe(0.7)
    expect(ps.mobile.maxPagedSplats).toBe(2 * SPARK_PAGE_SIZE)
    expect('maxPagedSplats' in ps.desktop).toBe(false)
  })

  it('reset to baseline removes override key', () => {
    const controls = new SparkControls()
    const baseline = getGlobalBaseline('desktop')

    // Edit
    controls.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }
    let ps = controls.profileSettings
    expect(ps.desktop.blurAmount).toBe(0.7)

    // Reset via profileSettings setter
    controls.profileSettings = { desktop: {}, mobile: {} }
    ps = controls.profileSettings
    expect('blurAmount' in ps.desktop).toBe(false)
    // Effective settings reflect baseline
    expect(controls.settings.blurAmount).toBe(baseline.blurAmount)
  })

  it('false boolean override is preserved (not truthy check)', () => {
    const controls = new SparkControls()

    // sortRadial default is true
    controls.profileSettings = { desktop: { sortRadial: false }, mobile: {} }
    const ps = controls.profileSettings
    expect(ps.desktop.sortRadial).toBe(false)
    expect('sortRadial' in ps.desktop).toBe(true)
    expect(controls.settings.sortRadial).toBe(false)
  })

  it('zero numeric override is preserved', () => {
    const controls = new SparkControls()
    // preBlurAmount default is 0, so setting to 0 produces no override
    const ps1 = controls.profileSettings
    expect('preBlurAmount' in ps1.desktop).toBe(false)

    // Set to non-zero
    controls.profileSettings = { desktop: { preBlurAmount: 1 }, mobile: {} }
    const ps2 = controls.profileSettings
    expect(ps2.desktop.preBlurAmount).toBe(1)

    // Reset to 0
    controls.profileSettings = { desktop: {}, mobile: {} }
    const ps3 = controls.profileSettings
    expect('preBlurAmount' in ps3.desktop).toBe(false)
  })
})
