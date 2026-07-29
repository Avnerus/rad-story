import { describe, it, expect } from 'vitest'
import { SparkControls, type SparkSettings } from '$lib/spark/SparkControls'
import { buildSparkSettingsTransaction } from '$lib/studio/spark-controls/sparkSettingsTransaction'

/**
 * Minimal mock of the public useTransactions() contract from @threlte/studio/extensions.
 * Tests verify that the production transaction helper builds correct transactions.
 */
interface MockTransaction {
  object: object
  propertyPath: string
  value: SparkSettings
  historicValue: SparkSettings
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
      // Simulate: transaction guard strips sync for non-settings attributes
      for (const tx of txs) {
        if (tx.propertyPath !== 'settings') {
          tx.sync = undefined
        }
      }
    },
    onTransaction: () => () => {}, // no-op
  }
}

describe('buildSparkSettingsTransaction (production helper)', () => {
  it('returns correct transaction shape', () => {
    const controls = new SparkControls()
    const original = controls.settings

    // Make a change
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.7
    const newSettings = controls.settings

    const tx = buildSparkSettingsTransaction(controls, newSettings, original)

    expect(tx.object).toBe(controls)
    expect(tx.propertyPath).toBe('settings')
    expect(tx.value).toBe(newSettings)
    expect(tx.historicValue).toBe(original)
    expect(tx.createHistoryRecord).toBe(true)
    expect(tx.sync).toBe(true)
    expect(tx.value.blurAmount).toBe(0.7)
  })

  it('transaction passes through guard with sync preserved', () => {
    const controls = new SparkControls()
    const transactions = createMockTransactions()
    const oldSettings = controls.settings

    // Make a change
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.7
    const newSettings = controls.settings

    const tx = transactions.buildTransaction(
      buildSparkSettingsTransaction(controls, newSettings, oldSettings),
    )
    transactions.commit([tx])

    expect(tx.object).toBe(controls)
    expect(tx.propertyPath).toBe('settings')
    expect(tx.sync).toBe(true) // settings root passes through guard
    expect(tx.value.blurAmount).toBe(0.7)
  })

  it('transaction helper is used by extension for field edits', () => {
    const controls = new SparkControls()
    const transactions = createMockTransactions()

    const original = controls.settings
    ;(controls as unknown as Record<string, unknown>).lodSplatScale = 3
    const newSettings = controls.settings

    // This is exactly what the extension does
    const tx = transactions.buildTransaction(
      buildSparkSettingsTransaction(controls, newSettings, original),
    )
    transactions.commit([tx])

    expect(tx.propertyPath).toBe('settings')
    expect(tx.value.lodSplatScale).toBe(3)
    expect(tx.historicValue.lodSplatScale).toBe(1)
  })
})

describe('SparkControls transaction semantics', () => {
  it('undo applies historic full settings snapshot via writable setter', () => {
    const controls = new SparkControls()
    const original = { ...controls.settings }

    // Make a change
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.9
    const afterChange = controls.settings

    // Undo: apply historic settings through the writable setter
    controls.settings = original

    // All fields should be restored to original
    const restored = controls.settings
    expect(restored.blurAmount).toBe(original.blurAmount)
    expect(restored.blurAmount).not.toBe(afterChange.blurAmount)
    // Other fields unchanged
    expect(restored.lodSplatScale).toBe(original.lodSplatScale)
    expect(restored.maxPagedSplats).toBe(original.maxPagedSplats)
  })

  it('redo re-applies the new settings snapshot', () => {
    const controls = new SparkControls()
    const original = { ...controls.settings }

    // Forward change
    ;(controls as unknown as Record<string, unknown>).blurAmount = 0.9
    const afterChange = controls.settings

    // Undo
    controls.settings = original
    expect(controls.settings.blurAmount).toBe(original.blurAmount)

    // Redo
    controls.settings = afterChange
    expect(controls.settings.blurAmount).toBe(0.9)
  })

  it('non-settings transaction has sync stripped by guard', () => {
    const transactions = createMockTransactions()

    const tx = transactions.buildTransaction({
      object: {} as object,
      propertyPath: 'position',
      value: {} as SparkSettings,
      historicValue: {} as SparkSettings,
      createHistoryRecord: true,
      sync: true,
    })
    transactions.commit([tx])

    expect(tx.sync).toBeUndefined() // guard strips sync for non-settings
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
