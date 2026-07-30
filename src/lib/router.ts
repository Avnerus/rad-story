/**
 * Lightweight pathname router for `/scene/{sceneName}` routes.
 *
 * Does not require SvelteKit — uses `window.location.pathname` and
 * `history.pushState` for navigation.
 */

import { validateSceneName, getScene } from '$lib/scenes/registry'
import type { SceneEntry } from '$lib/scenes/registry'

/**
 * Route match result.
 */
export interface SceneRouteMatch {
  kind: 'scene'
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
 */
export function parseRoute(pathname: string = window.location.pathname): RouteMatch {
  // /scene/ — anything under /scene/ that isn't the exact /scene path
  if (pathname.startsWith('/scene/')) {
    const raw = pathname.slice('/scene/'.length)
    if (!raw) {
      // /scene/ with empty name → not-found
      return { kind: 'not-found', attemptedName: '' }
    }
    const name = validateSceneName(raw)
    if (name) {
      const scene = getScene(name)
      if (scene) return { kind: 'scene', scene }
      return { kind: 'not-found', attemptedName: name }
    }
    // Invalid name (uppercase, special chars, path traversal) → not-found
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
 * Navigate to a scene route using history.pushState.
 */
export function navigateToScene(name: string): void {
  window.history.pushState({}, '', `/scene/${name}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

/**
 * Navigate to the landing page.
 */
export function navigateToLanding(): void {
  window.history.pushState({}, '', '/')
  window.dispatchEvent(new PopStateEvent('popstate'))
}
