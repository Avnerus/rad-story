/**
 * Scene registry — discovers Svelte scene modules under src/lib/scenes/
 * and maps normalized names to their modules.
 *
 * Only files named `<name>.svelte` directly in this directory are
 * discoverable. Path traversal or arbitrary imports are impossible because
 * `import.meta.glob` is statically analyzed by Vite.
 */

import type { ComponentType } from 'svelte'

/**
 * A registered scene entry.
 */
export interface SceneEntry {
  /** Normalized scene name (lowercase, alphanumeric + underscore). */
  name: string
  /** Svelte component to render for this scene. */
  component: ComponentType
}

/**
 * Valid scene name pattern: lowercase letters, digits, and underscores only.
 */
export const SCENE_NAME_REGEX = /^[a-z0-9_]+$/

/**
 * Validate and normalize a scene name from a URL segment.
 * Returns null if the name is invalid (empty, contains path traversal,
 * or has disallowed characters).
 */
export function validateSceneName(raw: string): string | null {
  if (!raw || !SCENE_NAME_REGEX.test(raw)) return null
  return raw.toLowerCase()
}

/**
 * Build the scene registry from Vite's static glob.
 */
const sceneModules = import.meta.glob('./[a-z0-9_]*.svelte', { eager: true }) as Record<string, { default: ComponentType }>

/**
 * Map from normalized scene name → component.
 */
const registry = new Map<string, ComponentType>()

for (const path of Object.keys(sceneModules)) {
  // Extract filename without extension from path like ./baby_yoda.svelte
  const fileName = path.replace(/^\.\//, '').replace(/\.svelte$/, '')
  const name = validateSceneName(fileName)
  if (name) {
    const mod = sceneModules[path]
    // Svelte components are the default export of the module
    const component = mod.default
    registry.set(name, component)
  }
}

/**
 * Get all registered scene entries.
 */
export function getScenes(): SceneEntry[] {
  const entries: SceneEntry[] = []
  for (const [name, component] of registry) {
    entries.push({ name, component })
  }
  return entries
}

/**
 * Get the component for a scene name, or null if not found.
 */
export function getScene(name: string): SceneEntry | null {
  const component = registry.get(name)
  if (!component) return null
  return { name, component }
}
