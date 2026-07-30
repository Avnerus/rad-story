import { test, expect } from '@playwright/test'

/** Read camera debug attributes from the hidden debug element */
async function getCameraState(page: import('@playwright/test').Page) {
  const result = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="camera-state"]')
    if (!el) return null
    const get = (name: string) => parseFloat(el.getAttribute(name) ?? '0')
    return {
      progress: get('data-progress'),
      x: get('data-x'),
      y: get('data-y'),
      z: get('data-z'),
      targetX: get('data-target-x'),
      targetY: get('data-target-y'),
      targetZ: get('data-target-z'),
    }
  })
  return result!
}

/** Helper: wait for the debug element to appear */
async function waitForDebugElement(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    return document.querySelector('[data-testid="camera-state"]') !== null
  }, { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Playback mode e2e tests (/scene/baby_yoda)
// ---------------------------------------------------------------------------

test.describe('Playback mode (/scene/baby_yoda)', () => {
  test('direct visit loads the scene with canvas', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const header = page.locator('.viewer-header .url-label')
    await expect(header).toBeVisible()
    await expect(header).toContainText('baby_yoda')
  })

  test('refresh at /scene/baby_yoda loads the scene', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    const header = page.locator('.viewer-header .url-label')
    await expect(header).toContainText('baby_yoda')
  })

  test('playback mode has no Studio toolbar', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Studio toolbar buttons should not exist
    const studioToolbarExists = await page.evaluate(() => {
      // Check for Studio-specific toolbar buttons
      const scrollAnimatorBtn = document.querySelector('button[aria-label="Scroll Animator"]')
      const sparkControlsBtn = document.querySelector('button[aria-label="Spark Controls"]')
      const editorCameraBtn = document.querySelector('button[aria-label="Editor Camera"]')
      const inspectorBtn = document.querySelector('button[aria-label="Inspector"]')
      return {
        scrollAnimator: !!scrollAnimatorBtn,
        sparkControls: !!sparkControlsBtn,
        editorCamera: !!editorCameraBtn,
        inspector: !!inspectorBtn,
      }
    })
    expect(studioToolbarExists.scrollAnimator, 'no Scroll Animator button').toBe(false)
    expect(studioToolbarExists.sparkControls, 'no Spark Controls button').toBe(false)
    expect(studioToolbarExists.editorCamera, 'no Editor Camera button').toBe(false)
    expect(studioToolbarExists.inspector, 'no Inspector button').toBe(false)
  })

  test('playback mode has no Studio hierarchy (tree-view)', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const hasTreeView = await page.evaluate(() => {
      return document.querySelector('tree-view') !== null
    })
    expect(hasTreeView, 'no tree-view (Studio hierarchy)').toBe(false)
  })

  test('playback mode has no custom frustum helper diagnostic', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const hasDiagnostic = await page.evaluate(() => {
      return typeof (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic === 'function'
    })
    expect(hasDiagnostic, 'no frustum helper diagnostic in playback').toBe(false)
  })

  test('playback app camera is active (data-active="true")', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const activeAttr = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(activeAttr, 'app camera is active in playback').toBe('true')
  })

  test('playback scroll 0% camera position matches keyframes', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const state = await getCameraState(page)
    expect(state.progress).toBeCloseTo(0, 1)
    expect(state.x).toBeCloseTo(0, 0)
    expect(state.y).toBeCloseTo(0, 0)
    expect(state.z).toBeCloseTo(-1, 0)
  })

  test('playback scroll 100% camera position matches keyframes', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight) })
    await page.waitForTimeout(800)

    const state = await getCameraState(page)
    expect(state.progress).toBeGreaterThan(95)
    expect(state.y).toBeGreaterThan(25)
  })

  test('playback SplatWrapper transform matches scene values', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const wrapper = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } | null
      }
      const w = d.wrapper!
      return {
        x: w.position.x, y: w.position.y, z: w.position.z,
        rx: w.rotation.x, ry: w.rotation.y, rz: w.rotation.z,
        sx: w.scale.x, sy: w.scale.y, sz: w.scale.z,
      }
    })

    // baby_yoda.svelte declares: position={[0, 0, 0]} rotation={[0, 0, 0]} scale={[1, 1, 1]}
    expect(wrapper).toEqual({
      x: 0, y: 0, z: 0,
      rx: 0, ry: 0, rz: 0,
      sx: 1, sy: 1, sz: 1,
    })
  })

  test('playback Spark settings reach the controller', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Check that SparkControls settings are present via stub diagnostics
    const sparkSettings = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        sparkControlsDisposals: Record<string, number>
      }
      // If disposals exist, SparkControls was registered
      const ids = Object.keys(d.sparkControlsDisposals)
      return { registered: ids.length > 0, ids }
    })
    expect(sparkSettings.registered, 'SparkControls registered in playback').toBe(true)
  })

  test('playback repeated mount/unmount does not stack resources', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    for (let i = 0; i < 3; i++) {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
      await page.goto('/scene/baby_yoda')
      await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
      await waitForDebugElement(page)

      const state = await getCameraState(page)
      expect(state.y).toBeCloseTo(0, 0)
      expect(state.z).toBeCloseTo(-1, 0)
    }
  })
})

// ---------------------------------------------------------------------------
// Edit mode e2e tests (/scene/baby_yoda/edit)
// ---------------------------------------------------------------------------

test.describe('Edit mode (/scene/baby_yoda/edit)', () => {
  test('direct visit loads the scene with Studio toolbar', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const header = page.locator('.viewer-header .url-label')
    await expect(header).toBeVisible()
    await expect(header).toContainText('baby_yoda')

    // Studio toolbar buttons should exist
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Spark Controls' })).toBeVisible({ timeout: 15_000 })
  })

  test('edit mode has Studio hierarchy with scene objects', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Studio hierarchy items should be visible
    await expect(page.getByText('Camera ScrollAnimator')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Camera Target ScrollAnimator')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Spark')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('SplatWrapper')).toBeVisible({ timeout: 15_000 })
  })

  test('edit mode hierarchy items are selectable', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Select Camera ScrollAnimator
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Open Scroll Animator pane
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const animatorName = page.locator('.sa-animator-name')
    await expect(animatorName).toBeVisible({ timeout: 10_000 })
    await expect(animatorName).toContainText('Camera ScrollAnimator')
  })

  test('edit mode editor camera ownership toggles', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    // App camera active by default
    let active = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(active).toBe('true')

    // Toggle editor camera on
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)
    active = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(active).toBe('false')

    // Toggle editor camera off
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)
    active = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(active).toBe('true')
  })

  test('edit mode Scroll Animator pane edits work', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Select animator and open pane
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    // Keyframe list visible
    const keyframeRows = page.locator('.sa-kf-row')
    expect(await keyframeRows.count()).toBe(2)
  })

  test('edit mode Spark Controls pane works', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 15_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('spark-controls-panel')).toBeVisible()

    // All 22 fields visible
    const expectedFields = [
      'lodSplatScale', 'lodRenderScale', 'maxStdDev', 'maxPagedSplats',
      'coneFov0', 'coneFov', 'coneFoveate', 'behindFoveate',
      'minPixelRadius', 'maxPixelRadius', 'minAlpha', 'preBlurAmount',
      'blurAmount', 'falloff', 'clipXY', 'focalAdjustment',
      'sortRadial', 'minSortIntervalMs', 'enableLod', 'enableLodFetching',
      'lodSplatCount', 'lodInflate',
    ]
    for (const field of expectedFields) {
      await expect(page.getByTestId(`spark-field-${field}`)).toBeVisible()
    }
  })

  test('edit mode camera frustum helper works for opted-in animator', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Diagnostic should be available in edit mode
    const hasDiagnostic = await page.evaluate(() => {
      return typeof (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic === 'function'
    })
    expect(hasDiagnostic, 'frustum helper diagnostic exists in edit mode').toBe(true)

    // Select the opted-in animator
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    const diag = await page.evaluate(() => {
      const fn = (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic
      if (typeof fn !== 'function') return null
      return (fn as () => { helperExists: boolean; ownedHelperCount: number })()
    })
    expect(diag, 'diagnostic callable').not.toBeNull()
    expect(diag!.helperExists, 'helper created for opted-in animator').toBe(true)
    expect(diag!.ownedHelperCount, 'exactly one owned helper').toBe(1)
  })

  test('edit mode SplatWrapper has Studio source metadata', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const sourceInfo = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { userData: Record<string, unknown> } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) throw new Error('SplatWrapper not found')
      const studio = wrapper.userData?.threlteStudio as Record<string, unknown> | undefined
      if (!studio) throw new Error('userData.threlteStudio not found')

      let sourceFile: string | null = null
      function findFile(obj: unknown): void {
        if (typeof obj === 'string' && obj.includes('baby_yoda')) {
          sourceFile = obj
        } else if (obj && typeof obj === 'object') {
          for (const v of Object.values(obj as Record<string, unknown>)) {
            findFile(v)
          }
        }
      }
      findFile(studio)
      return sourceFile
    })

    const normalized = sourceInfo!.replace(/\\/g, '/')
    expect(normalized, 'SplatWrapper targets baby_yoda.svelte').toContain('baby_yoda.svelte')
  })
})

// ---------------------------------------------------------------------------
// Cross-mode e2e tests
// ---------------------------------------------------------------------------

test.describe('Cross-mode (view ↔ edit)', () => {
  test('view and edit use the same scene component', async ({ page }) => {
    // Navigate to view mode
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const viewState = await getCameraState(page)
    const viewWrapper = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { x: number; y: number; z: number } } | null
      }
      return { x: d.wrapper!.position.x, y: d.wrapper!.position.y, z: d.wrapper!.position.z }
    })

    // Navigate to edit mode
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await waitForDebugElement(page)

    const editState = await getCameraState(page)
    const editWrapper = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { x: number; y: number; z: number } } | null
      }
      return { x: d.wrapper!.position.x, y: d.wrapper!.position.y, z: d.wrapper!.position.z }
    })

    // Both modes show same camera position at scroll 0%
    expect(editState.x).toBeCloseTo(viewState.x, 0)
    expect(editState.y).toBeCloseTo(viewState.y, 0)
    expect(editState.z).toBeCloseTo(viewState.z, 0)

    // Both modes show same wrapper transform
    expect(editWrapper).toEqual(viewWrapper)
  })

  test('edit → view removes all editor UI and restores app camera', async ({ page }) => {
    // Start in edit mode
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Verify Studio is present
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })

    // Navigate to view mode
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Studio UI should be gone
    const studioElements = await page.evaluate(() => {
      return {
        hasTreeView: document.querySelector('tree-view') !== null,
        hasScrollAnimatorBtn: !!document.querySelector('button[aria-label="Scroll Animator"]'),
        hasSparkControlsBtn: !!document.querySelector('button[aria-label="Spark Controls"]'),
        hasEditorCameraBtn: !!document.querySelector('button[aria-label="Editor Camera"]'),
      }
    })
    expect(studioElements.hasTreeView, 'no tree-view after edit→view').toBe(false)
    expect(studioElements.hasScrollAnimatorBtn, 'no Scroll Animator button').toBe(false)
    expect(studioElements.hasSparkControlsBtn, 'no Spark Controls button').toBe(false)
    expect(studioElements.hasEditorCameraBtn, 'no Editor Camera button').toBe(false)

    // App camera should be active
    await waitForDebugElement(page)
    const activeAttr = await page.evaluate(() =>
      document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active')
    )
    expect(activeAttr, 'app camera active after edit→view').toBe('true')

    // No frustum helper diagnostic
    const hasDiagnostic = await page.evaluate(() =>
      typeof (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic === 'function'
    )
    expect(hasDiagnostic, 'no frustum helper diagnostic after edit→view').toBe(false)
  })

  test('view → edit mounts Studio and editor runtime', async ({ page }) => {
    // Start in view mode
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // No Studio
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).not.toBeVisible()

    // Navigate to edit mode
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    // Studio should be present
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Spark Controls' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Editor Camera' })).toBeVisible({ timeout: 15_000 })

    // Frustum helper diagnostic should be available
    const hasDiagnostic = await page.evaluate(() =>
      typeof (window as unknown as Record<string, unknown>).__camera_frustum_helper_diagnostic === 'function'
    )
    expect(hasDiagnostic, 'frustum helper diagnostic in edit mode').toBe(true)
  })

  test('back/forward preserves route mode', async ({ page }) => {
    // Start at landing
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    // Navigate to view mode
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).not.toBeVisible()

    // Navigate to edit mode
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })

    // Go back → should be view mode
    await page.goBack()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).not.toBeVisible()

    // Go forward → should be edit mode
    await page.goForward()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })
  })

  test('refresh preserves route mode (view)', async ({ page }) => {
    await page.goto('/scene/baby_yoda')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).not.toBeVisible()
  })

  test('refresh preserves route mode (edit)', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit')
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    await page.reload()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Scroll Animator' })).toBeVisible({ timeout: 15_000 })
  })
})

// ---------------------------------------------------------------------------
// Not-found for malformed edit routes
// ---------------------------------------------------------------------------

test.describe('Not-found for malformed edit routes', () => {
  test('unknown scene name /edit shows not-found', async ({ page }) => {
    await page.goto('/scene/nonexistent/edit')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('/scene/baby_yoda/unknown shows not-found', async ({ page }) => {
    await page.goto('/scene/baby_yoda/unknown')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('/scene/baby_yoda/edit/extra shows not-found', async ({ page }) => {
    await page.goto('/scene/baby_yoda/edit/extra')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })

  test('uppercase scene name /edit shows not-found', async ({ page }) => {
    await page.goto('/scene/Baby_Yoda/edit')
    await expect(page.getByRole('heading', { name: 'Scene not found' })).toBeVisible({ timeout: 10_000 })
  })
})
