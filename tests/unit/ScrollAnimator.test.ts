import { describe, it, expect } from 'vitest'
import { ScrollAnimator } from '$lib/spark/ScrollAnimator'
import type { ScrollKeyframe } from '$lib/spark/scrollAnimation'

describe('ScrollAnimator', () => {
  it('is branded as ScrollAnimator', () => {
    const animator = new ScrollAnimator()
    expect(animator.isScrollAnimator).toBe(true)
    expect(animator.type).toBe('ScrollAnimator')
  })

  it('starts with empty keyframes', () => {
    const animator = new ScrollAnimator()
    expect(animator.keyframes).toEqual([])
  })

  it('accepts and stores keyframes via setter', () => {
    const animator = new ScrollAnimator()
    const frames: ScrollKeyframe[] = [
      { scroll: 0, position: [1, 2, 3], rotation: [0.1, 0.2, 0.3] },
      { scroll: 100, position: [4, 5, 6], rotation: [0.4, 0.5, 0.6] },
    ]
    animator.keyframes = frames
    const result = animator.keyframes
    expect(result).toHaveLength(2)
    expect(result[0].position).toEqual([1, 2, 3])
    // Should be a deep copy
    expect(result).not.toBe(frames)
    expect(result[0]).not.toBe(frames[0])
  })

  it('applyScrollPercentage does nothing with zero frames', () => {
    const animator = new ScrollAnimator()
    // Set initial position to something non-zero
    animator.position.set(10, 20, 30)
    animator.applyScrollPercentage(50)
    // Position should be unchanged
    expect(animator.position.x).toBeCloseTo(10)
    expect(animator.position.y).toBeCloseTo(20)
    expect(animator.position.z).toBeCloseTo(30)
  })

  it('applyScrollPercentage applies local transforms', () => {
    const animator = new ScrollAnimator()
    animator.keyframes = [
      { scroll: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
      { scroll: 100, position: [0, 30, 0], rotation: [0, 0, 0] },
    ]
    animator.applyScrollPercentage(50)
    expect(animator.position.y).toBeCloseTo(15)
  })

  it('applyScrollPercentage applies exact keyframe at endpoints', () => {
    const animator = new ScrollAnimator()
    animator.keyframes = [
      { scroll: 0, position: [0, 0, -1], rotation: [0, 0, 0] },
      { scroll: 100, position: [0, 30, -1], rotation: [0, 0, 0] },
    ]
    animator.applyScrollPercentage(0)
    expect(animator.position.x).toBeCloseTo(0)
    expect(animator.position.y).toBeCloseTo(0)
    expect(animator.position.z).toBeCloseTo(-1)

    animator.applyScrollPercentage(100)
    expect(animator.position.y).toBeCloseTo(30)
  })

  it('keyframes getter returns canonical deep copy', () => {
    const animator = new ScrollAnimator()
    animator.keyframes = [
      { scroll: 100, position: [0, 0, 0], rotation: [0, 0, 0] },
      { scroll: 0, position: [0, 0, 0], rotation: [0, 0, 0] },
    ]
    const result = animator.keyframes
    // Should be sorted
    expect(result[0].scroll).toBe(0)
    expect(result[1].scroll).toBe(100)
  })

  it('showChildCameraFrustumWhenSelected defaults to false', () => {
    const animator = new ScrollAnimator()
    expect(animator.showChildCameraFrustumWhenSelected).toBe(false)
  })

  it('showChildCameraFrustumWhenSelected can be set to true', () => {
    const animator = new ScrollAnimator()
    animator.showChildCameraFrustumWhenSelected = true
    expect(animator.showChildCameraFrustumWhenSelected).toBe(true)
  })
})
