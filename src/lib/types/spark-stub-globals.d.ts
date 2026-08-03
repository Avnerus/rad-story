/**
 * Ambient declarations for Spark-stub e2e diagnostic globals.
 *
 * These properties are attached to `window` only in stub builds
 * (`VITE_E2E_STUB_SPARK=true`). Production builds never set them.
 *
 * Shared between production code (SceneRuntime, CameraFrustumHelper,
 * SparkSplats) and e2e test code (spark-stub.ts, spec files).
 */

import type { Object3D } from 'three'

// ---------------------------------------------------------------------------
// Diagnostic interfaces
// ---------------------------------------------------------------------------

/** Result of `__camera_frustum_helper_diagnostic()`. */
export interface CameraFrustumDiagnostic {
  ownedHelperCount: number
  helperExists: boolean
  targetCameraType: string | null
  targetCameraUuid: string | null
  helperParentUuid: string | null
  sceneUuid: string | null
  helpersCreated: number
  helpersDisposed: number
}

/** SparkControls disposal tracking entry. */
export interface SparkControlsStubEntry {
  uuid: string
  settings?: object
}

/** SparkControls disposal record entry. */
export interface SparkControlsDisposalEntry {
  uuid: string
}

/** Stub-assigned controls ID (set by `__spark_stub_register_controls`). */
export interface StubControlsIdCarrier {
  __stub_controls_id?: string
}

/** E2e stub diagnostics object exposed on `window.__spark_stub_diagnostics`. */
export interface StubDiagnostics {
  pagers: object[]
  renderers: object[]
  meshes: object[]
  drivingPagerId: number
  drivingGeneration: number
  wrapper: Object3D | null
  sparkControlsDisposals: Record<string, number>
  sparkControlsSettings: Record<string, Record<string, unknown>>
}

// ---------------------------------------------------------------------------
// Window augmentation
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    /** Marker: proves the running build uses the Spark stub. */
    __spark_stub?: boolean

    /** Test-only gate: when truthy, pager assignment is withheld in stub update(). */
    __stubActivationGate?: boolean

    /** Test-only: current scene UUID (set by SceneRuntime). */
    __stub_scene_uuid?: string | null

    /** Test-only: current app camera UUID (set by SceneRuntime). */
    __stub_app_camera_uuid?: string | null

    /** Test-only: hook for SparkSplats to register its wrapper. */
    __spark_stub_set_wrapper?: (wrapper: Object3D) => void

    /** Test-only: hook for SceneRuntime to register SparkControls for disposal tracking. */
    __spark_stub_register_controls?: (ctrl: SparkControlsStubEntry) => void

    /** Test-only: hook for SceneRuntime to record a SparkControls disposal. */
    __spark_stub_record_controls_disposal?: (ctrl: SparkControlsDisposalEntry) => void

    /** Test-only: the active SparkControls instance for e2e external-setter tests. */
    __spark_stub_active_controls?: object

    /** E2e stub diagnostics getter. */
    __spark_stub_diagnostics?: StubDiagnostics

    /** Camera frustum helper diagnostic function (stub builds only). */
    __camera_frustum_helper_diagnostic?: () => CameraFrustumDiagnostic
  }
}

export {}
