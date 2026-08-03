import { describe, it, expect } from 'vitest'
import { SparkControls, type SparkSettings } from '$lib/spark/SparkControls'
import { buildProfileSettingsTransaction } from '$lib/studio/spark-controls/sparkSettingsTransaction'
import type { ProfileSettings } from '$lib/spark/SparkControls'
import { getGlobalBaseline } from '$lib/spark/deviceProfile'

/**
 * Minimal mock of the public useTransactions() contract from @threlte/studio/extensions.
 * Tests verify that the production transaction helper builds correct transactions.
 */
interface MockTransaction {
  object: object
  propertyPath: string
  value: ProfileSettings
  historicValue: ProfileSettings
  createHistoryRecord: boolean
  sync: boolean | undefined
}

interface MockTransactionsAPI {
  vitePluginEnabled: boolean
  builtTransactions: MockTransaction[]
  buildTransaction: (tx: MockTransaction) => MockTransaction
  commit: (txs: MockTransaction[]) => void
  onTransaction: (fn: (txs: MockTransaction[]) => void) => () => void
}

function createMockTransactions(): MockTransactionsAPI {
  const builtTransactions: MockTransaction[] = []

  return {
    vitePluginEnabled: true,
    builtTransactions,
    buildTransaction(tx) {
      builtTransactions.push(tx)
      return tx
    },
    commit(txs) {
      // Simulate: transaction guard strips sync for non-profileSettings attributes
      for (const tx of txs) {
        if (tx.propertyPath !== 'profileSettings') {
          tx.sync = undefined
        }
      }
    },
    onTransaction: () => () => {}, // no-op
  }
}

/**
 * Simulate Studio's actual transaction write callback.
 * Studio's buildTransaction() wraps the raw transaction with a `write` method
 * that assigns `value` to `object[propertyPath]` (or `historicValue` for undo).
 */
function simulateTransactionWrite(
  controls: SparkControls,
  propertyPath: string,
  writeValue: unknown,
): void {
  // This is what Studio's transaction.write() does:
  ;(controls as Record<string, unknown>)[propertyPath] = writeValue
}

describe('buildProfileSettingsTransaction (production helper)', () => {
  it('returns correct transaction shape', () => {
    const controls = new SparkControls()
    const historic: ProfileSettings = controls.profileSettings

    // Make a change via profileSettings setter
    controls.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }
    const newProfileSettings = controls.profileSettings

    const tx = buildProfileSettingsTransaction(controls, newProfileSettings, historic)

    expect(tx.object).toBe(controls)
    expect(tx.propertyPath).toBe('profileSettings')
    expect(tx.value).toBe(newProfileSettings)
    expect(tx.historicValue).toBe(historic)
    expect(tx.createHistoryRecord).toBe(true)
    expect(tx.sync).toBe(true)
    expect(tx.value.desktop.blurAmount).toBe(0.7)
  })

  it('transaction passes through guard with sync preserved', () => {
    const controls = new SparkControls()
    const transactions = createMockTransactions()
    const historic = controls.profileSettings

    // Make a change via profileSettings setter
    controls.profileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }
    const newProfileSettings = controls.profileSettings

    const tx = transactions.buildTransaction(
      buildProfileSettingsTransaction(controls, newProfileSettings, historic),
    )
    transactions.commit([tx])

    expect(tx.object).toBe(controls)
    expect(tx.propertyPath).toBe('profileSettings')
    expect(tx.sync).toBe(true) // profileSettings root passes through guard
    expect(tx.value.desktop.blurAmount).toBe(0.7)
  })

  it('transaction helper is used by extension for field edits', () => {
    const controls = new SparkControls()
    const transactions = createMockTransactions()

    const original = controls.profileSettings
    controls.profileSettings = { desktop: { lodSplatScale: 3 }, mobile: {} }
    const newProfileSettings = controls.profileSettings

    // This is exactly what the extension does
    const tx = transactions.buildTransaction(
      buildProfileSettingsTransaction(controls, newProfileSettings, original),
    )
    transactions.commit([tx])

    expect(tx.propertyPath).toBe('profileSettings')
    expect(tx.value.desktop.lodSplatScale).toBe(3)
    expect(tx.historicValue.desktop['lodSplatScale']).toBeUndefined()
  })
})

describe('SparkControls transaction semantics', () => {
  it('undo applies historic full profileSettings via writable setter', () => {
    const controls = new SparkControls()
    const original = controls.profileSettings

    // Make a change via profileSettings setter
    controls.profileSettings = { desktop: { blurAmount: 0.9 }, mobile: {} }

    // Undo: apply historic profileSettings through the writable setter
    controls.profileSettings = original

    // All fields should be restored to original
    const restored = controls.profileSettings
    expect(restored.desktop['blurAmount']).toBeUndefined()
    // blurAmount should be back to baseline
    expect(controls.settings.blurAmount).toBe(0.3)
  })

  it('redo re-applies the new profileSettings snapshot', () => {
    const controls = new SparkControls()
    const original = controls.profileSettings

    // Forward change
    controls.profileSettings = { desktop: { blurAmount: 0.9 }, mobile: {} }
    const afterChange = controls.profileSettings

    // Undo
    controls.profileSettings = original
    expect(controls.settings.blurAmount).toBe(0.3)

    // Redo
    controls.profileSettings = afterChange
    expect(controls.settings.blurAmount).toBe(0.9)
  })

  it('non-profileSettings transaction has sync stripped by guard', () => {
    const transactions = createMockTransactions()

    const emptyPS: ProfileSettings = { desktop: {}, mobile: {} }
    const tx = transactions.buildTransaction({
      object: new (class { })(),
      propertyPath: 'position',
      value: emptyPS,
      historicValue: emptyPS,
      createHistoryRecord: true,
      sync: true,
    })
    transactions.commit([tx])

    expect(tx.sync).toBeUndefined() // guard strips sync for non-profileSettings
  })

  it('individual field edit through setter validates and notifies', () => {
    const controls = new SparkControls()
    let notifiedKeys: Set<string> | null = null
    const unsub = controls.onChange((keys) => { notifiedKeys = keys })

    controls.blurAmount = 0.5
    expect(notifiedKeys).not.toBeNull()
    expect(notifiedKeys!.has('blurAmount')).toBe(true)
    expect(controls.settings.blurAmount).toBe(0.5)

    unsub()
  })

  it('invariant enforcement propagates coupled changes in notification', () => {
    const controls = new SparkControls()
    let notifiedKeys: Set<string> | null = null
    const unsub = controls.onChange((keys) => { notifiedKeys = keys })

    // Set coneFov0 above default coneFov (120)
    controls.coneFov0 = 150

    expect(notifiedKeys).not.toBeNull()
    // Both coneFov0 and coneFov should be in the changed set
    expect(notifiedKeys!.has('coneFov0')).toBe(true)
    expect(notifiedKeys!.has('coneFov')).toBe(true)
    expect(controls.settings.coneFov).toBeGreaterThanOrEqual(150)

    unsub()
  })
})

describe('Actual transaction write path (commit/undo/redo)', () => {
  const desktopBaseline = getGlobalBaseline('desktop')

  it('forward write updates profileSettings, settings, and notifies', () => {
    const controls = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
    let notified: Set<keyof SparkSettings> | null = null
    controls.onChange((keys) => { notified = keys })

    const historicPS = controls.profileSettings
    const newPS: ProfileSettings = { desktop: { blurAmount: 0.7 }, mobile: {} }

    // Build transaction
    const tx = buildProfileSettingsTransaction(controls, newPS, historicPS)

    // Simulate Studio's transaction.write(value) — writes tx.value to controls.profileSettings
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)

    // Verify profileSettings getter returns validated minimal overrides
    const ps = controls.profileSettings
    expect(ps.desktop.blurAmount).toBe(0.7)
    expect(ps.mobile).toEqual({})

    // Verify effective settings
    expect(controls.settings.blurAmount).toBe(0.7)

    // Verify notification
    expect(notified).not.toBeNull()
    expect(notified!.has('blurAmount')).toBe(true)
    expect(notified!.size).toBe(1)
  })

  it('undo write (historicValue) restores original state', () => {
    const controls = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
    let notifyCount = 0
    controls.onChange(() => { notifyCount++ })

    const originalPS = controls.profileSettings

    // Forward: write new value
    const newPS: ProfileSettings = { desktop: { blurAmount: 0.9 }, mobile: {} }
    const tx = buildProfileSettingsTransaction(controls, newPS, originalPS)
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)
    expect(controls.settings.blurAmount).toBe(0.9)
    expect(notifyCount).toBe(1)

    // Undo: write historicValue
    simulateTransactionWrite(controls, tx.propertyPath, tx.historicValue)

    // Verify restored
    expect(controls.settings.blurAmount).toBe(desktopBaseline.blurAmount)
    const ps = controls.profileSettings
    expect('blurAmount' in ps.desktop).toBe(false)
    expect(notifyCount).toBe(2) // second notification for undo
  })

  it('redo write re-applies the new value', () => {
    const controls = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = { desktop: { blurAmount: 0.9 }, mobile: {} }
    const tx = buildProfileSettingsTransaction(controls, newPS, originalPS)

    // Forward
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)
    expect(controls.settings.blurAmount).toBe(0.9)

    // Undo
    simulateTransactionWrite(controls, tx.propertyPath, tx.historicValue)
    expect(controls.settings.blurAmount).toBe(desktopBaseline.blurAmount)

    // Redo
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)
    expect(controls.settings.blurAmount).toBe(0.9)
  })

  it('write validates out-of-range persisted values', () => {
    const controls = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)

    // Simulate a stale/hand-authored override with out-of-range value
    const stalePS: ProfileSettings = { desktop: { lodSplatScale: 999, coneFov0: -50 }, mobile: {} }
    simulateTransactionWrite(controls, 'profileSettings', stalePS)

    // Values must be clamped through canonical validation
    expect(controls.settings.lodSplatScale).toBe(10) // clamped to max
    expect(controls.settings.coneFov0).toBe(0) // clamped to min
  })

  it('write preserves inactive profile across forward/undo/redo', () => {
    const controls = new SparkControls(undefined, 'desktop', {
      desktop: {},
      mobile: { maxPagedSplats: 2 * 65536 },
    }, desktopBaseline)

    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = {
      desktop: { blurAmount: 0.7 },
      mobile: { maxPagedSplats: 2 * 65536 },
    }
    const tx = buildProfileSettingsTransaction(controls, newPS, originalPS)

    // Forward
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)
    expect(controls.profileSettings.mobile.maxPagedSplats).toBe(2 * 65536)

    // Undo
    simulateTransactionWrite(controls, tx.propertyPath, tx.historicValue)
    expect(controls.profileSettings.mobile.maxPagedSplats).toBe(2 * 65536)

    // Redo
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)
    expect(controls.profileSettings.mobile.maxPagedSplats).toBe(2 * 65536)
  })

  it('write with coupled invariant: both fields in notification', () => {
    const controls = new SparkControls(undefined, 'desktop', { desktop: {}, mobile: {} }, desktopBaseline)
    let notified: Set<keyof SparkSettings> | null = null
    controls.onChange((keys) => { notified = keys })

    const originalPS = controls.profileSettings
    const newPS: ProfileSettings = {
      desktop: { coneFov0: 150, coneFov: 100 },
      mobile: {},
    }
    const tx = buildProfileSettingsTransaction(controls, newPS, originalPS)
    simulateTransactionWrite(controls, tx.propertyPath, tx.value)

    expect(notified!.has('coneFov0')).toBe(true)
    expect(notified!.has('coneFov')).toBe(true)
    expect(controls.settings.coneFov).toBe(150) // invariant applied
  })
})
