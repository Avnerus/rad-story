<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import { useObjectSelection } from '@threlte/studio/extensions'
  import { useThrelte, useTask } from '@threlte/core'
  import { CameraHelper, PerspectiveCamera, Object3D } from 'three'
  import { isScrollAnimator } from './transactionGuard'

  /**
   * CameraFrustumHelper — shows a Three.js CameraHelper for the descendant
   * PerspectiveCamera of a selected ScrollAnimator that has
   * `showChildCameraFrustumWhenSelected = true`.
   *
   * The helper is added to the Three.js scene root (not the animator) so
   * that the CameraHelper's world transform is correct. It tracks the
   * animated camera's world transform every frame via useTask.
   *
   * Direct PerspectiveCamera selection is NOT handled here — Studio's
   * built-in Helpers extension already provides that behavior. This
   * integration only extends selection for opted-in ScrollAnimators.
   *
   * Contract: the selected animator must have exactly one descendant
   * PerspectiveCamera. The first one found via traverse is used.
   */

  let { children }: { children?: Snippet } = $props()

  const objectSelection = useObjectSelection()
  const threlte = useThrelte()

  let helper: CameraHelper | null = null
  let helperTargetCamera: PerspectiveCamera | null = null

  // Test-only diagnostic: expose helper state for e2e assertions
  function exposeHelperDiagnostic(): { helperExists: boolean; targetCameraType: string | null } {
    return {
      helperExists: helper !== null,
      targetCameraType: helperTargetCamera?.type ?? null,
    }
  }

  if (typeof window !== 'undefined') {
    ;(window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic = exposeHelperDiagnostic
  }

  /**
   * Find the first descendant PerspectiveCamera in an Object3D hierarchy.
   */
  function findDescendantCamera(obj: Object3D): PerspectiveCamera | null {
    let result: PerspectiveCamera | null = null
    obj.traverse((child) => {
      if (result) return
      if (child.type === 'PerspectiveCamera') {
        result = child as PerspectiveCamera
      }
    })
    return result
  }

  /**
   * Remove and dispose the current helper.
   */
  function removeHelper(): void {
    if (helper) {
      const scene = threlte.scene
      if (scene) {
        scene.remove(helper)
      }
      // Dispose geometry and materials to prevent leaks
      helper.traverse((obj) => {
        if ('geometry' in obj && obj.geometry && typeof (obj.geometry as { dispose?: () => void }).dispose === 'function') {
          (obj.geometry as { dispose: () => void }).dispose()
        }
        if ('material' in obj && obj.material) {
          const mat = obj.material as { dispose?: () => void }
          if (typeof mat.dispose === 'function') mat.dispose()
        }
      })
    }
    helper = null
    helperTargetCamera = null
  }

  // Reactive derived: the single selected object (or null)
  const selectedObjects = $derived(objectSelection.selectedObjects ?? [])
  const singleSelected = $derived<Object3D | null>(
    selectedObjects.length === 1 ? selectedObjects[0] : null,
  )

  // Update helper on selection changes
  $effect(() => {
    removeHelper()

    const obj = singleSelected
    if (!obj) return

    // Only create helper for opted-in ScrollAnimators
    if (!isScrollAnimator(obj)) return

    const animator = obj as unknown as { showChildCameraFrustumWhenSelected?: boolean }
    if (!animator.showChildCameraFrustumWhenSelected) return

    const targetCamera = findDescendantCamera(obj)
    if (!targetCamera) return

    const scene = threlte.scene
    if (!scene) return

    helper = new CameraHelper(targetCamera)
    helper.userData.ignoreOverrideMaterial = true
    helperTargetCamera = targetCamera
    scene.add(helper)
  })

  // Update helper transform every frame (tracks animated camera position)
  useTask(() => {
    if (helper && helperTargetCamera) {
      helper.update()
    }
  }, { autoInvalidate: false })

  onDestroy(() => {
    removeHelper()
  })
</script>

<!-- No DOM output — manages Three.js CameraHelper lifecycle only -->
{@render children?.()}
