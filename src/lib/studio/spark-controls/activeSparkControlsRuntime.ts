/**
 * Active Spark Controls runtime — a reactive registry that tracks the
 * currently active scene's SparkControls instance.
 *
 * Decouples the Spark Controls Studio extension from hierarchy selection.
 * Scenes register their SparkControls via attach() and clean up via the
 * returned detach() function. Detach is identity-safe: it only clears the
 * active controller if this registration is still the current one, so
 * an older scene's destroy cannot clear a newer scene's controller.
 *
 * Each registration declares whether source sync is enabled:
 * - File-backed scene edit mode: `sourceSyncEnabled: true` (persist profileSettings)
 * - Ad-hoc/dynamic URL viewer: `sourceSyncEnabled: false` (session-only)
 *
 * Usage:
 *   const detach = activeSparkControlsRuntime.attach(sparkControls, profileName, { sourceSyncEnabled: true })
 *   onDestroy(detach)
 *
 * The SparkControlsExtension subscribes to `activeController` and edits
 * that object directly, regardless of what is selected in the Studio
 * hierarchy.
 */
import type { SparkControls } from '$lib/spark/SparkControls'
import type { DeviceProfileName } from '$lib/types'

/**
 * Attach options for registering a SparkControls instance.
 */
export interface SparkControlsAttachOptions {
  /** Whether source sync should be enabled for this controller. Defaults to false. */
  sourceSyncEnabled?: boolean
}

/**
 * Callback type for active controller changes.
 */
export type ActiveControllerChangeListener = (controls: SparkControls | null) => void

/**
 * Reactive registry for the active scene's SparkControls.
 *
 * Guarantees:
 * - Only one active controller at a time (latest attach wins).
 * - Detach is identity-safe: stale detach from an older registration
 *   cannot clear a newer controller.
 * - Destroy clears only if this registration is still current.
 * - Subscribers are notified on every change.
 */
export class ActiveSparkControlsRuntime {
  private _active: SparkControls | null = null
  private _profileName: DeviceProfileName = 'desktop'
  private _sourceSyncEnabled = false
  private _generation = 0
  private _listeners: ActiveControllerChangeListener[] = []

  /**
   * The currently active SparkControls instance, or null if no scene
   * has registered one.
   */
  get activeController(): SparkControls | null {
    return this._active
  }

  /**
   * The active device profile name. Defaults to 'desktop'.
   */
  get profileName(): DeviceProfileName {
    return this._profileName
  }

  /**
   * Whether source sync is enabled for the active controller.
   * File-backed edit mode: true. Ad-hoc viewer: false.
   */
  get sourceSyncEnabled(): boolean {
    return this._sourceSyncEnabled
  }

  /**
   * Attach a SparkControls instance as the active controller.
   *
   * Returns a detach function that clears the registration only if
   * this attach is still the current one (identity-safe).
   *
   * If a controller was already active, it is replaced and subscribers
   * are notified.
   *
   * @param controls - The SparkControls instance.
   * @param profileName - Active device profile name.
   * @param options - Attach options including source sync capability.
   */
  attach(controls: SparkControls, profileName: DeviceProfileName = 'desktop', options: SparkControlsAttachOptions = {}): () => void {
    const gen = ++this._generation
    const previous = this._active
    this._active = controls
    this._profileName = profileName
    this._sourceSyncEnabled = options.sourceSyncEnabled ?? false

    if (previous !== controls) {
      for (const fn of this._listeners) fn(controls)
    }

    // Identity-safe detach: only clears if this registration is still current
    return () => {
      if (this._generation === gen && this._active === controls) {
        this._active = null
        this._sourceSyncEnabled = false
        for (const fn of this._listeners) fn(null)
      }
    }
  }

  /**
   * Subscribe to active controller changes.
   * Returns an unsubscribe function.
   */
  onChange(fn: ActiveControllerChangeListener): () => void {
    this._listeners.push(fn)
    return () => {
      const idx = this._listeners.indexOf(fn)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  /**
   * Destroy the runtime: clear active controller and all listeners.
   */
  destroy(): void {
    this._active = null
    this._sourceSyncEnabled = false
    this._listeners.length = 0
  }
}

/** Module-level singleton shared by SceneRuntime and SparkControlsExtension. */
export const activeSparkControlsRuntime = new ActiveSparkControlsRuntime()
