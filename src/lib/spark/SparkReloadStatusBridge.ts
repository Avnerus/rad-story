/**
 * Instance-owned reload status bridge between SparkSplats coordinator
 * and the Spark Controls extension pane.
 *
 * Not a global singleton — one instance per scene, created and passed
 * through props. The SparkControlsExtension subscribes to it to drive
 * its progress/error UI.
 */
import type { ReloadStatus } from './SparkReloadRuntime'

/**
 * A simple pass-through that forwards status from the coordinator to
 * subscribers. Created in RadStoryScene, passed to both SparkSplats
 * (which wires it to the coordinator) and SparkControlsExtension
 * (which subscribes for UI).
 */
export class SparkReloadStatusBridge {
  private _isReloading = false
  private _error = ''
  private _listeners: Array<(status: ReloadStatus) => void> = []

  get isReloading(): boolean { return this._isReloading }
  get error(): string { return this._error }

  /** Called by SparkSplats when the coordinator status changes. */
  update(status: ReloadStatus): void {
    this._isReloading = status.isReloading
    this._error = status.error
    this._notify()
  }

  /** Subscribe to status changes. Returns an unsubscribe function. */
  subscribe(fn: (status: ReloadStatus) => void): () => void {
    this._listeners.push(fn)
    return () => {
      const i = this._listeners.indexOf(fn)
      if (i >= 0) this._listeners.splice(i, 1)
    }
  }

  /** Clear all state (called on scene destroy). */
  clear(): void {
    this._isReloading = false
    this._error = ''
    this._listeners.length = 0
  }

  private _notify(): void {
    for (const fn of this._listeners) {
      fn({ isReloading: this._isReloading, error: this._error })
    }
  }
}
