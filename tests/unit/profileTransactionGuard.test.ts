import { describe, it, expect, beforeEach } from 'vitest'
import { guardScrollAnimatorTransactions, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
import { SparkControls } from '$lib/spark/SparkControls'
import { activeSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'

describe('SparkControls transaction guard — profileSettings', () => {
  function makeTransaction(
    object: unknown,
    attributeName: string,
  ): GuardTransaction {
    return {
      object,
      sync: { attributeName },
    }
  }

  const controls = new SparkControls()

  beforeEach(() => {
    // Set up a persistable controller so profileSettings sync is allowed
    activeSparkControlsRuntime.attach(controls, 'desktop', { sourceSyncEnabled: true })
  })

  it('allows sync for profileSettings attribute', () => {
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
    expect(txs[0].sync!.attributeName).toBe('profileSettings')
  })

  it('blocks legacy settings attribute', () => {
    const txs: GuardTransaction[] = [makeTransaction(controls, 'settings')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks individual field names', () => {
    const txs: GuardTransaction[] = [
      makeTransaction(controls, 'blurAmount'),
      makeTransaction(controls, 'coneFov0'),
      makeTransaction(controls, 'sortRadial'),
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
    expect(txs[1].sync).toBeUndefined()
    expect(txs[2].sync).toBeUndefined()
  })

  it('blocks nested profileSettings.desktop', () => {
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings.desktop')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks nested profileSettings.mobile.blurAmount', () => {
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings.mobile.blurAmount')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('suppresses position/rotation/scale on SparkControls', () => {
    const txs: GuardTransaction[] = [
      makeTransaction(controls, 'position'),
      makeTransaction(controls, 'rotation'),
      makeTransaction(controls, 'scale'),
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
    expect(txs[1].sync).toBeUndefined()
    expect(txs[2].sync).toBeUndefined()
  })
})

describe('SparkControls transaction guard — non-persistable controller blocks all sync', () => {
  function makeTransaction(
    object: unknown,
    attributeName: string,
  ): GuardTransaction {
    return {
      object,
      sync: { attributeName },
    }
  }

  it('blocks profileSettings when controller is non-persistable', () => {
    const controls = new SparkControls()
    activeSparkControlsRuntime.attach(controls, 'desktop', { sourceSyncEnabled: false })
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks all Spark attributes when controller is non-persistable', () => {
    const controls = new SparkControls()
    activeSparkControlsRuntime.attach(controls, 'desktop', { sourceSyncEnabled: false })
    const txs: GuardTransaction[] = [
      makeTransaction(controls, 'profileSettings'),
      makeTransaction(controls, 'settings'),
      makeTransaction(controls, 'blurAmount'),
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
    expect(txs[1].sync).toBeUndefined()
    expect(txs[2].sync).toBeUndefined()
  })
})
