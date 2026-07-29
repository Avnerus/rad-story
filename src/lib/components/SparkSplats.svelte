<script lang="ts">
  import { T } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { Object3D } from 'three'
  import { SplatMesh } from '@sparkjsdev/spark'
  import { SparkReloadCoordinator, type ReloadStatus } from '$lib/spark/SparkReloadRuntime'

  interface Props {
    url: string
    /** Optional callback to receive reload status updates (for pane UI). */
    onStatusChange?: (status: ReloadStatus) => void
    /**
     * Optional pager identity check — returns the driving renderer's pager
     * object (or undefined/null if not yet available). Used to confirm
     * pager handoff after mesh reload.
     */
    pagerIdentity?: () => unknown
    /**
     * Optional callback to trigger a renderer update cycle. Used in stub
     * builds to drive pager handoff. No-op in production (real Spark
     * handles pager attachment automatically during render).
     */
    triggerUpdate?: () => void
  }

  let { url, onStatusChange, pagerIdentity, triggerUpdate }: Props = $props()

  // Stable wrapper Object3D that owns transform/name/visibility.
  // The SplatMesh child is replaced during capacity reload but the
  // wrapper (and its authored transform) persists.
  const wrapper = new Object3D()
  wrapper.name = 'SplatWrapper'

  let mesh: SplatMesh | null = $state(null)
  let coordinator: SparkReloadCoordinator | null = null
  let destroyed = false

  /**
   * Exposed reload function — called by SparkStudioBridge.
   * Waits for mesh initialization AND pager handoff before resolving.
   */
  export async function reload(url: string): Promise<void> {
    if (destroyed || !coordinator) return
    await coordinator.requestReload(url, async (u) => {
      const m = new SplatMesh({ url: u, paged: true, raycastable: false })
      await m.initialized
      return { mesh: m, dispose: () => m.dispose() }
    })
  }

  /** Exposed reload status for the pane to subscribe to. */
  export function getStatus(): ReloadStatus | null {
    return coordinator?.status ?? null
  }

  function createMesh(u: string): SplatMesh {
    return new SplatMesh({ url: u, paged: true, raycastable: false })
  }

  /**
   * Wait for the replacement mesh's pager to be attached to the driving
   * renderer's pager. Uses RAF-based polling with a bounded timeout and
   * cancellation awareness.
   *
   * In real Spark, the driving renderer's pager is created lazily (during
   * LOD worker initialization), so we first wait for the pager to exist,
   * then wait for mesh.paged.pager to match it.
   */
  async function waitForPagerHandoff(
    newMesh: SplatMesh,
    generation: number,
    timeoutMs = 5_000,
  ): Promise<void> {
    // If no pager identity check is available, skip the wait
    if (!pagerIdentity) {
      coordinator?.status.success()
      return
    }

    const deadline = Date.now() + timeoutMs

    return new Promise<void>((resolve, reject) => {
      let cancelled = false

      const check = (): void => {
        if (cancelled) return

        // Check if coordinator was destroyed or superseded
        if (destroyed || coordinator?.generation !== generation) {
          cancelled = true
          resolve() // superseded — don't reject
          return
        }

        // Trigger a renderer update cycle (drives pager handoff in stub builds)
        triggerUpdate?.()

        // Get current driving pager (may be undefined until lazily created)
        const targetPager = pagerIdentity()

        if (targetPager) {
          // Pager exists — check mesh attachment
          const meshPager = (newMesh as unknown as { paged?: { pager?: unknown } }).paged?.pager
          if (meshPager === targetPager) {
            // Verify pager is not disposed
            const pagerInfo = targetPager as { disposed?: boolean }
            if (pagerInfo.disposed) {
              cancelled = true
              reject(new Error('Driving renderer pager was disposed during reload'))
              return
            }
            cancelled = true
            coordinator?.status.success()
            resolve()
            return
          }
        }
        // If targetPager is undefined, keep polling (real Spark creates pager lazily)

        // Check timeout
        if (Date.now() >= deadline) {
          cancelled = true
          reject(new Error('Pager handoff timed out — mesh not attached to driving renderer'))
          return
        }

        // Continue polling
        requestAnimationFrame(check)
      }

      requestAnimationFrame(check)
    })
  }

  onMount(() => {
    mesh = createMesh(url)
    wrapper.add(mesh)

    coordinator = new SparkReloadCoordinator()

    // Wire status to external subscriber (e.g. Spark Controls pane)
    if (onStatusChange) {
      coordinator.status.subscribe(onStatusChange)
    }

    coordinator.onReloadComplete(async (newMeshObj: object) => {
      if (destroyed) return
      const newMesh = newMeshObj as SplatMesh
      const generation = coordinator?.generation ?? 0

      // Remove old mesh from wrapper
      if (mesh) {
        wrapper.remove(mesh)
        mesh.dispose()
      }

      // Add new mesh to wrapper (preserves wrapper transform)
      mesh = newMesh
      wrapper.add(mesh)

      // Wait for pager handoff before signalling success
      try {
        await waitForPagerHandoff(newMesh, generation)
      } catch (err) {
        if (!destroyed && coordinator?.generation === generation) {
          const message = err instanceof Error ? err.message : String(err)
          coordinator?.status.fail(message)
        }
      }
    })
  })

  onDestroy(() => {
    destroyed = true
    coordinator?.dispose()
    coordinator = null
    mesh?.dispose()
  })
</script>

<!-- Stable wrapper preserves transform across SplatMesh reloads -->
<T is={wrapper} name="SplatWrapper" />
