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
 */

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
    } catch (err) {
      if (!this._destroyed && this._currentRequest?.generation === generation) {
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
