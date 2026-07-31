import { describe, test, expect, beforeEach } from 'vitest'
import { SparkControls } from '$lib/spark/SparkControls'

/**
 * Tests for the Spark Controls pane's settings-change synchronization.
 *
 * These tests verify that the SparkControls.onChange() signal correctly
 * notifies subscribers of external setting changes (undo/redo, Inspector,
 * programmatic setters) so the pane can refresh its UI and drafts.
 */

describe('SparkControls onChange signal (pane settings sync)', () => {
  let ctrl: SparkControls

  beforeEach(() => {
    ctrl = new SparkControls()
  })

  test('onChange fires when a single field is set programmatically', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.lodSplatScale = 5

    expect(changes).toHaveLength(1)
    expect(changes[0].lodSplatScale).toBe(5)
    // Other fields unchanged
    expect(changes[0].lodRenderScale).toBe(ctrl.createDefaultSettings().lodRenderScale)

    unsub()
  })

  test('onChange fires when settings object is set', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.settings = { lodSplatScale: 3, coneFov0: 100 }

    expect(changes).toHaveLength(1)
    expect(changes[0].lodSplatScale).toBe(3)
    expect(changes[0].coneFov0).toBe(100)

    unsub()
  })

  test('onChange fires for coupled invariant changes (coneFov0 raises coneFov)', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    // Set coneFov0 > coneFov (default 90 > 120 won't trigger, but 150 > 120 will)
    ctrl.coneFov0 = 150

    expect(changes).toHaveLength(1)
    expect(changes[0].coneFov0).toBe(150)
    expect(changes[0].coneFov).toBe(150, 'coneFov raised to match coneFov0')

    unsub()
  })

  test('onChange fires for coupled invariant changes (minPixelRadius raises maxPixelRadius)', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    // Lower maxPixelRadius first, then raise minPixelRadius above it
    ctrl.maxPixelRadius = 100
    changes.length = 0 // clear the maxPixelRadius change notification

    // Set minPixelRadius > maxPixelRadius (200 > 100)
    ctrl.minPixelRadius = 200

    expect(changes).toHaveLength(1)
    expect(changes[0].minPixelRadius).toBe(200)
    expect(changes[0].maxPixelRadius).toBe(200, 'maxPixelRadius raised to match minPixelRadius')

    unsub()
  })

  test('onChange does not fire when value is unchanged', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.lodSplatScale = 1 // same as default

    expect(changes).toHaveLength(0)

    unsub()
  })

  test('onChange unsubscribes correctly', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.lodSplatScale = 2
    expect(changes).toHaveLength(1)

    unsub()

    ctrl.lodSplatScale = 3
    expect(changes).toHaveLength(1, 'no further notifications after unsubscribe')
  })

  test('multiple subscribers each receive notifications', () => {
    const changesA: number[] = []
    const changesB: number[] = []

    const unsubA = ctrl.onChange(() => {
      changesA.push(ctrl.settings.lodSplatScale)
    })
    const unsubB = ctrl.onChange(() => {
      changesB.push(ctrl.settings.lodSplatScale)
    })

    ctrl.lodSplatScale = 7
    expect(changesA).toEqual([7])
    expect(changesB).toEqual([7])

    unsubA()
    ctrl.lodSplatScale = 8
    expect(changesA).toEqual([7], 'A not notified after unsubscribe')
    expect(changesB).toEqual([7, 8])

    unsubB()
  })

  test('settings getter returns deep copy (mutations do not affect internal state)', () => {
    const settings1 = ctrl.settings
    settings1.lodSplatScale = 999

    const settings2 = ctrl.settings
    expect(settings2.lodSplatScale).not.toBe(999)
  })

  test('sequential external changes produce correct snapshots', () => {
    const snapshots: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      snapshots.push(ctrl.settings)
    })

    ctrl.lodSplatScale = 2
    ctrl.coneFov0 = 100
    ctrl.blurAmount = 0.5

    expect(snapshots).toHaveLength(3)
    expect(snapshots[0].lodSplatScale).toBe(2)
    expect(snapshots[1].coneFov0).toBe(100)
    expect(snapshots[2].blurAmount).toBe(0.5)

    // Latest snapshot has all changes
    const latest = ctrl.settings
    expect(latest.lodSplatScale).toBe(2)
    expect(latest.coneFov0).toBe(100)
    expect(latest.blurAmount).toBe(0.5)

    unsub()
  })

  test('boolean field changes trigger onChange', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.sortRadial = false

    expect(changes).toHaveLength(1)
    expect(changes[0].sortRadial).toBe(false)

    unsub()
  })

  test('nullable field changes trigger onChange', () => {
    const changes: SparkControls['settings'][] = []
    const unsub = ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.lodSplatCount = 50000

    expect(changes).toHaveLength(1)
    expect(changes[0].lodSplatCount).toBe(50000)

    ctrl.lodSplatCount = null
    expect(changes).toHaveLength(2)
    expect(changes[1].lodSplatCount).toBeNull()

    unsub()
  })

  test('dispose clears all listeners', () => {
    const changes: SparkControls['settings'][] = []
    ctrl.onChange(() => {
      changes.push(ctrl.settings)
    })

    ctrl.dispose()

    ctrl.lodSplatScale = 5
    expect(changes).toHaveLength(0, 'no notifications after dispose')
  })
})

describe('Pane settings sync: stale-controller guard', () => {
  test('old controller onChange does not affect new controller state', () => {
    const ctrlA = new SparkControls()
    const ctrlB = new SparkControls()

    // Simulate pane state
    let activeControls: SparkControls | null = ctrlA
    let activeSettings = ctrlA.settings

    // Subscribe to ctrlA
    const unsubA = ctrlA.onChange(() => {
      // Stale-controller guard
      if (activeControls !== ctrlA) return
      activeSettings = ctrlA.settings
    })

    // Subscribe to ctrlB
    const unsubB = ctrlB.onChange(() => {
      if (activeControls !== ctrlB) return
      activeSettings = ctrlB.settings
    })

    // Change via A
    ctrlA.lodSplatScale = 3
    expect(activeSettings.lodSplatScale).toBe(3)

    // Switch active to B
    activeControls = ctrlB
    activeSettings = ctrlB.settings
    unsubA()

    // Change via A (old controller) — should be ignored
    ctrlA.lodSplatScale = 99
    expect(activeSettings.lodSplatScale).not.toBe(99)

    // Change via B (new controller) — should be observed
    ctrlB.lodSplatScale = 7
    expect(activeSettings.lodSplatScale).toBe(7)

    unsubB()
  })
})
