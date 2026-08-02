<script lang="ts">
  import { useThrelte } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { createSparkStudioRenderer } from '$lib/spark/createSparkStudioRenderer'
  import { sparkSettingsToRendererOptions } from '$lib/spark/sparkSettingsToRendererOptions'
  import type { SparkRendererOptions } from '@sparkjsdev/spark'
  import type { SparkControls, SparkSettings } from '$lib/spark/SparkControls'

  interface Props {
    sparkControls: SparkControls
    radUrl?: string
    /** Callback to trigger SplatMesh reload from SparkSplats. */
    onMeshReload?: (url: string) => Promise<void>
  }

  let { sparkControls, radUrl = '', onMeshReload }: Props = $props()

  const threlte = useThrelte()
  let handle = $state<{
    dispose: () => void
    applySettings: (oldSettings: SparkSettings, newSettings: SparkSettings) => boolean
    reconfigureMaxPagedSplats: (settings: SparkSettings) => void
    pager?: unknown
    realRenderer?: object | null
  } | null>(null)
  let lastSettings: SparkSettings | null = $state(null)

  /**
   * Return the driving (real-camera) renderer's pager object for pager
   * handoff verification. Returns undefined if not yet attached or disposed.
   */
  export function getPagerIdentity(): unknown {
    return (handle as Record<string, unknown>)?.pager ?? undefined
  }

  /**
   * Trigger an update cycle on the driving renderer. Used in stub builds
   * to drive pager handoff. No-op in production (real Spark handles this
   * automatically during render). The stub's SparkRenderer.update() takes
   * no arguments; the real SparkRenderer.update() requires { scene, camera }
   * and is called automatically by the render loop.
   */
  export function triggerRendererUpdate(): void {
    const r = (handle as Record<string, unknown>)?.realRenderer as { update?: (...args: unknown[]) => void } | null
    // Only call no-arg update (stub). Real Spark's update requires args
    // and is called automatically during render.
    if (r?.update && (r as Record<string, unknown>).__spark_stub) {
      r.update()
    }
  }

  onMount(() => {
    const { scene, renderer, invalidate } = threlte
    if (!scene || !renderer) return

    // Initialize both renderers from the complete effective SparkControls.settings
    // snapshot (baseline + file-backed scene overrides). No fallback literals.
    const initialSettings = sparkControls.settings

    const sparkOptions: SparkRendererOptions = {
      ...sparkSettingsToRendererOptions(initialSettings),
      renderer,
      onDirty: invalidate,
      pagedExtSplats: true,
    }

    const studioHandle = createSparkStudioRenderer(sparkOptions)
    studioHandle.attach(scene)

    handle = {
      dispose: studioHandle.dispose,
      applySettings: studioHandle.applySettings,
      reconfigureMaxPagedSplats: studioHandle.reconfigureMaxPagedSplats,
      get pager() {
        return studioHandle.realRenderer?.pager
      },
      get realRenderer() {
        return studioHandle.realRenderer
      },
    }

    lastSettings = initialSettings

    const unsubscribe = sparkControls.onChange((changed) => {
      const oldSettings = lastSettings ?? sparkControls.settings
      const newSettings = sparkControls.settings

      if (changed.has('maxPagedSplats')) {
        // Reconfigure renderers with complete settings
        studioHandle.reconfigureMaxPagedSplats(newSettings)

        // Trigger SplatMesh reload so new PagedSplats gets fresh pager.
        // Use the reactive onMeshReload prop (may become available after mount
        // when SparkSplats bind:this fires).
        const reloadFn = onMeshReload
        if (radUrl && reloadFn) {
          reloadFn(radUrl).catch(() => {
            // Reload failure is non-fatal
          })
        }
      } else {
        studioHandle.applySettings(oldSettings, newSettings)
      }

      lastSettings = newSettings
    })

    ;(handle as Record<string, unknown>)._unsubscribe = unsubscribe
  })

  onDestroy(() => {
    const unsub = (handle as Record<string, unknown>)?._unsubscribe as (() => void) | undefined
    unsub?.()
    handle?.dispose()
    handle = null
  })
</script>

<!-- No DOM output — this component manages Spark renderer lifecycle only -->
