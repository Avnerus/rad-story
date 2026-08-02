import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

describe('camera diagnostics gating', () => {
  const sceneRuntimePath = path.resolve(__dirname, '../../src/lib/components/SceneRuntime.svelte')
  const sceneRuntimeSource = fs.readFileSync(sceneRuntimePath, 'utf-8')

  const diagnosticsPath = path.resolve(__dirname, '../../src/lib/components/CameraDiagnostics.svelte')
  const diagnosticsSource = fs.readFileSync(diagnosticsPath, 'utf-8')

  describe('SceneRuntime does not execute diagnostics in production', () => {
    it('does not declare diagnostic reactive state variables', () => {
      // No $state declarations for camera debug values in SceneRuntime
      expect(sceneRuntimeSource).not.toMatch(/cameraProgress\s*=\s*\$state/)
      expect(sceneRuntimeSource).not.toMatch(/cameraWorldX\s*=\s*\$state/)
      expect(sceneRuntimeSource).not.toMatch(/cameraIsActive\s*=\s*\$state/)
      expect(sceneRuntimeSource).not.toMatch(/targetWorldX\s*=\s*\$state/)
    })

    it('does not call updateDebugState in the ScrollTrigger hot path', () => {
      // applyScrollToAllAnimators should not reference updateDebugState
      const applyFnMatch = sceneRuntimeSource.match(
        /function applyScrollToAllAnimators[\s\S]*?^  }/m,
      )
      expect(applyFnMatch).not.toBeNull()
      expect(applyFnMatch![0]).not.toContain('updateDebugState')
      expect(applyFnMatch![0]).not.toContain('cameraProgress')
    })

    it('does not register a diagnostic-only per-frame task', () => {
      // The only useTask should be the camera look-at task
      // It should not contain updateDebugState or cameraIsActive assignment
      const taskMatches = sceneRuntimeSource.match(/useTask\([\s\S]*?\{ autoInvalidate: false \}\s*\)/g)
      expect(taskMatches).not.toBeNull()
      // Exactly one useTask (the look-at task)
      expect(taskMatches!.length).toBe(1)
      const taskBody = taskMatches![0]
      expect(taskBody).toContain('lookAt')
      expect(taskBody).not.toContain('updateDebugState')
      expect(taskBody).not.toContain('cameraIsActive')
    })

    it('gates the CameraDiagnostics component with VITE_E2E_STUB_SPARK', () => {
      expect(sceneRuntimeSource).toContain("import.meta.env.VITE_E2E_STUB_SPARK === 'true'")
      expect(sceneRuntimeSource).toContain('<CameraDiagnostics')
    })

    it('does not render the camera-debug div directly', () => {
      // The inline <div class="camera-debug"> should not be in SceneRuntime
      expect(sceneRuntimeSource).not.toContain('class="camera-debug"')
    })
  })

  describe('CameraDiagnostics component provides test diagnostic contract', () => {
    it('renders the camera-state test element with all required attributes', () => {
      expect(diagnosticsSource).toContain('data-testid="camera-state"')
      expect(diagnosticsSource).toContain('data-progress=')
      expect(diagnosticsSource).toContain('data-x=')
      expect(diagnosticsSource).toContain('data-y=')
      expect(diagnosticsSource).toContain('data-z=')
      expect(diagnosticsSource).toContain('data-target-x=')
      expect(diagnosticsSource).toContain('data-target-y=')
      expect(diagnosticsSource).toContain('data-target-z=')
      expect(diagnosticsSource).toContain('data-active=')
    })

    it('subscribes to scroll percentage from the shared runtime', () => {
      expect(diagnosticsSource).toContain('percentageStore')
      expect(diagnosticsSource).toContain('cameraProgress')
    })

    it('updates camera/target world coordinates via reactive state', () => {
      expect(diagnosticsSource).toContain('cameraWorldX = $state')
      expect(diagnosticsSource).toContain('cameraWorldY = $state')
      expect(diagnosticsSource).toContain('cameraWorldZ = $state')
      expect(diagnosticsSource).toContain('targetWorldX = $state')
      expect(diagnosticsSource).toContain('targetWorldY = $state')
      expect(diagnosticsSource).toContain('targetWorldZ = $state')
    })

    it('tracks active camera status per-frame', () => {
      expect(diagnosticsSource).toContain('cameraIsActive')
      expect(diagnosticsSource).toMatch(/cameraIsActive\s*=\s*threlte\.camera\.current\s*===\s*appCamera/)
    })
  })
})
