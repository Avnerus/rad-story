<script lang="ts">
  import { T } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { SplatMesh } from '@sparkjsdev/spark'
  import { setReloadCallback } from '$lib/spark/SparkReloadRuntime'

  interface Props {
    url: string
  }

  let { url }: Props = $props()

  let mesh: SplatMesh | null = $state(null)

  function createMesh(): SplatMesh | null {
    if (!url) return null
    return new SplatMesh({
      url,
      paged: true,
      raycastable: false,
    })
  }

  onMount(() => {
    mesh = createMesh()

    // Register reload callback
    setReloadCallback(async () => {
      // Dispose old mesh
      mesh?.dispose()
      mesh = null

      // Small delay to ensure disposal completes
      await new Promise((r) => setTimeout(r, 50))

      // Create new mesh with the same URL
      mesh = createMesh()
    })
  })

  onDestroy(() => {
    setReloadCallback(null)
    mesh?.dispose()
  })
</script>

<!-- SplatMesh is owned by Threlte <T> for declarative transforms. SparkRenderer is managed by SparkStudioBridge. -->
{#if mesh}
  <T is={mesh} />
{/if}
