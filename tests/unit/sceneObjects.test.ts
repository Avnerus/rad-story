import { describe, it, expect } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import { createSceneObjects } from '$lib/scenes/sceneObjects'
import type { DeviceProfileName } from '$lib/types'

/** Active profile name for testing. */
const testProfileName: DeviceProfileName = 'desktop'

describe('createSceneObjects', () => {
  it('returns all required fields', () => {
    const objs = createSceneObjects(testProfileName)
    expect(objs.camera).toBeDefined()
    expect(objs.cameraTarget).toBeDefined()
    expect(objs.cameraAnimator).toBeDefined()
    expect(objs.targetAnimator).toBeDefined()
    expect(objs.sparkControls).toBeDefined()
    expect(objs.splatWrapper).toBeDefined()
  })

  it('camera is a PerspectiveCamera', () => {
    const objs = createSceneObjects(testProfileName)
    expect(objs.camera instanceof PerspectiveCamera).toBe(true)
  })

  it('cameraTarget is an Object3D with name CameraTarget', () => {
    const objs = createSceneObjects(testProfileName)
    expect(objs.cameraTarget instanceof Object3D).toBe(true)
    expect(objs.cameraTarget.name).toBe('CameraTarget')
  })

  it('animators are ScrollAnimators', () => {
    const objs = createSceneObjects(testProfileName)
    expect(objs.cameraAnimator.isScrollAnimator).toBe(true)
    expect(objs.targetAnimator.isScrollAnimator).toBe(true)
  })

  it('sparkControls is a SparkControls instance', () => {
    const objs = createSceneObjects(testProfileName)
    expect(objs.sparkControls.isSparkControls).toBe(true)
  })

  it('splatWrapper is an Object3D with name SplatWrapper', () => {
    const objs = createSceneObjects(testProfileName)
    expect(objs.splatWrapper instanceof Object3D).toBe(true)
    expect(objs.splatWrapper.name).toBe('SplatWrapper')
  })
})

describe('createSceneObjects isolation', () => {
  it('two calls produce distinct wrappers', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)
    expect(a.splatWrapper).not.toBe(b.splatWrapper)
  })

  it('two calls produce distinct cameras', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)
    expect(a.camera).not.toBe(b.camera)
    expect(a.camera.uuid).not.toBe(b.camera.uuid)
  })

  it('two calls produce distinct camera targets', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)
    expect(a.cameraTarget).not.toBe(b.cameraTarget)
  })

  it('two calls produce distinct animators', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)
    expect(a.cameraAnimator).not.toBe(b.cameraAnimator)
    expect(a.targetAnimator).not.toBe(b.targetAnimator)
  })

  it('two calls produce distinct SparkControls', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)
    expect(a.sparkControls).not.toBe(b.sparkControls)
  })

  it('mutating settings on one does not affect the other', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)

    a.sparkControls.blurAmount = 0.9
    expect(a.sparkControls.blurAmount).toBe(0.9)
    expect(b.sparkControls.blurAmount).toBe(0.3) // default
  })

  it('mutating keyframes on one animator does not affect the other', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)

    ;(a.cameraAnimator as unknown as { keyframes: unknown[] }).keyframes = [
      { scroll: 50, position: [1, 2, 3], rotation: [0, 0, 0] },
    ]
    expect((a.cameraAnimator as unknown as { keyframes: unknown[] }).keyframes).toHaveLength(1)
    expect((b.cameraAnimator as unknown as { keyframes: unknown[] }).keyframes).toHaveLength(0)
  })

  it('mutating wrapper position does not affect another wrapper', () => {
    const a = createSceneObjects(testProfileName)
    const b = createSceneObjects(testProfileName)

    a.splatWrapper.position.set(7, 13, 21)
    expect(a.splatWrapper.position.x).toBe(7)
    expect(b.splatWrapper.position.x).toBe(0)
  })
})

describe('SparkControls exactly-once disposal', () => {
  it('dispose clears listeners and is idempotent', () => {
    const objs = createSceneObjects(testProfileName)
    const ctrl = objs.sparkControls

    let callCount = 0
    ctrl.onChange(() => { callCount++ })

    ctrl.blurAmount = 0.5
    expect(callCount).toBe(1)

    ctrl.dispose()
    expect(callCount).toBe(1) // no more calls after dispose

    ctrl.dispose() // second dispose is safe
    ctrl.blurAmount = 0.9
    expect(callCount).toBe(1) // still no calls
  })
})
