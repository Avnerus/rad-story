/**
 * E2e test helpers for accessing Spark-stub diagnostic globals.
 *
 * Uses the Window augmentation from `src/lib/types/spark-stub-globals.d.ts`
 * so direct property access is type-safe without casts.
 */
import type { Page } from '@playwright/test'
import type { StubDiagnostics, CameraFrustumDiagnostic } from '$lib/types/spark-stub-globals'

/**
 * Get the stub diagnostics object from the page.
 */
export async function getStubDiagnostics(page: Page): Promise<StubDiagnostics> {
  return page.evaluate(() => window.__spark_stub_diagnostics as StubDiagnostics)
}

/**
 * Check if the spark stub is active.
 */
export async function isSparkStubActive(page: Page): Promise<boolean> {
  return page.evaluate(() => window.__spark_stub === true)
}

/**
 * Set the activation gate (withhold pager assignment).
 */
export async function setActivationGate(page: Page, enabled: boolean): Promise<void> {
  if (enabled) {
    await page.evaluate(() => { window.__stubActivationGate = true })
  } else {
    await page.evaluate(() => { delete window.__stubActivationGate })
  }
}

/**
 * Get the camera frustum helper diagnostic function result.
 */
export async function getHelperDiagnostic(page: Page): Promise<CameraFrustumDiagnostic | null> {
  return page.evaluate(() => {
    const fn = window.__camera_frustum_helper_diagnostic
    return typeof fn === 'function' ? fn() : null
  })
}

/**
 * Check if the camera frustum helper diagnostic function exists.
 */
export async function hasHelperDiagnostic(page: Page): Promise<boolean> {
  return page.evaluate(() => typeof window.__camera_frustum_helper_diagnostic === 'function')
}

/**
 * Get the stub scene UUID.
 */
export async function getStubSceneUuid(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__stub_scene_uuid)
}

/**
 * Get the stub app camera UUID.
 */
export async function getStubAppCameraUuid(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__stub_app_camera_uuid)
}

/**
 * Get the active SparkControls from the stub.
 */
export async function getActiveStubControls(page: Page): Promise<object | undefined> {
  return page.evaluate(() => window.__spark_stub_active_controls)
}
