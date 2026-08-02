import { describe, it, expect, beforeEach } from 'vitest'
import { isScrollAnimator, isSparkControls, guardScrollAnimatorTransactions, type GuardTransaction } from '$lib/studio/scroll-animator/transactionGuard'
import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
import { SparkControls } from '$lib/spark/SparkControls'
import { activeSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'

describe('isScrollAnimator', () => {
  it('returns true for ScrollAnimator instances', () => {
    expect(isScrollAnimator(new ScrollAnimator())).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isScrollAnimator({})).toBe(false)
    expect(isScrollAnimator(null)).toBe(false)
    expect(isScrollAnimator(undefined)).toBe(false)
  })

  it('returns false for objects with isScrollAnimator: false', () => {
    expect(isScrollAnimator({ isScrollAnimator: false })).toBe(false)
  })

  it('returns false for branded objects without applyScrollPercentage', () => {
    expect(isScrollAnimator({ isScrollAnimator: true })).toBe(false)
  })

  it('returns true for structurally matching objects (HMR-safe)', () => {
    const fake = {
      isScrollAnimator: true,
      applyScrollPercentage: () => {},
    }
    expect(isScrollAnimator(fake)).toBe(true)
  })
})

describe('guardScrollAnimatorTransactions', () => {
  function makeTransaction(
    object: unknown,
    attributeName: string,
  ): GuardTransaction {
    return {
      object,
      sync: { attributeName },
    }
  }

  it('suppresses sync for position on ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'position')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('suppresses sync for rotation on ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'rotation')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('suppresses sync for scale on ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'scale')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('allows sync for root keyframes on ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'keyframes')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
    expect(txs[0].sync!.attributeName).toBe('keyframes')
  })

  it('allows sync for showChildCameraFrustumWhenSelected on ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'showChildCameraFrustumWhenSelected')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
    expect(txs[0].sync!.attributeName).toBe('showChildCameraFrustumWhenSelected')
  })

  it('allows sync for path-prefixed keyframes (e.g. scene.camera.keyframes)', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'scene.camera.keyframes')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
  })

  it('blocks descendant attribute keyframes.0', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'keyframes.0')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks descendant attribute scene.keyframes.position', () => {
    const animator = new ScrollAnimator()
    const txs: GuardTransaction[] = [makeTransaction(animator, 'scene.keyframes.position')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('leaves non-ScrollAnimator transactions untouched', () => {
    const obj = { isScrollAnimator: false }
    const txs: GuardTransaction[] = [makeTransaction(obj, 'position')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
  })

  it('handles mixed transactions', () => {
    const animator = new ScrollAnimator()
    const other = { name: 'other' }
    const txs: GuardTransaction[] = [
      makeTransaction(animator, 'position'),
      makeTransaction(other, 'position'),
      makeTransaction(animator, 'keyframes'),
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined() // animator position suppressed
    expect(txs[1].sync).toBeDefined() // other object preserved
    expect(txs[2].sync).toBeDefined() // animator keyframes preserved
  })

  it('handles transactions without sync', () => {
    const animator = new ScrollAnimator()
    const tx: GuardTransaction = {
      object: animator,
      sync: undefined,
    }
    guardScrollAnimatorTransactions([tx])
    expect(tx.sync).toBeUndefined()
  })
})

describe('isSparkControls', () => {
  it('returns true for SparkControls instances', () => {
    expect(isSparkControls(new SparkControls())).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isSparkControls({})).toBe(false)
    expect(isSparkControls(null)).toBe(false)
    expect(isSparkControls(undefined)).toBe(false)
  })

  it('returns false for ScrollAnimator', () => {
    expect(isSparkControls(new ScrollAnimator())).toBe(false)
  })

  it('returns true for structurally matching objects (HMR-safe)', () => {
    const fake = { isSparkControls: true }
    expect(isSparkControls(fake)).toBe(true)
  })
})

describe('SparkControls transaction guard', () => {
  function makeTransaction(
    object: unknown,
    attributeName: string,
  ): GuardTransaction {
    return {
      object,
      sync: { attributeName },
    }
  }

  beforeEach(() => {
    const controls = new SparkControls()
    activeSparkControlsRuntime.attach(controls, 'desktop', { sourceSyncEnabled: true })
  })

  it('suppresses sync for position on SparkControls', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'position')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('suppresses sync for rotation on SparkControls', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'rotation')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('suppresses sync for scale on SparkControls', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'scale')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('allows sync for profileSettings attribute', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'profileSettings')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeDefined()
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
      makeTransaction(controls, 'lodSplatScale'),
      makeTransaction(controls, 'coneFov0'),
      makeTransaction(controls, 'enableLod'),
      makeTransaction(controls, 'lodSplatCount'),
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
    expect(txs[1].sync).toBeUndefined()
    expect(txs[2].sync).toBeUndefined()
    expect(txs[3].sync).toBeUndefined()
  })

  it('blocks non-whitelisted attribute', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'someRandomField')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('blocks nested settings.lodSplatScale', () => {
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [makeTransaction(controls, 'settings.lodSplatScale')]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined()
  })

  it('does not weaken ScrollAnimator guard', () => {
    const animator = new ScrollAnimator()
    const controls = new SparkControls()
    const txs: GuardTransaction[] = [
      makeTransaction(animator, 'position'),
      makeTransaction(controls, 'position'),
      makeTransaction(animator, 'keyframes'),
      makeTransaction(controls, 'profileSettings'),
    ]
    guardScrollAnimatorTransactions(txs)
    expect(txs[0].sync).toBeUndefined() // animator position suppressed
    expect(txs[1].sync).toBeUndefined() // controls position suppressed
    expect(txs[2].sync).toBeDefined()   // animator keyframes preserved
    expect(txs[3].sync).toBeDefined()   // controls profileSettings preserved
  })
})
