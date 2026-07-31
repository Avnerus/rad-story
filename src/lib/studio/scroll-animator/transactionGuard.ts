/**
 * Transaction guard helper: suppress source sync for ScrollAnimator transform
 * attributes while allowing `keyframes` through. Also suppresses SparkControls
 * transform attributes while allowing only the explicit whitelist of setting
 * names through.
 *
 * For Studio 0.4.3, `onTransaction` callbacks fire before sync requests are
 * enqueued. We clear `transaction.sync` for any non-whitelisted attribute.
 */

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
 * Whitelist of SparkControls setting names that may be source-synced.
 * Only exact matches are allowed — no descendants.
 */
const SPARK_CONTROL_KEYS = new Set([
  'lodSplatScale',
  'lodRenderScale',
  'maxStdDev',
  'maxPagedSplats',
  'coneFov0',
  'coneFov',
  'coneFoveate',
  'behindFoveate',
  'minPixelRadius',
  'maxPixelRadius',
  'minAlpha',
  'preBlurAmount',
  'blurAmount',
  'falloff',
  'clipXY',
  'focalAdjustment',
  'sortRadial',
  'minSortIntervalMs',
  'enableLod',
  'enableLodFetching',
  'lodSplatCount',
  'lodInflate',
])

/**
 * Check whether a transaction's attribute name is a whitelisted SparkControls setting.
 * Allows `profileSettings` (profile-aware persisted overrides), the root `settings`
 * attribute (legacy source-synced whole object), and individual field names.
 * Blocks descendants like `settings.lodSplatScale`.
 */
function isSparkControlAttribute(attributeName: string): boolean {
  return attributeName === 'profileSettings' || attributeName === 'settings' || SPARK_CONTROL_KEYS.has(attributeName)
}

/**
 * Given a set of transactions, suppress source sync for any transaction
 * whose object is a ScrollAnimator and the attribute is not `keyframes`,
 * or whose object is a SparkControls and the attribute is not in the
 * explicit settings whitelist.
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
      if (sync && !isSparkControlAttribute(sync.attributeName)) {
        tx.sync = undefined
      }
    }
  }
}
