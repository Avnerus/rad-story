/**
 * Transaction guard helper: suppress source sync for ScrollAnimator transform
 * attributes while allowing `keyframes` through.
 *
 * For Studio 0.4.3, `onTransaction` callbacks fire before sync requests are
 * enqueued. We clear `transaction.sync` for any non-keyframe attribute on a
 * branded ScrollAnimator.
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
 * Check whether a transaction's attribute name targets `keyframes`.
 * Studio builds nested attribute names as `[...pathItems, propertyPath].join('.')`,
 * so a path-prefixed keyframe attribute is `some.path.keyframes`.
 * Only allow the final path segment to be exactly `keyframes`.
 */
function isKeyframesAttribute(attributeName: string): boolean {
  return attributeName === 'keyframes' || attributeName.endsWith('.keyframes')
}

/**
 * Check whether a transaction's attribute name targets `settings`.
 * Only allow the final path segment to be exactly `settings`.
 */
function isSettingsAttribute(attributeName: string): boolean {
  return attributeName === 'settings' || attributeName.endsWith('.settings')
}

/**
 * Given a set of transactions, suppress source sync for any transaction
 * whose object is a ScrollAnimator and the attribute is not `keyframes`,
 * or whose object is a SparkControls and the attribute is not `settings`.
 *
 * Mutates the transaction array in place (called from onTransaction callbacks).
 */
export function guardScrollAnimatorTransactions(
  transactions: GuardTransaction[],
): void {
  for (const tx of transactions) {
    if (isScrollAnimator(tx.object)) {
      const sync = tx.sync
      if (sync && !isKeyframesAttribute(sync.attributeName)) {
        tx.sync = undefined
      }
      continue
    }
    if (isSparkControls(tx.object)) {
      const sync = tx.sync
      if (sync && !isSettingsAttribute(sync.attributeName)) {
        tx.sync = undefined
      }
    }
  }
}
