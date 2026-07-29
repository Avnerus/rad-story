import { describe, it, expect, beforeEach } from 'vitest'
import { SparkReloadStatus } from '$lib/spark/SparkReloadRuntime'

describe('SparkReloadStatus', () => {
  let status: SparkReloadStatus

  beforeEach(() => {
    status = new SparkReloadStatus()
  })

  it('starts in idle state', () => {
    expect(status.isReloading).toBe(false)
    expect(status.error).toBe('')
  })

  it('start() sets isReloading and clears error', () => {
    status.fail('old error')
    status.start()
    expect(status.isReloading).toBe(true)
    expect(status.error).toBe('')
  })

  it('success() clears isReloading and error', () => {
    status.start()
    status.success()
    expect(status.isReloading).toBe(false)
    expect(status.error).toBe('')
  })

  it('fail() sets error and clears isReloading', () => {
    status.start()
    status.fail('disk full')
    expect(status.isReloading).toBe(false)
    expect(status.error).toBe('disk full')
  })

  it('subscribe receives notifications on start/success/fail', () => {
    const statuses: Array<{ isReloading: boolean; error: string }> = []
    status.subscribe((s) => statuses.push(s))

    status.start()
    expect(statuses).toHaveLength(1)
    expect(statuses[0]).toEqual({ isReloading: true, error: '' })

    status.fail('oops')
    expect(statuses).toHaveLength(2)
    expect(statuses[1]).toEqual({ isReloading: false, error: 'oops' })

    status.start()
    status.success()
    expect(statuses).toHaveLength(4)
  })

  it('unsubscribe stops notifications', () => {
    const calls: number[] = []
    const unsub = status.subscribe(() => calls.push(1))
    status.start()
    unsub()
    status.success()
    expect(calls).toHaveLength(1)
  })

  it('clear resets state and removes listeners', () => {
    const calls: number[] = []
    status.subscribe(() => calls.push(1))
    status.start()
    status.clear()
    status.start()
    expect(calls).toHaveLength(1) // only the first start
    expect(status.isReloading).toBe(true) // start after clear works
  })

  it('update() mirrors status and notifies on change', () => {
    const notifications: Array<{ isReloading: boolean; error: string }> = []
    status.subscribe((s) => notifications.push(s))

    status.update({ isReloading: true, error: '' })
    expect(status.isReloading).toBe(true)
    expect(status.error).toBe('')
    expect(notifications).toHaveLength(1)

    status.update({ isReloading: false, error: '' })
    expect(status.isReloading).toBe(false)
    expect(notifications).toHaveLength(2)

    status.update({ isReloading: false, error: 'fail' })
    expect(status.error).toBe('fail')
    expect(notifications).toHaveLength(3)
  })

  it('update() does not notify when state is identical', () => {
    const notifications: Array<{ isReloading: boolean; error: string }> = []
    status.subscribe((s) => notifications.push(s))

    status.start()
    expect(notifications).toHaveLength(1)

    // Same state — no notification
    status.update({ isReloading: true, error: '' })
    expect(notifications).toHaveLength(1)
  })
})
