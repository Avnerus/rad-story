/** Named device profile identifier */
export type DeviceProfileName = 'desktop' | 'mobile'

/** Result type for RAD URL validation */
export type ValidationResult = SuccessResult | ErrorResult

export interface SuccessResult {
  ok: true
  url: string
}

export interface ErrorResult {
  ok: false
  error: string
}

/** Device profile: detection and Canvas DPR only. */
export interface DeviceProfile {
  /** Named profile identifier — the single source of truth for profile detection. */
  profileName: DeviceProfileName
  dpr: number
}
