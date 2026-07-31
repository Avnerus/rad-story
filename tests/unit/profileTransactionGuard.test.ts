import { describe, it, expect } from 'vitest'
import { guardScrollAnimatorTransactions, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
import { SparkControls } from '$lib/spark/SparkControls'

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

  it('allows sync for profileSettings attribute', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
    expect(txs[0].sync!.attributeName).toBe('profileSettings')
  })

  it('blocks legacy settings attribute', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'settings')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks individual field names', () => {
    const controls = new SparkControls()
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
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings.desktop')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks nested profileSettings.mobile.blurAmount', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings.mobile.blurAmount')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('suppresses position/rotation/scale on SparkControls', () => {
    const controls = new SparkControls()
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
