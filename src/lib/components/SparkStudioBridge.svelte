<script lang="ts">
  import { useThrelte } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { createSparkStudioRenderer } from '$lib/spark/createSparkStudioRenderer'
  import type { DeviceProfile } from '$lib/types'
  import type { SparkRendererOptions } from '@sparkjsdev/spark'
  import type { SparkControls, SparkSettings } from '$lib/spark/SparkControls'

  interface Props {
    profile: DeviceProfile
    sparkControls?: SparkControls | null
  }

  let { profile, sparkControls = null }: Props = $props()

  const threlte = useThrelte()
  let handle = $state<{
    dispose: () => void
    applySettings: (oldSettings: SparkSettings, newSettings: SparkSettings) => boolean
    reconfigureMaxPagedSplats: (settings: SparkSettings) => void
  } | null>(null)
  // Track the last-applied settings snapshot
  let lastSettings: SparkSettings | null = $state(null)

  onMount(() => {
    const { scene, renderer, invalidate } = threlte
    if (!scene || !renderer) return

    // Build SparkRenderer options from device profile
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

    // If SparkControls is provided, subscribe to its settings changes
    if (sparkControls) {
      // Apply initial settings immediately
      const initialSettings = sparkControls.settings
      lastSettings = initialSettings
      studioHandle.applySettings(initialSettings, initialSettings)

      // Subscribe to future changes
      const unsubscribe = sparkControls.onChange((changed) => {
        const oldSettings = lastSettings ?? sparkControls.settings
        const newSettings = sparkControls.settings

        if (changed.has('maxPagedSplats')) {
          // maxPagedSplats requires renderer/pager recreation.
          // Pass the complete current settings so all fields survive recreation.
          studioHandle.reconfigureMaxPagedSplats(newSettings)
        } else {
          // All other fields can be applied live with change detection
          studioHandle.applySettings(oldSettings, newSettings)
        }

        lastSettings = newSettings
      })

      // Store unsubscribe for cleanup
      ;(handle as Record<string, unknown>)._unsubscribe = unsubscribe
    }
  })

  onDestroy(() => {
    // Unsubscribe from SparkControls changes
    const unsub = (handle as Record<string, unknown>)?._unsubscribe as (() => void) | undefined
    unsub?.()
    handle?.dispose()
    handle = null
  })
</script>

<!-- No DOM output — this component manages Spark renderer lifecycle only -->
