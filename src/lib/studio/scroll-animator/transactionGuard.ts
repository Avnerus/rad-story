/**
 * Transaction guard helper: suppress source sync for ScrollAnimator transform
 * attributes while allowing `keyframes` through. Also suppresses SparkControls
 * transform attributes while allowing only the explicit whitelist of setting
 * names through.
 *
 * For Studio 0.4.3, `onTransaction` callbacks fire before sync requests are
 * enqueued. We clear `transaction.sync` for any non-whitelisted attribute.
 *
 * Additionally, if the active SparkControls is marked as non-persistable
 * (ad-hoc/dynamic viewer), ALL SparkControls source sync is blocked.
 */
import { activeSparkControlsRuntime } from '$lib/studio/spark-controls/activeSparkControlsRuntime'
import type { SparkControls } from '$lib/spark/SparkControls'

/**
 * Narrow structural transaction type for the guard.
 * Avoids importing the private Transaction type from Studio internals.
 */
export interface GuardTransaction {
  object: unknown
  sync?: {
    attributeName: string
  } | null
}

/**
 * Check if an object is a branded ScrollAnimator (HMR-safe structural check).
 */
export function isScrollAnimator(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'isScrollAnimator' in obj &&
    (obj as Record<string, unknown>).isScrollAnimator === true &&
    typeof (obj as Record<string, unknown>).applyScrollPercentage === 'function'
  )
}

/**
 * Check if an object is a branded SparkControls (HMR-safe structural check).
 */
export function isSparkControls(obj: unknown): boolean {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'isSparkControls' in obj &&
    (obj as Record<string, unknown>).isSparkControls === true
  )
}

/**
 * Check whether a transaction's attribute name targets `keyframes` or
 * `showChildCameraFrustumWhenSelected`.
 * Studio builds nested attribute names as `[...pathItems, propertyPath].join('.')`,
 * so a path-prefixed attribute is `some.path.keyframes`.
 * Only allow the final path segment to be exactly `keyframes` or
 * `showChildCameraFrustumWhenSelected`.
 */
function isScrollAnimatorPersistedAttribute(attributeName: string): boolean {
  const segments = attributeName.split('.')
  const last = segments[segments.length - 1]
  return last === 'keyframes' || last === 'showChildCameraFrustumWhenSelected'
}

/**
 * Check whether a transaction's attribute name is a whitelisted SparkControls setting.
 * Allows only `profileSettings` (profile-aware persisted overrides root).
 * Blocks transforms, `settings` (legacy), individual field names, and all descendants.
 */
function isSparkControlAttribute(attributeName: string): boolean {
  return attributeName === 'profileSettings'
}

/**
 * Given a set of transactions, suppress source sync for any transaction
 * whose object is a ScrollAnimator and the attribute is not `keyframes`,
 * or whose object is a SparkControls and the attribute is not in the
 * explicit settings whitelist.
 *
 * Additionally, if the active SparkControls in the runtime is marked as
 * non-persistable (ad-hoc/dynamic viewer), ALL SparkControls source sync
 * is blocked regardless of attribute name.
 *
 * Mutates the transaction array in place (called from onTransaction callbacks).
 */
export function guardScrollAnimatorTransactions(
  transactions: GuardTransaction[],
): void {
  for (const tx of transactions) {
    if (isScrollAnimator(tx.object)) {
      const sync = tx.sync
      if (sync && !isScrollAnimatorPersistedAttribute(sync.attributeName)) {
        tx.sync = undefined
      }
      continue
    }
    if (isSparkControls(tx.object)) {
      const sync = tx.sync
      if (!sync) continue

      // Identity-aware check: only allow source sync if this exact controller
      // is the current active controller AND its registration permits it.
      // Stale/detached controllers never inherit a newer controller's permission.
      if (!activeSparkControlsRuntime.canSourceSync(tx.object as SparkControls)) {
        tx.sync = undefined
        continue
      }

      // Only allow exact-root profileSettings
      if (!isSparkControlAttribute(sync.attributeName)) {
        tx.sync = undefined
      }
    }
  }
}
