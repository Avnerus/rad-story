/**
 * SparkReloadCoordinator — race-safe mesh reload coordination for
 * `maxPagedSplats` capacity changes.
 *
 * Uses monotonically increasing generation IDs to serialize rapid edits:
 * - Each reload request gets a generation number
 * - Superseded requests are aborted (their meshes disposed)
 * - Component destruction invalidates all in-flight requests
 * - No arbitrary timing delays
 * - Completion tied to SplatMesh.initialized promise
 *
 * Reload status (isReloading, error) is reported through a `SparkReloadStatus`
 * instance so that the Spark Controls pane can display progress and errors.
 */

/**
 * Describes the current reload state.
 */
export interface ReloadStatus {
  /** True while a reload request is in flight. */
  isReloading: boolean
  /** Error message from the latest failed reload, or empty string. */
  error: string
}

/**
 * Instance-owned status holder. Not a singleton — one per SparkSplats instance.
 * The Spark Controls pane subscribes to this to drive its progress/error UI.
 */
export class SparkReloadStatus {
  private _isReloading = false
  private _error = ''
  private _listeners: Array<(status: ReloadStatus) => void> = []

  get isReloading(): boolean { return this._isReloading }
  get error(): string { return this._error }

  /** Signal that a reload has started. */
  start(): void {
    this._isReloading = true
    this._error = ''
    this._notify()
  }

  /** Signal that a reload completed successfully. */
  success(): void {
    this._isReloading = false
    this._error = ''
    this._notify()
  }

  /** Signal that a reload failed. */
  fail(message: string): void {
    this._isReloading = false
    this._error = message
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

  /** Clear all state (called on coordinator dispose). */
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

/**
 * A reload request with a generation ID for coalescing.
 */
interface ReloadRequest {
  generation: number
  url: string
}

/**
 * Instance of the reload coordinator. Created per SparkSplats component.
 */
export class SparkReloadCoordinator {
  private _generation = 0
  private _destroyed = false
  private _currentRequest: ReloadRequest | null = null
  private _pendingPromise: Promise<void> | null = null

  /** Instance-owned status holder for the pane. */
  readonly status = new SparkReloadStatus()

  /**
   * Request a mesh reload. Returns a promise that resolves when the new
   * mesh is initialized (SplatMesh.initialized).
   *
   * Rapid calls are coalesced: only the latest generation wins.
   * Superseded generations dispose their meshes.
   */
  requestReload(
    url: string,
    createMesh: (url: string) => Promise<{ mesh: object; dispose: () => void }>,
  ): Promise<void> {
    if (this._destroyed) return Promise.resolve()

    const generation = ++this._generation
    this._currentRequest = { generation, url }

    // Signal reload started — clears any prior error
    this.status.start()

    const promise = this._doReload(generation, url, createMesh)
    this._pendingPromise = promise
    return promise
  }

  private async _doReload(
    generation: number,
    url: string,
    createMesh: (url: string) => Promise<{ mesh: object; dispose: () => void }>,
  ): Promise<void> {
    try {
      // Check we haven't been superseded or destroyed
      if (this._destroyed || this._currentRequest?.generation !== generation) {
        return
      }

      // Create new mesh
      const { mesh, dispose } = await createMesh(url)

      // Check again after async creation
      if (this._destroyed || this._currentRequest?.generation !== generation) {
        dispose()
        return
      }

      // Notify success — caller handles attaching to scene
      this._onReloadComplete?.(mesh, generation)
      this.status.success()
    } catch (err) {
      if (!this._destroyed && this._currentRequest?.generation === generation) {
        const message = err instanceof Error ? err.message : String(err)
        this.status.fail(message)
        this._onReloadError?.(err, generation)
      }
    } finally {
      if (this._currentRequest?.generation === generation) {
        this._pendingPromise = null
      }
    }
  }

  /** Called when a reload completes successfully. */
  private _onReloadComplete: ((mesh: object, generation: number) => void) | null = null
  /** Called when a reload fails. */
  private _onReloadError: ((err: unknown, generation: number) => void) | null = null

  onReloadComplete(fn: (mesh: object, generation: number) => void): void {
    this._onReloadComplete = fn
  }

  onReloadError(fn: (err: unknown, generation: number) => void): void {
    this._onReloadError = fn
  }

  /**
   * Dispose the coordinator and abort any in-flight reload.
   */
  dispose(): void {
    this._destroyed = true
    this._currentRequest = null
    this._pendingPromise = null
    this._onReloadComplete = null
    this._onReloadError = null
    this.status.clear()
  }

  /** Whether a reload is currently in progress. */
  get isReloading(): boolean {
    return this._pendingPromise !== null && !this._destroyed
  }

  /** Current generation number. */
  get generation(): number {
    return this._generation
  }
}
