import { describe, it, expect, vi } from 'vitest'
import { Object3D } from 'three'
import { isScrollAnimator } from '$lib/studio/scroll-animator/transactionGuard'
import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'

/**
 * Minimal HMR-safe ScrollAnimator stand-in for testing.
 * Extends Object3D so that traverse visits it.
 * Includes all properties validated by the sound type guard.
 */
class FakeScrollAnimator extends Object3D {
  declare isScrollAnimator: boolean
  keyframes: ScrollKeyframe[] = []
  applyScrollPercentage = vi.fn()
  constructor() {
    super()
    this.isScrollAnimator = true
  }
}

describe('scene-wide ScrollAnimator traversal', () => {
  it('isScrollAnimator works for structurally matching objects (HMR-safe)', () => {
    const fake = new FakeScrollAnimator()
    expect(isScrollAnimator(fake)).toBe(true)
  })

  it('isScrollAnimator rejects ordinary Object3D', () => {
    expect(isScrollAnimator(new Object3D())).toBe(false)
  })

  it('traverse applies to every branded animator', () => {
    const scene = new Object3D()

    const animator1 = new FakeScrollAnimator()
    const animator2 = new FakeScrollAnimator()
    const ordinary = new Object3D()

    scene.add(animator1)
    scene.add(animator2)
    scene.add(ordinary)

    // Simulate the scene.traverse pattern used in SceneRuntime
    scene.traverse((object) => {
      if (isScrollAnimator(object)) {
        object.applyScrollPercentage(50)
      }
    })

    expect(animator1.applyScrollPercentage).toHaveBeenCalledWith(50)
    expect(animator2.applyScrollPercentage).toHaveBeenCalledWith(50)
  })

  it('traverse handles nested animators', () => {
    const scene = new Object3D()
    const parent = new Object3D()
    const animator = new FakeScrollAnimator()

    parent.add(animator)
    scene.add(parent)

    scene.traverse((object) => {
      if (isScrollAnimator(object)) {
        object.applyScrollPercentage(75)
      }
    })

    expect(animator.applyScrollPercentage).toHaveBeenCalledWith(75)
  })
})
