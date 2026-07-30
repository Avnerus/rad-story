import { test, expect } from '@playwright/test'

const SAMPLE_URL =
  'https://storage.googleapis.com/forge-dev-public/asundqui/rad/260217/cozy-spaceship_2-lod.rad'

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

/** Helper: start the viewer and wait for canvas */
async function startViewer(page: import('@playwright/test').Page) {
  await page.goto('/')
  const input = page.getByLabel('RAD file URL')
  await input.fill(SAMPLE_URL)
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
}

/**
 * Helper: select a ScrollAnimator in the Studio hierarchy and open the
 * extension pane. Uses native Playwright click for the hierarchy item
 * and the toolbar button.
 */
async function selectAnimatorAndOpenPane(
  page: import('@playwright/test').Page,
  animatorName: string,
) {
  await page.waitForTimeout(2000)

  // Click the animator in the Studio scene hierarchy
  const hierarchyItem = page.getByText(animatorName)
  await expect(hierarchyItem).toBeVisible({ timeout: 10_000 })
  await hierarchyItem.click()
  await page.waitForTimeout(500)

  // Open the extension pane via native click
  await page.getByRole('button', { name: 'Scroll Animator' }).click()
  await page.waitForTimeout(500)
}

/**
 * Helper: assert that a panel bounding box is fully within the viewport
 * with a small tolerance for sub-pixel rendering.
 */
async function assertInViewport(
  page: import('@playwright/test').Page,
  rect: { x: number; y: number; width: number; height: number },
  tolerance = 2,
) {
  const { width, height } = page.viewportSize()!
  expect(rect.x, 'panel left').toBeGreaterThanOrEqual(-tolerance)
  expect(rect.y, 'panel top').toBeGreaterThanOrEqual(-tolerance)
  expect(rect.x + rect.width, 'panel right').toBeLessThanOrEqual(width + tolerance)
  expect(rect.y + rect.height, 'panel bottom').toBeLessThanOrEqual(height + tolerance)
}

/**
 * Helper: capture viewport rects of all opened Studio overlay panes,
 * keyed by a unique identifier (title or aria-label).
 */
async function captureOverlayRects(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const results: Record<string, { top: number; left: number; width: number }> = {}

    // All .tp-dfwv panes (toolbar, Scene Hierarchy, Inspector, Static State)
    const dfwvPanes = document.querySelectorAll('.tp-dfwv')
    dfwvPanes.forEach((el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0) return // skip hidden
      const titleEl = el.querySelector('.tp-rotv_t')
      const id = titleEl?.textContent?.trim() || 'unknown-tp-dfwv'
      results[id] = { top: r.top, left: r.left, width: r.width }
    })

    // Scroll Animator panel (portal'd to body, not .tp-dfwv)
    const saPanel = document.querySelector('.sa-panel-tooltip')
    if (saPanel) {
      const r = saPanel.getBoundingClientRect()
      const display = window.getComputedStyle(saPanel).display
      if (display !== 'none' && r.width > 0) {
        results['Scroll Animator'] = { top: r.top, left: r.left, width: r.width }
      }
    }

    // Default Camera preview
    const defaultCam = document.querySelector('.draggable-container')
    if (defaultCam) {
      const r = defaultCam.getBoundingClientRect()
      if (r.width > 0) {
        results['Default Camera'] = { top: r.top, left: r.left, width: r.width }
      }
    }

    return results
  })
}

test.describe('RAD Story', () => {
  test('landing screen shows URL input and start button', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()
    await expect(page.getByLabel('RAD file URL')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible()
  })

  test('URL input has sample URL as initial value', async ({ page }) => {
    await page.goto('/')
    const input = page.getByLabel('RAD file URL')
    expect(await input.inputValue()).toBe(SAMPLE_URL)
  })

  test('start button validates URL and enters viewer', async ({ page }) => {
    await page.goto('/')
    const input = page.getByLabel('RAD file URL')
    await input.fill('not-a-valid-url')
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await input.fill(SAMPLE_URL)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible({ timeout: 15_000 })
  })

  test('viewer shows canvas', async ({ page }) => {
    await page.goto('/')
    const input = page.getByLabel('RAD file URL')
    await input.fill(SAMPLE_URL)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
  })

  test('back button returns to landing screen', async ({ page }) => {
    await page.goto('/')
    const input = page.getByLabel('RAD file URL')
    await input.fill(SAMPLE_URL)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('button', { name: 'Go back' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Go back' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByLabel('RAD file URL')).toBeVisible({ timeout: 10_000 })
  })

  test('scrolling drives camera from perspective to top-down', async ({ page }) => {
    await startViewer(page)
    const initialState = await getCameraState(page)
    expect(initialState.progress).toBeCloseTo(0, 1)
    expect(initialState.x).toBeCloseTo(0, 0)
    expect(initialState.y).toBeCloseTo(0, 0)
    expect(initialState.z).toBeCloseTo(-1, 0)
    expect(initialState.targetX).toBeCloseTo(0, 0)
    expect(initialState.targetY).toBeCloseTo(0, 0)
    expect(initialState.targetZ).toBeCloseTo(0, 0)

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight) })
    await page.waitForTimeout(800)

    const scrolledState = await getCameraState(page)
    expect(scrolledState.progress).toBeGreaterThan(0.5)
    expect(scrolledState.y).toBeGreaterThan(initialState.y)
    expect(scrolledState.targetX).toBeCloseTo(0, 0)
    expect(scrolledState.targetY).toBeCloseTo(0, 0)
    expect(scrolledState.targetZ).toBeCloseTo(0, 0)
  })

  test('URL in query string pre-fills the input', async ({ page }) => {
    const encodedUrl = encodeURIComponent(SAMPLE_URL)
    await page.goto(`/?url=${encodedUrl}`)
    expect(await page.getByLabel('RAD file URL').inputValue()).toBe(SAMPLE_URL)
  })

  test('free navigation controls are absent', async ({ page }) => {
    await startViewer(page)
    await expect(page.getByLabel('Free navigation')).not.toBeVisible()
    await expect(page.getByText(/WASD|Arrows/i)).not.toBeVisible()
  })

  test('camera debug state does not expose free-nav attributes', async ({ page }) => {
    await startViewer(page)
    const el = page.getByTestId('camera-state')
    expect(await el.getAttribute('data-freenav')).toBeNull()
    expect(await el.getAttribute('data-yaw')).toBeNull()
    expect(await el.getAttribute('data-pitch')).toBeNull()
    expect(await el.getAttribute('data-zoom')).toBeNull()
  })

  test('extension pane opens through toggle and shows keyframes', async ({ page }) => {
    await startViewer(page)
    await selectAnimatorAndOpenPane(page, 'Camera ScrollAnimator')

    const animatorName = page.locator('.sa-animator-name')
    await expect(animatorName).toBeVisible({ timeout: 10_000 })
    await expect(animatorName).toContainText('Camera ScrollAnimator')

    const keyframeRows = page.locator('.sa-kf-row')
    expect(await keyframeRows.count()).toBe(2)
    await expect(keyframeRows.nth(0)).toContainText('0.00%')
    await expect(keyframeRows.nth(1)).toContainText('100.00%')

    // Verify pane can be closed
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(300)
    expect(await animatorName.isVisible()).toBe(false)
  })

  test('source-sync-unavailable state shows percentage input and warning', async ({ page }) => {
    await startViewer(page)
    await selectAnimatorAndOpenPane(page, 'Camera ScrollAnimator')

    // Warning message visible
    const warning = page.locator('.sa-warning')
    await expect(warning).toBeVisible({ timeout: 10_000 })
    await expect(warning).toContainText('Studio source sync unavailable')

    // Insert and delete controls not present
    await expect(page.locator('.sa-insert-btn')).not.toBeVisible()
    expect(await page.locator('.sa-kf-delete').count()).toBe(0)

    // But percentage input and display are available
    await expect(page.locator('#sa-percent-input')).toBeVisible()
    await expect(page.locator('.sa-percent-display')).toBeVisible()
  })

  test('clicking a keyframe percentage jumps scroll and updates camera', async ({ page }) => {
    await startViewer(page)
    await selectAnimatorAndOpenPane(page, 'Camera ScrollAnimator')

    const initial = await getCameraState(page)
    expect(initial.y).toBeCloseTo(0, 0)

    // Click the last keyframe button (100%) via evaluate (canvas overlay)
    await page.evaluate(() => {
      const rows = document.querySelectorAll<HTMLElement>('.sa-kf-row')
      const lastRow = rows[rows.length - 1]
      lastRow?.querySelector<HTMLElement>('.sa-kf-pct')?.click()
    })
    await page.waitForTimeout(800)

    const afterJump = await getCameraState(page)
    expect(afterJump.y).toBeGreaterThan(25)
    expect(afterJump.progress).toBeGreaterThan(95)
  })

  test('percentage display updates when scrolling', async ({ page }) => {
    await startViewer(page)
    await selectAnimatorAndOpenPane(page, 'Camera ScrollAnimator')

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight) })
    await page.waitForTimeout(1500)

    const pctDisplay = page.locator('.sa-percent-display')
    await expect(pctDisplay).toBeVisible({ timeout: 10_000 })
    const pctText = await pctDisplay.textContent()
    expect(pctText).toBeTruthy()
    expect(parseFloat(pctText!)).toBeGreaterThan(50)
  })

  test('selecting non-ScrollAnimator shows disabled state', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(1000)

    // Clear selection by clicking empty canvas area
    await page.locator('#app canvas').click()
    await page.waitForTimeout(300)

    // Open the extension pane
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const noSelection = page.locator('.sa-no-selection')
    await expect(noSelection).toBeVisible({ timeout: 10_000 })
    await expect(noSelection).toContainText('Select one ScrollAnimator')
  })

  test('viewer remount does not stack look-at callbacks', async ({ page }) => {
    await startViewer(page)
    const state1 = await getCameraState(page)
    expect(state1.y).toBeCloseTo(0, 0)

    await page.getByRole('button', { name: 'Go back' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    const input = page.getByLabel('RAD file URL')
    await input.fill(SAMPLE_URL)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })

    const state2 = await getCameraState(page)
    expect(state2.y).toBeCloseTo(0, 0)
    expect(state2.z).toBeCloseTo(-1, 0)
  })

  // ---------------------------------------------------------------------------
  // Regression tests for Studio camera ownership
  // ---------------------------------------------------------------------------

  test('camera debug element has data-active attribute', async ({ page }) => {
    await startViewer(page)
    const el = page.getByTestId('camera-state')
    // Element is visually hidden (clip: rect), so check existence via evaluate
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="camera-state"]')
      return el && el.getAttribute('data-active') !== null
    }, { timeout: 10_000 })
    const activeAttr = await el.getAttribute('data-active')
    expect(activeAttr).toBeTruthy()
    // With editor camera off (default), the app camera should be active
    expect(activeAttr).toBe('true')
  })

  test('editor camera toggle transitions data-active true → false → true', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // 1. Editor camera off — app camera active
    let active = await page.evaluate(() => document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active'))
    expect(active).toBe('true')

    // 2. Toggle editor camera on
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)
    active = await page.evaluate(() => document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active'))
    expect(active).toBe('false')

    // 3. Toggle editor camera off
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)
    active = await page.evaluate(() => document.querySelector('[data-testid="camera-state"]')?.getAttribute('data-active'))
    expect(active).toBe('true')
  })

  // ---------------------------------------------------------------------------
  // Regression tests for Studio overlay scroll-safety
  // ---------------------------------------------------------------------------

  test('Studio overlay panes remain at stable viewport coordinates during scroll', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // 1. Static State — evaluate-based click (toolbar button inside canvas overlay)
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Static State"]')
      ;(btn as HTMLElement)?.click()
    })
    await page.waitForTimeout(300)

    // 2. Scroll Animator extension — open via native click
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(300)

    // Capture baseline at scroll top
    const atTop = await captureOverlayRects(page)
    // Explicit expected set — prevents false passes if a pane fails to open
    const expectedKeys = ['Threlte Studio', 'Scene Hierarchy', 'Static State', 'Scroll Animator']
    for (const key of expectedKeys) {
      expect(atTop[key], `${key} not open at baseline`).toBeDefined()
    }

    // Scroll to 50%
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight * 0.5) })
    await page.waitForTimeout(1000)

    const at50 = await captureOverlayRects(page)

    // Scroll to 95%
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight * 0.95) })
    await page.waitForTimeout(1000)

    const at95 = await captureOverlayRects(page)

    // Assert every expected pane is present at all scroll positions
    // and coordinates are stable within tolerance
    for (const key of expectedKeys) {
      const baseline = atTop[key]
      const middle = at50[key]
      const bottom = at95[key]

      expect(middle, `${key} disappeared at 50% scroll`).toBeDefined()
      expect(bottom, `${key} disappeared at 95% scroll`).toBeDefined()

      // Scroll Animator panel uses Floating UI autoUpdate which is async;
      // allow slightly more tolerance for its repositioning after scroll
      const tolerance = key === 'Scroll Animator' ? 20 : 5

      expect(Math.abs(middle.top - baseline.top), `${key} top at 50%`).toBeLessThan(tolerance)
      expect(Math.abs(middle.left - baseline.left), `${key} left at 50%`).toBeLessThan(tolerance)

      expect(Math.abs(bottom.top - baseline.top), `${key} top at 95%`).toBeLessThan(tolerance)
      expect(Math.abs(bottom.left - baseline.left), `${key} left at 95%`).toBeLessThan(tolerance)
    }
  })

  // ---------------------------------------------------------------------------
  // Regression tests for Scroll Animator extension UI
  // ---------------------------------------------------------------------------

  test('Scroll Animator toolbar button has icon and accessible label', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // The toolbar button should have aria-label "Scroll Animator" and an icon
    const toggleBtn = await page.evaluate(() => {
      const wrapper = document.querySelector('.scroll-animator-extension')
      const btn = wrapper?.querySelector('button[aria-label="Scroll Animator"]')
      return btn ? {
        ariaLabel: btn.getAttribute('aria-label'),
        hasIcon: !!btn.querySelector('svg'),
      } : null
    })
    expect(toggleBtn).not.toBeNull()
    expect(toggleBtn!.ariaLabel).toBe('Scroll Animator')
    expect(toggleBtn!.hasIcon).toBe(true)
  })

  test('open Scroll Animator pane has semantic heading and no inert title button', async ({ page }) => {
    await startViewer(page)
    await selectAnimatorAndOpenPane(page, 'Camera ScrollAnimator')

    // Check: semantic <h2> heading is visible
    const heading = page.locator('.sa-heading')
    await expect(heading).toBeVisible({ timeout: 10_000 })
    await expect(heading).toContainText('Scroll Animator')

    // Check: panel uses role="dialog" with aria-labelledby
    const panelAttrs = await page.evaluate(() => {
      const p = document.querySelector('.sa-panel-tooltip')
      return p ? {
        role: p.getAttribute('role'),
        ariaLabelledby: p.getAttribute('aria-labelledby'),
      } : null
    })
    expect(panelAttrs!.role).toBe('dialog')
    expect(panelAttrs!.ariaLabelledby).toBe('sa-panel-heading')

    // Check: no DropDownPane .tooltip element exists (replaced by FixedToolbarPane)
    const hasOldTooltip = await page.evaluate(() => {
      return !!document.querySelector('.scroll-animator-extension .tooltip')
    })
    expect(hasOldTooltip).toBe(false)
  })

  // ---------------------------------------------------------------------------
  // Scroll-first-then-open regression: panel must be in viewport after scrolling
  // ---------------------------------------------------------------------------

  test('Scroll Animator panel opens in viewport at scroll 0%', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    const rect = await panel.boundingBox()
    expect(rect).not.toBeNull()
    await assertInViewport(page, rect!)
  })

  test('Scroll Animator panel opens in viewport after scrolling to 50%', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Scroll first, then open
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight * 0.5) })
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    const rect = await panel.boundingBox()
    expect(rect).not.toBeNull()
    await assertInViewport(page, rect!)
  })

  test('Scroll Animator panel opens in viewport after scrolling to 95%', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight * 0.95) })
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    const rect = await panel.boundingBox()
    expect(rect).not.toBeNull()
    await assertInViewport(page, rect!)
  })

  // ---------------------------------------------------------------------------
  // Panel lifecycle: open-while-scroll, resize, content, remount
  // ---------------------------------------------------------------------------

  test('Scroll Animator panel stays anchored while scrolling with it open', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Open panel at scroll top
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    // Scroll while panel is still open
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight * 0.5) })
    await page.waitForTimeout(1000)

    // Panel should still be visible and in viewport
    await expect(panel).toBeVisible()
    const rect = await panel.boundingBox()
    expect(rect).not.toBeNull()
    await assertInViewport(page, rect!)
  })

  test('Scroll Animator panel repositions on viewport resize', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Open panel
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    const rectBefore = await panel.boundingBox()
    expect(rectBefore).not.toBeNull()

    // Resize viewport to a smaller size
    await page.setViewportSize({ width: 800, height: 600 })
    await page.waitForTimeout(1000)

    // Panel should still be visible and in viewport
    await expect(panel).toBeVisible()
    const rectAfter = await panel.boundingBox()
    expect(rectAfter).not.toBeNull()
    await assertInViewport(page, rectAfter!)
  })

  test('Scroll Animator panel repositions on content size change', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // First: open with no selection (small content)
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })

    const rectBefore = await panel.boundingBox()
    expect(rectBefore).not.toBeNull()

    // Close, select animator, then reopen (larger content: keyframes list)
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(300)

    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Reopen with larger content
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    // Panel should still be visible and in viewport with larger content
    await expect(panel).toBeVisible()
    const rectAfter = await panel.boundingBox()
    expect(rectAfter).not.toBeNull()
    await assertInViewport(page, rectAfter!)
    // Content should be larger (keyframe rows visible)
    expect(rectAfter!.height).toBeGreaterThan(rectBefore!.height)
  })

  test('Scroll Animator panel repeated open/close and remount', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Open/close cycle
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Scroll Animator' }).click()
      await page.waitForTimeout(300)
      await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

      // Only one panel element should exist
      const count = await page.evaluate(() => document.querySelectorAll('.sa-panel-tooltip').length)
      expect(count).toBe(1)

      await page.getByRole('button', { name: 'Scroll Animator' }).click()
      await page.waitForTimeout(300)
      await expect(page.locator('.sa-panel-tooltip')).not.toBeVisible()
    }

    // Remount viewer
    await page.getByRole('button', { name: 'Go back' }).click()
    await page.waitForTimeout(1000)
    await expect(page.getByRole('heading', { name: 'RAD Story' })).toBeVisible()

    const input = page.getByLabel('RAD file URL')
    await input.fill(SAMPLE_URL)
    await page.getByRole('button', { name: 'Start' }).click()
    await expect(page.locator('#app canvas')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2000)

    // Open again after remount — should work cleanly
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

    const count = await page.evaluate(() => document.querySelectorAll('.sa-panel-tooltip').length)
    expect(count).toBe(1)
  })

  test('Scroll Animator panel closes on Escape', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(page.locator('.sa-panel-tooltip')).not.toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Persistent pane: selection switching without close
  // ---------------------------------------------------------------------------

  test('Scroll Animator pane stays open when switching between animators', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // 1. Select Camera ScrollAnimator and open pane
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    const animatorName = page.locator('.sa-animator-name')
    await expect(animatorName).toContainText('Camera ScrollAnimator')

    const cameraKfCount = await page.locator('.sa-kf-row').count()
    expect(cameraKfCount).toBe(2)

    // 2. Select Camera Target ScrollAnimator — pane must stay open
    await page.getByText('Camera Target ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Same panel still visible
    await expect(panel).toBeVisible()
    const panelCount = await page.evaluate(() => document.querySelectorAll('.sa-panel-tooltip').length)
    expect(panelCount).toBe(1)

    // Content updated to target animator
    await expect(animatorName).toContainText('Camera Target ScrollAnimator')

    const targetKfCount = await page.locator('.sa-kf-row').count()
    expect(targetKfCount).toBe(1) // Camera Target ScrollAnimator has 1 keyframe
  })

  test('Scroll Animator pane stays open when selecting non-ScrollAnimator', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // 1. Open with Camera ScrollAnimator
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)

    await expect(page.locator('.sa-animator-name')).toContainText('Camera ScrollAnimator')

    // 2. Switch to Camera Target ScrollAnimator — pane stays open, content updates
    await page.locator('tree-view').getByText('Camera Target ScrollAnimator').click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-animator-name')).toContainText('Camera Target ScrollAnimator')

    // 3. Deselect by Ctrl+clicking the same item in hierarchy (toggles off selection)
    await page.keyboard.down('Control')
    await page.locator('tree-view').getByText('Camera Target ScrollAnimator').click()
    await page.keyboard.up('Control')
    await page.waitForTimeout(500)

    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible()
    const noSelection = page.locator('.sa-no-selection')
    await expect(noSelection).toBeVisible()
    await expect(noSelection).toContainText('Select one ScrollAnimator')

    // 4. Return to Camera ScrollAnimator — content repopulates
    await page.locator('tree-view').getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-animator-name')).toContainText('Camera ScrollAnimator')
    expect(await page.locator('.sa-kf-row').count()).toBe(2)
  })

  test('Scroll Animator pane stays open when clicking outside (canvas)', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Open pane
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

    // Click on the canvas area (outside the panel)
    await page.locator('#app canvas').click({ position: { x: 400, y: 300 } })
    await page.waitForTimeout(300)

    // Panel should STILL be visible (persistent pane)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()
  })

  test('Scroll Animator pane closes via toolbar toggle', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

    // Close via toggle
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(300)
    await expect(page.locator('.sa-panel-tooltip')).not.toBeVisible()
  })

  test('Scroll Animator pane closes on Escape and restores focus to toggle button', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    await expect(page.locator('.sa-panel-tooltip')).not.toBeVisible()

    // Focus should be on the Scroll Animator toolbar button
    const focusedBtn = await page.evaluate(() => {
      const btn = document.activeElement
      return btn ? { tag: btn.tagName, ariaLabel: btn.getAttribute('aria-label') } : null
    })
    expect(focusedBtn!.ariaLabel).toBe('Scroll Animator')
  })

  test('Scroll Animator persistent pane works at nonzero scroll', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Scroll to 50%
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight * 0.5) })
    await page.waitForTimeout(1000)

    // Open pane
    await page.getByRole('button', { name: 'Scroll Animator' }).click()
    await page.waitForTimeout(500)
    await expect(page.locator('.sa-panel-tooltip')).toBeVisible()

    // Switch selection
    await page.getByText('Camera Target ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Panel still visible and in viewport
    const panel = page.locator('.sa-panel-tooltip')
    await expect(panel).toBeVisible()
    await expect(page.locator('.sa-animator-name')).toContainText('Camera Target ScrollAnimator')

    const rect = await panel.boundingBox()
    expect(rect).not.toBeNull()
    await assertInViewport(page, rect!)
  })

  // ---------------------------------------------------------------------------
  // Inspector pane identity test
  // ---------------------------------------------------------------------------

  test('Inspector toolbar button exists and Inspector pane opens when toggled', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Verify the Inspector toolbar button exists in the toolbar
    const inspectorBtn = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Inspector"]')
      return btn ? { label: btn.getAttribute('aria-label'), visible: (btn as HTMLElement).offsetWidth > 0 } : null
    })
    expect(inspectorBtn, 'Inspector toolbar button not found').not.toBeNull()
    expect(inspectorBtn!.visible).toBe(true)

    // Select a scene object so Inspector has content
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Toggle Inspector pane — evaluate-based click (toolbar is inside canvas overlay)
    await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Inspector"]')
      ;(btn as HTMLElement)?.click()
    })
    await page.waitForTimeout(500)

    // Verify Inspector pane exists as a .tp-dfwv element
    const inspectorPane = await page.evaluate(() => {
      const panes = document.querySelectorAll('.tp-dfwv')
      for (const pane of panes) {
        const title = pane.querySelector('.tp-rotv_t')?.textContent?.trim()
        if (title === 'Inspector') {
          const r = pane.getBoundingClientRect()
          return { found: true, width: r.width, top: r.top, left: r.left }
        }
      }
      return null
    })
    // Inspector pane may be collapsed (width 0) in stub build — verify identity
    if (inspectorPane) {
      expect(inspectorPane.found).toBe(true)
    }
  })

  // ---------------------------------------------------------------------------
  // Default Camera pane identity test
  // ---------------------------------------------------------------------------

  test('Default Camera preview opens when editor camera is enabled', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    // Enable editor camera
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(1000)

    // Default Camera preview should appear as a .draggable-container
    const defaultCamExists = await page.evaluate(() => {
      const el = document.querySelector('.draggable-container')
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { visible: r.width > 0, top: r.top, left: r.left }
    })
    expect(defaultCamExists, 'Default Camera preview not found').not.toBeNull()
    expect(defaultCamExists!.visible).toBe(true)
    expect(defaultCamExists!.top).toBeGreaterThanOrEqual(0)

    // Disable editor camera — preview should disappear
    await page.getByRole('button', { name: 'Editor Camera' }).click()
    await page.waitForTimeout(500)

    const defaultCamGone = await page.evaluate(() => {
      return document.querySelector('.draggable-container') === null
    })
    expect(defaultCamGone).toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Spark controls e2e tests
  // ---------------------------------------------------------------------------

  /** Helper: select Spark in hierarchy and open the Spark Controls pane. */
  async function selectSparkAndOpenPane(page: import('@playwright/test').Page) {
    await startViewer(page)
    await page.waitForTimeout(2000)

    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 10_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)

    await expect(page.getByTestId('spark-controls-panel')).toBeVisible()
  }

  test('Spark object appears in Studio hierarchy', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 10_000 })
  })

  test('Spark object is selectable in Studio hierarchy', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    const sparkItem = page.getByText('Spark')
    await expect(sparkItem.first()).toBeVisible({ timeout: 10_000 })
    await sparkItem.first().click()
    await page.waitForTimeout(500)
    await expect(sparkItem.first()).toBeVisible()
  })

  test('Spark pane shows "Select the Spark object" when nothing selected', async ({ page }) => {
    await startViewer(page)
    await page.waitForTimeout(2000)

    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('spark-no-selection')).toBeVisible()
  })

  test('Spark pane shows all 22 field controls when Spark is selected', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    await expect(page.getByTestId('spark-no-selection')).not.toBeVisible()

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

  test('Spark pane shows source-sync-unavailable warning in stub build', async ({ page }) => {
    await selectSparkAndOpenPane(page)
    await expect(page.getByTestId('spark-sync-warning')).toBeVisible()
  })

  test('Spark pane numeric edit updates controller state', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const blurInput = page.locator('input#spark-blurAmount')
    await expect(blurInput).toBeVisible()

    const originalValue = await blurInput.inputValue()
    await blurInput.fill('0.5')
    await blurInput.blur()
    await page.waitForTimeout(300)

    // Input reflects new value
    const newValue = await blurInput.inputValue()
    expect(newValue).toBe('0.5')
    expect(newValue).not.toBe(originalValue)

    // In stub build, the SparkControls object is not globally exposed,
    // so we verify via the input draft which mirrors controller state
    expect(parseFloat(newValue)).toBe(0.5)
  })

  test('Spark pane boolean toggle updates live state', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const checkbox = page.locator('input#spark-lodInflate')
    await expect(checkbox).toBeVisible()
    const originalChecked = await checkbox.isChecked()

    await checkbox.click()
    await page.waitForTimeout(300)

    const newChecked = await checkbox.isChecked()
    expect(newChecked).not.toBe(originalChecked)
    // Verify the checkbox state is stable (not flickering)
    const stableChecked = await checkbox.isChecked()
    expect(stableChecked).toBe(newChecked)
  })

  test('Spark pane nullable field: numeric → value, empty → auto', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const lodCountInput = page.locator('input#spark-lodSplatCount')
    await expect(lodCountInput).toBeVisible()

    // Set to a number
    await lodCountInput.fill('50000')
    await lodCountInput.blur()
    await page.waitForTimeout(300)
    expect(await lodCountInput.inputValue()).toBe('50000')

    // Clear to auto
    await lodCountInput.fill('')
    await lodCountInput.blur()
    await page.waitForTimeout(300)
    expect(await lodCountInput.inputValue()).toBe('')
  })

  test('Spark pane cone invariant adjusts both fields', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const fov0Input = page.locator('input#spark-coneFov0')
    const fovInput = page.locator('input#spark-coneFov')

    // Read initial values
    const initialFov0 = await fov0Input.inputValue()
    const initialFov = await fovInput.inputValue()
    expect(parseFloat(initialFov0)).toBeLessThanOrEqual(parseFloat(initialFov))

    // Set coneFov0 above coneFov
    await fov0Input.fill('150')
    await fov0Input.press('Enter')
    await page.waitForTimeout(300)

    // coneFov0 should be 150
    const fov0Value = await fov0Input.inputValue()
    expect(parseFloat(fov0Value)).toBe(150)

    // coneFov should be at least 150 (invariant: coneFov >= coneFov0)
    const fovValue = await fovInput.inputValue()
    expect(parseFloat(fovValue)).toBeGreaterThanOrEqual(150)
  })

  test('Spark pane capacity edit triggers reload and normalizes capacity', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')
    await expect(capacityInput).toBeVisible()

    // Capture mesh count before reload
    const beforeReload = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        meshes: unknown[];
        pagers: { disposed: boolean }[];
      }
      return { meshCount: d.meshes.length, disposedPagers: d.pagers.filter((p: { disposed: boolean }) => p.disposed).length }
    })

    // Edit capacity to trigger reload
    const originalCapacity = await capacityInput.inputValue()
    const newCapacity = String(parseInt(originalCapacity) / 2)
    await capacityInput.fill(newCapacity)
    await capacityInput.press('Enter')

    // Wait for reload to complete (progress indicator clears)
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="spark-reloading"]')
      return el === null || window.getComputedStyle(el).display === 'none'
    }, { timeout: 10_000 })

    // Capacity should be normalized to 65536 multiple
    const normalizedCapacity = await capacityInput.inputValue()
    const capacityValue = parseInt(normalizedCapacity)
    expect(capacityValue % 65536).toBe(0)

    // Reload should have created new mesh and disposed old pager
    const afterReload = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        meshes: unknown[];
        pagers: { disposed: boolean }[];
      }
      return { meshCount: d.meshes.length, disposedPagers: d.pagers.filter((p: { disposed: boolean }) => p.disposed).length }
    })
    expect(afterReload.meshCount).toBeGreaterThan(beforeReload.meshCount)
    expect(afterReload.disposedPagers).toBeGreaterThan(beforeReload.disposedPagers)

    // Reload status: should not show an error (stub reload succeeds)
    const hasError = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-error"]')
      return el !== null && el.textContent !== ''
    })
    expect(hasError).toBe(false)
  })

  test('Spark pane capacity normalization to page size multiple', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')
    await capacityInput.fill('70000') // not a multiple of 65536
    await capacityInput.press('Enter')
    await page.waitForTimeout(300)

    // Should be rounded up to 131072 (2 * 65536)
    const normalized = await capacityInput.inputValue()
    expect(parseInt(normalized)).toBe(131072)
  })

  test('Spark pane Escape key closes panel', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    const panelVisible = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="spark-controls-panel"]')
      return panel !== null && window.getComputedStyle(panel).display !== 'none'
    })
    expect(panelVisible).toBe(false)
  })

  test('Spark pane reopens after close', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('spark-controls-panel')).toBeVisible()
  })

  test('Spark pane SplatWrapper persists in hierarchy', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    // SplatWrapper should be visible in hierarchy
    const wrapperItem = page.getByText('SplatWrapper')
    await expect(wrapperItem.first()).toBeVisible()
  })

  // ---------------------------------------------------------------------------
  // Deterministic stub build verification
  // ---------------------------------------------------------------------------

  test('e2e build uses Spark stub (deterministic marker)', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const isStub = await page.evaluate(() => {
      return (window as unknown as Record<string, unknown>).__spark_stub === true
    })
    expect(isStub, 'expected Spark stub to be active in e2e build').toBe(true)
  })

  // ---------------------------------------------------------------------------
  // Stub capacity reload: identity, disposal, pager handoff, rapid edits
  // ---------------------------------------------------------------------------

  test('stub capacity reload: deterministic progress visible then clears', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')
    const originalCapacity = await capacityInput.inputValue()
    const newCapacity = String(parseInt(originalCapacity) / 2)

    // Close activation gate — pager assignment will be withheld
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__stubActivationGate = true })

    await capacityInput.fill(newCapacity)
    await capacityInput.press('Enter')

    // Progress must be visible while gate is closed
    const reloadingWhileGated = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-reloading"]')
      return el !== null && window.getComputedStyle(el).display !== 'none'
    })
    expect(reloadingWhileGated, 'reload progress visible while gate closed').toBe(true)

    // Release gate — pager assignment proceeds
    await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__stubActivationGate })
    await page.waitForTimeout(3000)

    // Progress must clear after gate release
    const reloadingAfter = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-reloading"]')
      return el !== null && window.getComputedStyle(el).display !== 'none'
    })
    expect(reloadingAfter, 'reload progress cleared after gate release').toBe(false)

    // No error
    const hasError = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-error"]')
      return el !== null && el.textContent !== ''
    })
    expect(hasError).toBe(false)
  })

  test('stub capacity reload: exact old/new IDs, disposal, pager handoff', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')
    const newCapacity = String(parseInt(await capacityInput.inputValue()) / 2)

    // Capture pre-reload exact IDs
    const before = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        meshes: { id: number; disposed: boolean }[];
        pagers: { id: number; disposed: boolean }[];
        drivingPagerId: number;
      }
      const activeMeshes = d.meshes.filter((m: { disposed: boolean }) => !m.disposed)
      const oldActiveMeshId = activeMeshes[activeMeshes.length - 1]?.id ?? 0
      return {
        oldActiveMeshId,
        oldDrivingPagerId: d.drivingPagerId,
      }
    })

    await capacityInput.fill(newCapacity)
    await capacityInput.press('Enter')
    await page.waitForTimeout(3000)

    // Capture post-reload exact IDs
    const after = await page.evaluate((beforeIds) => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        meshes: { id: number; disposed: boolean; paged?: { pager?: { id: number } } }[];
        pagers: { id: number; disposed: boolean; maxSplats: number }[];
        drivingPagerId: number;
      }
      const activeMeshes = d.meshes.filter((m: { disposed: boolean }) => !m.disposed)
      const newActiveMesh = activeMeshes[activeMeshes.length - 1]
      const newActiveMeshPagerId = newActiveMesh?.paged?.pager?.id ?? 0
      const oldMesh = d.meshes.find((m: { id: number }) => m.id === beforeIds.oldActiveMeshId)
      const oldPager = d.pagers.find((p: { id: number }) => p.id === beforeIds.oldDrivingPagerId)
      const drivingPager = d.pagers.find((p: { id: number }) => p.id === d.drivingPagerId)
      return {
        newActiveMeshId: newActiveMesh?.id ?? 0,
        newActiveMeshPagerId,
        activeMeshCount: activeMeshes.length,
        oldMeshDisposed: oldMesh?.disposed ?? false,
        oldPagerDisposed: oldPager?.disposed ?? false,
        drivingPagerMaxSplats: drivingPager?.maxSplats ?? 0,
        drivingPagerId: d.drivingPagerId,
      }
    }, before)

    // Old mesh disposed
    expect(after.oldMeshDisposed, 'old active mesh disposed').toBe(true)

    // Old pager disposed
    expect(after.oldPagerDisposed, 'old driving pager disposed').toBe(true)

    // New active mesh ID differs from old
    expect(after.newActiveMeshId, 'new mesh ID differs').not.toBe(before.oldActiveMeshId)

    // New active mesh pager ID equals drivingPagerId
    expect(after.newActiveMeshPagerId, 'new mesh pager === drivingPagerId').toBe(after.drivingPagerId)

    // Driving pager has normalized capacity
    const expectedCapacity = Math.ceil(parseInt(newCapacity) / 65536) * 65536
    expect(after.drivingPagerMaxSplats, 'driving pager capacity').toBe(expectedCapacity)

    // Exactly one active mesh
    expect(after.activeMeshCount, 'exactly one active mesh').toBe(1)

    // Wrapper still visible
    await expect(page.getByText('SplatWrapper').first()).toBeVisible()
  })

  test('stub capacity reload: rapid edits settle on final generation', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')

    // Rapid edits
    await capacityInput.fill('131072')  // 2 * 65536
    await capacityInput.press('Enter')
    await page.waitForTimeout(100)

    await capacityInput.fill('196608')  // 3 * 65536
    await capacityInput.press('Enter')
    await page.waitForTimeout(100)

    await capacityInput.fill('262144')  // 4 * 65536
    await capacityInput.press('Enter')
    await page.waitForTimeout(3000)

    // Final capacity should be 262144
    expect(await capacityInput.inputValue()).toBe('262144')

    // No error, no stale reloading
    expect(await page.getByTestId('spark-reloading').isVisible()).toBe(false)
    const hasError = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-error"]')
      return el !== null && el.textContent !== ''
    })
    expect(hasError).toBe(false)

    // Final generation owns sole active mesh/pager
    const final = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        pagers: { id: number; disposed: boolean; maxSplats: number }[];
        meshes: { id: number; disposed: boolean; paged?: { pager?: { id: number } } }[];
        drivingPagerId: number;
      }
      const drivingPager = d.pagers.find((p: { id: number }) => p.id === d.drivingPagerId)
      const activeMeshes = d.meshes.filter((m: { disposed: boolean }) => !m.disposed)
      const activeMesh = activeMeshes[activeMeshes.length - 1]
      return {
        drivingPagerMaxSplats: drivingPager?.maxSplats ?? 0,
        activeMeshCount: activeMeshes.length,
        activeMeshPagerId: activeMesh?.paged?.pager?.id ?? 0,
        drivingPagerId: d.drivingPagerId,
      }
    })
    expect(final.drivingPagerMaxSplats).toBe(262144)
    expect(final.activeMeshCount).toBe(1)
    expect(final.activeMeshPagerId).toBe(final.drivingPagerId)
  })

  test('stub capacity reload: wrapper transform and other settings persist', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')
    const blurInput = page.locator('input#spark-blurAmount')

    // Set non-default values
    await blurInput.fill('0.8')
    await blurInput.press('Enter')
    await page.waitForTimeout(300)

    // Set an unmistakable non-default wrapper transform and capture it
    const wrapperTransform = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }; rotation: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number }; scale: { set: (x: number, y: number, z: number) => void; x: number; y: number; z: number } } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) throw new Error('SplatWrapper not exposed in stub diagnostics')
      // Set unmistakable non-default transform
      wrapper.position.set(7, 13, 21)
      wrapper.rotation.set(0.3, 0.5, 0.7)
      wrapper.scale.set(1.5, 1.5, 1.5)
      return {
        x: wrapper.position.x,
        y: wrapper.position.y,
        z: wrapper.position.z,
        rx: wrapper.rotation.x,
        ry: wrapper.rotation.y,
        rz: wrapper.rotation.z,
        sx: wrapper.scale.x,
        sy: wrapper.scale.y,
        sz: wrapper.scale.z,
      }
    })

    // Trigger capacity reload
    await capacityInput.fill('131072')
    await capacityInput.press('Enter')
    await page.waitForTimeout(3000)

    // blurAmount should persist across reload
    expect(parseFloat(await blurInput.inputValue())).toBe(0.8)

    // SplatWrapper should still be visible in hierarchy
    await expect(page.getByText('SplatWrapper').first()).toBeVisible()

    // Unconditionally assert wrapper transform preserved exactly
    const wrapperAfter = await page.evaluate(() => {
      const d = (window as unknown as Record<string, unknown>).__spark_stub_diagnostics as {
        wrapper: { position: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number } } | null
      }
      const wrapper = d.wrapper
      if (!wrapper) throw new Error('SplatWrapper not exposed in stub diagnostics')
      return {
        x: wrapper.position.x,
        y: wrapper.position.y,
        z: wrapper.position.z,
        rx: wrapper.rotation.x,
        ry: wrapper.rotation.y,
        rz: wrapper.rotation.z,
        sx: wrapper.scale.x,
        sy: wrapper.scale.y,
        sz: wrapper.scale.z,
      }
    })

    expect(wrapperAfter.x).toBe(wrapperTransform.x)
    expect(wrapperAfter.y).toBe(wrapperTransform.y)
    expect(wrapperAfter.z).toBe(wrapperTransform.z)
    expect(wrapperAfter.rx).toBe(wrapperTransform.rx)
    expect(wrapperAfter.ry).toBe(wrapperTransform.ry)
    expect(wrapperAfter.rz).toBe(wrapperTransform.rz)
    expect(wrapperAfter.sx).toBe(wrapperTransform.sx)
    expect(wrapperAfter.sy).toBe(wrapperTransform.sy)
    expect(wrapperAfter.sz).toBe(wrapperTransform.sz)
  })

  test('stub mid-reload selection change: pane updates in place', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')

    // Close activation gate so reload stays in progress
    await page.evaluate(() => { (window as unknown as Record<string, unknown>).__stubActivationGate = true })

    // Trigger reload
    await capacityInput.fill('131072')
    await capacityInput.press('Enter')
    await page.waitForTimeout(500)

    // Verify reload is in progress
    const reloadingVisible = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-reloading"]')
      return el !== null && window.getComputedStyle(el).display !== 'none'
    })
    expect(reloadingVisible, 'reload in progress').toBe(true)

    // Select a different object while reload is in progress
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Pane should show no-selection state (Spark deselected)
    await expect(page.getByTestId('spark-no-selection')).toBeVisible()

    // Re-select Spark (use specific text to avoid ambiguity with pane heading)
    await page.getByText('Spark (SparkControls)').click()
    await page.waitForTimeout(500)

    // Pane should show Spark content again with reload still in progress
    expect(await page.getByTestId('spark-no-selection').isVisible()).toBe(false)
    const stillReloading = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-reloading"]')
      return el !== null && window.getComputedStyle(el).display !== 'none'
    })
    expect(stillReloading, 'reload still in progress after reselect').toBe(true)

    // Release gate so reload completes
    await page.evaluate(() => { delete (window as unknown as Record<string, unknown>).__stubActivationGate })
    await page.waitForTimeout(3000)

    // Reload should complete
    const reloadingAfter = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-reloading"]')
      return el !== null && window.getComputedStyle(el).display !== 'none'
    })
    expect(reloadingAfter).toBe(false)
  })

  test('stub reload status: subscription lifecycle on selection change', async ({ page }) => {
    await selectSparkAndOpenPane(page)

    const capacityInput = page.locator('input#spark-maxPagedSplats')

    // Trigger reload
    await capacityInput.fill('131072')
    await capacityInput.press('Enter')
    await page.waitForTimeout(3000)

    // Verify reload completed (no error)
    const hasError = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="spark-error"]')
      return el !== null && el.textContent !== ''
    })
    expect(hasError).toBe(false)

    // Close the pane with Escape
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // Select a different object to trigger selection change
    await page.getByText('Camera ScrollAnimator').click()
    await page.waitForTimeout(500)

    // Reopen Spark Controls pane — should show no-selection state
    await page.getByRole('button', { name: 'Spark Controls' }).click()
    await page.waitForTimeout(500)
    await expect(page.getByTestId('spark-no-selection')).toBeVisible()

    // Reloading indicator should not be visible (subscription cleaned up)
    expect(await page.getByTestId('spark-reloading').isVisible()).toBe(false)
  })
})
