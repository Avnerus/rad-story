import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

  it('returns mobile profile when UA indicates mobile', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
      writable: true,
    })

    const { getDeviceProfile } = await import('$lib/spark/deviceProfile')
    const profile = getDeviceProfile()

    expect(profile.isMobile).toBe(true)
    expect(profile.dpr).toBe(1)
    expect(profile.sparkRenderer.maxPagedSplats).toBe(16 * 65_536) // 1_048_576 = 16 * SPARK_PAGE_SIZE (mobile baseline)
    expect(profile.sparkRenderer.lodSplatScale).toBe(0.5)
    // Cone angles are in degrees (Spark 2.1 API)
    expect(profile.sparkRenderer.coneFov0).toBe(70)
    expect(profile.sparkRenderer.coneFov).toBe(110)
  })

  it('returns desktop profile when UA is desktop', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      writable: true,
    })

    vi.stubGlobal('devicePixelRatio', 2)

    const { getDeviceProfile } = await import('$lib/spark/deviceProfile')
    const profile = getDeviceProfile()

    expect(profile.isMobile).toBe(false)
    expect(profile.dpr).toBeLessThanOrEqual(2)
    expect(profile.sparkRenderer.maxPagedSplats).toBe(32 * 65_536) // 2_097_152 = 32 * SPARK_PAGE_SIZE (desktop baseline)
    expect(profile.sparkRenderer.lodSplatScale).toBe(1)
    // Cone angles are in degrees (Spark 2.1 API), matching Spark defaults
    expect(profile.sparkRenderer.coneFov0).toBe(90)
    expect(profile.sparkRenderer.coneFov).toBe(120)
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

  it('mobile profile has stronger foveation than desktop', async () => {
    // Mobile
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Linux; Android 13)' },
      writable: true,
    })

    const { getDeviceProfile: getProfileMobile } = await import('$lib/spark/deviceProfile')
    const mobileProfile = getProfileMobile()

    vi.resetModules()

    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      writable: true,
    })
    vi.stubGlobal('devicePixelRatio', 1)

    const { getDeviceProfile: getProfileDesktop } = await import('$lib/spark/deviceProfile')
    const desktopProfile = getProfileDesktop()

    expect(mobileProfile.sparkRenderer.coneFoveate).toBeGreaterThan(
      desktopProfile.sparkRenderer.coneFoveate as number,
    )
  })
})
