import { describe, it, expect } from 'vitest'
import { SparkControls } from '$lib/spark/SparkControls'
import { buildProfileSettingsTransaction } from '$lib/studio/spark-controls/sparkSettingsTransaction'
import type { ProfileSettings } from '$lib/spark/SparkControls'

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

    const tx = transactions.buildTransaction({
      object: {} as object,
      propertyPath: 'position',
      value: {} as ProfileSettings,
      historicValue: {} as ProfileSettings,
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

    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.5
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
    ;(controls as unknown as Record<string, unknown>).coneFov0 = 150

    expect(notifiedKeys).not.toBeNull()
    // Both coneFov0 and coneFov should be in the changed set
    expect(notifiedKeys!.has('coneFov0')).toBe(true)
    expect(notifiedKeys!.has('coneFov')).toBe(true)
    expect(controls.settings.coneFov).toBeGreaterThanOrEqual(150)

    unsub()
  })
})
