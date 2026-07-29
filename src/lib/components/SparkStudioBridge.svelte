<script lang="ts">
  import { useThrelte } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { createSparkStudioRenderer } from '$lib/spark/createSparkStudioRenderer'
  import { triggerReload } from '$lib/spark/SparkReloadRuntime'
  import type { DeviceProfile } from '$lib/types'
  import type { SparkRendererOptions } from '@sparkjsdev/spark'
  import type { SparkControls, SparkSettings } from '$lib/spark/SparkControls'

  interface Props {
    profile: DeviceProfile
    sparkControls?: SparkControls | null
    radUrl?: string
  }

  let { profile, sparkControls = null, radUrl = '' }: Props = $props()

  const threlte = useThrelte()
  let handle = $state<{
    dispose: () => void
    applySettings: (oldSettings: SparkSettings, newSettings: SparkSettings) => boolean
    reconfigureMaxPagedSplats: (settings: SparkSettings) => void
  } | null>(null)
  let lastSettings: SparkSettings | null = $state(null)

  onMount(() => {
    const { scene, renderer, invalidate } = threlte
    if (!scene || !renderer) return

    const sparkOptions: SparkRendererOptions = {
      renderer,
      onDirty: invalidate,
      pagedExtSplats: true,
      lodSplatScale: profile.sparkRenderer.lodSplatScale as number,
      lodRenderScale: profile.sparkRenderer.lodRenderScale as number,
      maxStdDev: profile.sparkRenderer.maxStdDev as number,
      maxPagedSplats: profile.sparkRenderer.maxPagedSplats as number,
      coneFov0: profile.sparkRenderer.coneFov0 as number,
      coneFov: profile.sparkRenderer.coneFov as number,
      coneFoveate: profile.sparkRenderer.coneFoveate as number,
      behindFoveate: profile.sparkRenderer.behindFoveate as number,
    }

    const studioHandle = createSparkStudioRenderer(sparkOptions)
    studioHandle.attach(scene)

    handle = {
      dispose: studioHandle.dispose,
      applySettings: studioHandle.applySettings,
      reconfigureMaxPagedSplats: studioHandle.reconfigureMaxPagedSplats,
    }

    if (sparkControls) {
      const initialSettings = sparkControls.settings
      lastSettings = initialSettings
      studioHandle.applySettings(initialSettings, initialSettings)

      const unsubscribe = sparkControls.onChange((changed) => {
        const oldSettings = lastSettings ?? sparkControls.settings
        const newSettings = sparkControls.settings

        if (changed.has('maxPagedSplats')) {
          // Reconfigure renderers with complete settings
          studioHandle.reconfigureMaxPagedSplats(newSettings)

          // Trigger SplatMesh reload so new PagedSplats gets fresh pager
          if (radUrl) {
            triggerReload(radUrl).catch(() => {
              // Reload failure is non-fatal — rendering continues with old mesh
            })
          }
        } else {
          studioHandle.applySettings(oldSettings, newSettings)
        }

        lastSettings = newSettings
      })

      ;(handle as Record<string, unknown>)._unsubscribe = unsubscribe
    }
  })

  onDestroy(() => {
    const unsub = (handle as Record<string, unknown>)?._unsubscribe as (() => void) | undefined
    unsub?.()
    handle?.dispose()
    handle = null
  })
</script>

<!-- No DOM output — this component manages Spark renderer lifecycle only -->
