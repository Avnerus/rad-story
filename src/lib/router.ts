/**
 * Lightweight pathname router for `/scene/{sceneName}` and `/scene/{sceneName}/edit` routes.
 *
 * Does not require SvelteKit — uses `window.location.pathname` and
 * `history.pushState` for navigation.
 *
 * Route grammar:
 * - `/scene/{validName}` → playback (view) mode
 * - `/scene/{validName}/edit` → editing mode (Studio + extensions)
 */

import { validateSceneName, getScene } from '$lib/scenes/registry'
import type { SceneEntry } from '$lib/scenes/registry'

/** Playback or editing mode for a file-backed scene. */
export type SceneMode = 'view' | 'edit'

/**
 * Route match result for a file-backed scene.
 */
export interface SceneRouteMatch {
  kind: 'scene'
  /** 'view' for playback, 'edit' for Studio editing. */
  mode: SceneMode
  scene: SceneEntry
}

export interface LandingRouteMatch {
  kind: 'landing'
}

export interface NotFoundRouteMatch {
  kind: 'not-found'
  attemptedName: string
}

export type RouteMatch = SceneRouteMatch | LandingRouteMatch | NotFoundRouteMatch

/**
 * Parse the current URL pathname into a route match.
 *
 * Accepted shapes:
 * - `/scene/{validName}` → `{ kind: 'scene', mode: 'view', scene }`
 * - `/scene/{validName}/edit` → `{ kind: 'scene', mode: 'edit', scene }`
 *
 * Anything else under `/scene/` (empty name, invalid name, extra segments,
 * unknown suffixes) → not-found. Root and non-scene paths → landing.
 */
export function parseRoute(pathname: string = window.location.pathname): RouteMatch {
  // /scene/ — anything under /scene/
  if (pathname.startsWith('/scene/')) {
    const raw = pathname.slice('/scene/'.length)
    if (!raw) {
      // /scene/ with empty name → not-found
      return { kind: 'not-found', attemptedName: '' }
    }

    // Split on '/' to check for /edit suffix
    const segments = raw.split('/')

    if (segments.length === 1) {
      // /scene/{name} — view mode
      const name = validateSceneName(segments[0])
      if (name) {
        const scene = getScene(name)
        if (scene) return { kind: 'scene', mode: 'view', scene }
        return { kind: 'not-found', attemptedName: name }
      }
      return { kind: 'not-found', attemptedName: segments[0] }
    }

    if (segments.length === 2 && segments[1] === 'edit') {
      // /scene/{name}/edit — edit mode
      const name = validateSceneName(segments[0])
      if (name) {
        const scene = getScene(name)
        if (scene) return { kind: 'scene', mode: 'edit', scene }
        return { kind: 'not-found', attemptedName: name }
      }
      return { kind: 'not-found', attemptedName: segments[0] }
    }

    // Extra segments or unknown suffix → not-found
    return { kind: 'not-found', attemptedName: raw }
  }

  // /scene (no trailing slash) — treat as landing
  if (pathname === '/scene') {
    return { kind: 'landing' }
  }

  // Everything else — landing
  return { kind: 'landing' }
}

/**
 * Navigate to a scene playback (view) route using history.pushState.
 * Default mode is view; use navigateToSceneEdit for edit mode.
 */
export function navigateToScene(name: string, mode: SceneMode = 'view'): void {
  const path = mode === 'edit' ? `/scene/${name}/edit` : `/scene/${name}`
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Navigate to a scene editing route using history.pushState.
 */
export function navigateToSceneEdit(name: string): void {
  navigateToScene(name, 'edit')
}

/**
 * Navigate to the landing page.
 */
export function navigateToLanding(): void {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}
