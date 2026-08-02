import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SPARK_PAGE_SIZE } from '$lib/spark/SparkControls'

describe('getDeviceProfile', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
    vi.unstubAllGlobals()
  })

  it('returns mobile profile name when UA indicates mobile', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
      writable: true,
    })

    const { getDeviceProfile } = await import('$lib/spark/deviceProfile')
    const profile = getDeviceProfile()

    expect(profile.profileName).toBe('mobile')
    expect(profile.dpr).toBe(1)
    // No sparkRenderer — settings come from getGlobalBaseline()
    expect(profile).not.toHaveProperty('sparkRenderer')
  })

  it('returns desktop profile name when UA is desktop', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      writable: true,
    })

    vi.stubGlobal('devicePixelRatio', 2)

    const { getDeviceProfile } = await import('$lib/spark/deviceProfile')
    const profile = getDeviceProfile()

    expect(profile.profileName).toBe('desktop')
    expect(profile.dpr).toBeLessThanOrEqual(2)
    // No sparkRenderer — settings come from getGlobalBaseline()
    expect(profile).not.toHaveProperty('sparkRenderer')
  })

  it('clamps DPR to 2 on desktop', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      writable: true,
    })

    vi.stubGlobal('devicePixelRatio', 4)

    const { getDeviceProfile } = await import('$lib/spark/deviceProfile')
    const profile = getDeviceProfile()

    expect(profile.dpr).toBe(2)
  })

  it('mobile baseline has stronger foveation than desktop baseline', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows)' },
      writable: true,
    })
    vi.stubGlobal('devicePixelRatio', 2)

    const { getGlobalBaseline } = await import('$lib/spark/deviceProfile')
    const mobileBaseline = getGlobalBaseline('mobile')
    const desktopBaseline = getGlobalBaseline('desktop')

    expect(mobileBaseline.coneFoveate).toBeGreaterThan(desktopBaseline.coneFoveate)
    expect(mobileBaseline.behindFoveate).toBeGreaterThan(desktopBaseline.behindFoveate)
  })
})

describe('getGlobalBaseline', () => {
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
    })
    vi.unstubAllGlobals()
  })

  it('desktop baseline has correct pager capacity', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows)' },
      writable: true,
    })
    vi.stubGlobal('devicePixelRatio', 2)
    const { getGlobalBaseline } = await import('$lib/spark/deviceProfile')
    const baseline = getGlobalBaseline('desktop')
    expect(baseline.maxPagedSplats).toBe(32 * SPARK_PAGE_SIZE)
    expect(baseline.maxStdDev).toBe(2.8)
  })

  it('mobile baseline has correct pager capacity', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows)' },
      writable: true,
    })
    vi.stubGlobal('devicePixelRatio', 2)
    const { getGlobalBaseline } = await import('$lib/spark/deviceProfile')
    const baseline = getGlobalBaseline('mobile')
    expect(baseline.maxPagedSplats).toBe(16 * SPARK_PAGE_SIZE)
    expect(baseline.maxStdDev).toBe(2.8)
  })
})
