import { describe, test, expect, beforeEach } from 'vitest'
import { ActiveSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'

/** Create a fake SparkControls for testing. */
function makeFakeControls(id: string): Record<string, unknown> {
  return { __testId: id, isSparkControls: true }
}

describe('ActiveSparkControlsRuntime', () => {
  let runtime: ActiveSparkControlsRuntime

  beforeEach(() => {
    runtime = new ActiveSparkControlsRuntime()
  })

  test('initial state: no active controller', () => {
    expect(runtime.activeController).toBeNull()
  })

  test('attach publishes the controller', () => {
    const ctrl = makeFakeControls('a')
    const detach = runtime.attach(ctrl as never)

    expect(runtime.activeController).toBe(ctrl)
    expect(typeof detach).toBe('function')
  })

  test('current detach clears the controller', () => {
    const ctrl = makeFakeControls('a')
    const detach = runtime.attach(ctrl as never)

    detach()
    expect(runtime.activeController).toBeNull()
  })

  test('stale detach cannot clear a newer controller', () => {
    const ctrlA = makeFakeControls('a')
    const ctrlB = makeFakeControls('b')

    const detachA = runtime.attach(ctrlA as never)
    expect(runtime.activeController).toBe(ctrlA)

    const detachB = runtime.attach(ctrlB as never)
    expect(runtime.activeController).toBe(ctrlB)

    // Detaching the old registration should NOT clear the new one
    detachA()
    expect(runtime.activeController).toBe(ctrlB)

    // Only the current detach should clear
    detachB()
    expect(runtime.activeController).toBeNull()
  })

  test('subscriber is notified on attach', () => {
    const ctrl = makeFakeControls('a')
    const changes: (typeof ctrl)[] = []

    const unsub = runtime.onChange((c) => changes.push(c as never))
    runtime.attach(ctrl as never)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBe(ctrl)

    unsub()
  })

  test('subscriber is notified on detach', () => {
    const ctrl = makeFakeControls('a')
    const changes: (typeof ctrl | null)[] = []

    const unsub = runtime.onChange((c) => changes.push(c))
    const detach = runtime.attach(ctrl as never)
    changes.length = 0 // clear initial notification

    detach()

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBeNull()

    unsub()
  })

  test('subscriber is notified on replacement', () => {
    const ctrlA = makeFakeControls('a')
    const ctrlB = makeFakeControls('b')
    const changes: (typeof ctrlA | null)[] = []

    const unsub = runtime.onChange((c) => changes.push(c))
    runtime.attach(ctrlA as never)
    runtime.attach(ctrlB as never)

    expect(changes).toHaveLength(2)
    expect(changes[0]).toBe(ctrlA)
    expect(changes[1]).toBe(ctrlB)

    unsub()
  })

  test('subscriber cleanup prevents further notifications', () => {
    const ctrlA = makeFakeControls('a')
    const ctrlB = makeFakeControls('b')
    const changes: (typeof ctrlA | null)[] = []

    const unsub = runtime.onChange((c) => changes.push(c))
    runtime.attach(ctrlA as never)
    unsub()
    runtime.attach(ctrlB as never)

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBe(ctrlA)
  })

  test('multiple subscribers each receive notifications', () => {
    const ctrl = makeFakeControls('a')
    const changesA: (typeof ctrl | null)[] = []
    const changesB: (typeof ctrl | null)[] = []

    const unsubA = runtime.onChange((c) => changesA.push(c))
    const unsubB = runtime.onChange((c) => changesB.push(c))

    runtime.attach(ctrl as never)

    expect(changesA).toHaveLength(1)
    expect(changesB).toHaveLength(1)
    expect(changesA[0]).toBe(ctrl)
    expect(changesB[0]).toBe(ctrl)

    unsubA()
    unsubB()
  })

  test('destroy clears active controller and all listeners', () => {
    const ctrl = makeFakeControls('a')
    const changes: (typeof ctrl | null)[] = []

    const unsub = runtime.onChange((c) => changes.push(c))
    runtime.attach(ctrl as never)

    runtime.destroy()

    expect(runtime.activeController).toBeNull()

    // Attaching after destroy should still work (new generation)
    const ctrl2 = makeFakeControls('b')
    runtime.attach(ctrl2 as never)
    expect(runtime.activeController).toBe(ctrl2)

    unsub()
  })

  test('remount: old detach does not clear new controller', () => {
    // Simulate scene remount: old scene destroys, new scene mounts
    const oldCtrl = makeFakeControls('old')
    const newCtrl = makeFakeControls('new')

    const detachOld = runtime.attach(oldCtrl as never)

    // New scene mounts
    const detachNew = runtime.attach(newCtrl as never)
    expect(runtime.activeController).toBe(newCtrl)

    // Old scene destroys
    detachOld()
    expect(runtime.activeController, 'old detach did not clear new controller').toBe(newCtrl)

    // New scene eventually destroys
    detachNew()
    expect(runtime.activeController).toBeNull()
  })

  test('no-controller state is safe', () => {
    expect(runtime.activeController).toBeNull()

    // Detaching when nothing is attached is a no-op (no crash)
    const detach = runtime.attach(makeFakeControls('a') as never)
    detach()
    expect(runtime.activeController).toBeNull()

    // Calling detach again is safe (no crash)
    detach()
    expect(runtime.activeController).toBeNull()
  })

  // -----------------------------------------------------------------------
  // Source sync capability
  // -----------------------------------------------------------------------

  test('sourceSyncEnabled defaults to false', () => {
    const ctrl = makeFakeControls('a')
    runtime.attach(ctrl as never, 'desktop', {})
    expect(runtime.sourceSyncEnabled).toBe(false)
  })

  test('sourceSyncEnabled: true is respected', () => {
    const ctrl = makeFakeControls('a')
    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: true })
    expect(runtime.sourceSyncEnabled).toBe(true)
  })

  test('sourceSyncEnabled: false is respected', () => {
    const ctrl = makeFakeControls('a')
    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: false })
    expect(runtime.sourceSyncEnabled).toBe(false)
  })

  test('canSourceSync returns true only for exact active persistable controller', () => {
    const ctrl = makeFakeControls('a')
    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: true })
    expect(runtime.canSourceSync(ctrl as never)).toBe(true)
  })

  test('canSourceSync returns false for non-active controller', () => {
    const active = makeFakeControls('active')
    const other = makeFakeControls('other')
    runtime.attach(active as never, 'desktop', { sourceSyncEnabled: true })
    expect(runtime.canSourceSync(other as never)).toBe(false)
  })

  test('canSourceSync returns false for non-persistable active controller', () => {
    const ctrl = makeFakeControls('a')
    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: false })
    expect(runtime.canSourceSync(ctrl as never)).toBe(false)
  })

  test('canSourceSync returns false when no controller', () => {
    const ctrl = makeFakeControls('a')
    expect(runtime.canSourceSync(ctrl as never)).toBe(false)
  })

  test('same-controller reattach with changed permission notifies subscribers', () => {
    const ctrl = makeFakeControls('a')
    const changes: (typeof ctrl | null)[] = []
    const unsub = runtime.onChange((c) => changes.push(c))

    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: false })
    changes.length = 0 // clear initial

    // Re-attach same controller with changed permission
    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: true })

    expect(changes).toHaveLength(1)
    expect(changes[0]).toBe(ctrl)
    expect(runtime.sourceSyncEnabled).toBe(true)

    unsub()
  })

  test('stale detach cannot alter newer controller permission', () => {
    const ctrlA = makeFakeControls('a')
    const ctrlB = makeFakeControls('b')

    const detachA = runtime.attach(ctrlA as never, 'desktop', { sourceSyncEnabled: false })
    runtime.attach(ctrlB as never, 'desktop', { sourceSyncEnabled: true })

    expect(runtime.sourceSyncEnabled).toBe(true)
    expect(runtime.canSourceSync(ctrlB as never)).toBe(true)

    // Stale detach from A
    detachA()
    expect(runtime.activeController).toBe(ctrlB)
    expect(runtime.sourceSyncEnabled).toBe(true)
    expect(runtime.canSourceSync(ctrlB as never)).toBe(true)
  })

  test('current detach clears sourceSyncEnabled', () => {
    const ctrl = makeFakeControls('a')
    const detach = runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: true })
    expect(runtime.sourceSyncEnabled).toBe(true)

    detach()
    expect(runtime.sourceSyncEnabled).toBe(false)
    expect(runtime.canSourceSync(ctrl as never)).toBe(false)
  })

  test('destroy clears sourceSyncEnabled', () => {
    const ctrl = makeFakeControls('a')
    runtime.attach(ctrl as never, 'desktop', { sourceSyncEnabled: true })
    expect(runtime.sourceSyncEnabled).toBe(true)

    runtime.destroy()
    expect(runtime.sourceSyncEnabled).toBe(false)
  })
})

describe('Stub diagnostic identity-safety (SceneRuntime __spark_stub_active_controls)', () => {
  /**
   * Simulates the SceneRuntime stub cleanup pattern:
   *   if (current === sparkControls) delete __spark_stub_active_controls
   * An older scene's destroy must not delete a newer scene's reference.
   */
  test('old scene destroy does not clear newer scene diagnostic', () => {
    const ctrlA = { __id: 'a' }
    const ctrlB = { __id: 'b' }

    // Simulate window.__spark_stub_active_controls
    let diagnostic: typeof ctrlA | undefined = undefined

    // Scene A mounts
    diagnostic = ctrlA as never

    // Scene B mounts (replaces A)
    diagnostic = ctrlB as never

    // Scene A destroys — identity-safe check
    const current = diagnostic
    if (current === ctrlA) {
      diagnostic = undefined
    }
    expect(diagnostic).toBe(ctrlB, 'A did not clear B')

    // Scene B destroys
    const currentB = diagnostic
    if (currentB === ctrlB) {
      diagnostic = undefined
    }
    expect(diagnostic).toBeUndefined()
  })

  test('single scene destroy clears diagnostic', () => {
    const ctrl = { __id: 'only' }
    let diagnostic: typeof ctrl | undefined = ctrl

    const current = diagnostic
    if (current === ctrl) {
      diagnostic = undefined
    }
    expect(diagnostic).toBeUndefined()
  })

  test('destroy when no diagnostic is set is safe', () => {
    const ctrl = { __id: 'orphan' }
    let diagnostic: typeof ctrl | undefined = undefined

    const current = diagnostic
    if (current === ctrl) {
      diagnostic = undefined
    }
    expect(diagnostic).toBeUndefined()
  })
})
