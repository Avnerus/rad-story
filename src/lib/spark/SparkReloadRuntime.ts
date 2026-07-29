/**
 * SparkReloadRuntime — coordinates renderer recreation and SplatMesh reload
 * when `maxPagedSplats` changes.
 *
 * When the pager capacity changes, the existing SplatMesh's PagedSplats retains
 * a reference to the old disposed pager. The only safe public path is to
 * dispose the old mesh and create a new one with the same URL, so the new
 * PagedSplats gets a fresh pager from the new renderer.
 */

/**
 * Signature for the mesh reload callback.
 * Disposes the old mesh, creates a new one with the same URL.
 */
export type MeshReloadCallback = (url: string) => Promise<void>

let reloadCallback: MeshReloadCallback | null = null

/**
 * Set the reload callback (called by the scene component).
 */
export function setReloadCallback(cb: MeshReloadCallback | null): void {
  reloadCallback = cb
}

/**
 * Trigger a coordinated mesh reload.
 * Returns a promise that resolves when the new mesh is created.
 */
export async function triggerReload(url: string): Promise<void> {
  if (!reloadCallback) return
  return reloadCallback(url)
}
