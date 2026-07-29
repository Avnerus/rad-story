<script lang="ts">
  import { T } from '@threlte/core'
  import { onMount, onDestroy } from 'svelte'
  import { Object3D } from 'three'
  import { SplatMesh } from '@sparkjsdev/spark'
  import { SparkReloadCoordinator } from '$lib/spark/SparkReloadRuntime'

  interface Props {
    url: string
  }

  let { url }: Props = $props()

  // Stable wrapper Object3D that owns transform/name/visibility.
  // The SplatMesh child is replaced during capacity reload but the
  // wrapper (and its authored transform) persists.
  const wrapper = new Object3D()
  wrapper.name = 'SplatWrapper'

  let mesh: SplatMesh | null = $state(null)
  let coordinator: SparkReloadCoordinator | null = null
  let destroyed = false

  /** Exposed reload function — called by SparkStudioBridge. */
  export async function reload(url: string): Promise<void> {
    if (destroyed || !coordinator) return
    await coordinator.requestReload(url, async (u) => {
      const m = new SplatMesh({ url: u, paged: true, raycastable: false })
      await m.initialized
      return { mesh: m, dispose: () => m.dispose() }
    })
  }

  function createMesh(u: string): SplatMesh {
    return new SplatMesh({ url: u, paged: true, raycastable: false })
  }

  onMount(() => {
    mesh = createMesh(url)
    wrapper.add(mesh)

    coordinator = new SparkReloadCoordinator()

    coordinator.onReloadComplete((newMeshObj: object) => {
      if (destroyed) return
      const newMesh = newMeshObj as SplatMesh

      // Remove old mesh from wrapper
      if (mesh) {
        wrapper.remove(mesh)
        mesh.dispose()
      }

      // Add new mesh to wrapper (preserves wrapper transform)
      mesh = newMesh
      wrapper.add(mesh)
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
