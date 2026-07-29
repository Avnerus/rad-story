/**
 * SparkControls — a Three.js Object3D subclass that holds all editable
 * Spark 2.1 rendering-quality, LOD, foveation, and paging-budget settings.
 *
 * Appears in the Studio outline as a selectable object named "Spark".
 * Only the `settings` property is source-synced; transform changes are blocked
 * by the transaction guard.
 *
 * All numeric values are validated against field-specific bounds derived from
 * the installed Spark 2.1 semantics. NaN, Infinity, and out-of-range values
 * are clamped or rejected.
 */
import { Object3D } from 'three'

// Spark page size constant
export const SPARK_PAGE_SIZE = 65_536

// ---------------------------------------------------------------------------
// Settings type
// ---------------------------------------------------------------------------

/**
 * All editable Spark renderer settings exposed through the SparkControls.
 * Every field is validated and clamped before being stored.
 */
export interface SparkSettings {
  // — LOD / quality —
  lodSplatScale: number
  lodRenderScale: number
  maxStdDev: number
  maxPagedSplats: number

  // — Foveation (full-width angles in degrees) —
  coneFov0: number
  coneFov: number
  coneFoveate: number
  behindFoveate: number

  // — Additional quality / LOD controls —
  minPixelRadius: number
  maxPixelRadius: number
  minAlpha: number
  preBlurAmount: number
  blurAmount: number
  falloff: number
  clipXY: number
  focalAdjustment: number
  sortRadial: boolean
  minSortIntervalMs: number
  enableLod: boolean
  enableLodFetching: boolean
  lodSplatCount: number | null // null = automatic / platform default
  lodInflate: boolean
}

// ---------------------------------------------------------------------------
// Field definitions with validation
// ---------------------------------------------------------------------------

interface FieldDef {
  min?: number
  max?: number
  integer?: boolean
  multipleOf?: number
  allowNull?: boolean
  default: number | boolean | null
}

const FIELD_DEFS: Record<keyof SparkSettings, FieldDef> = {
  lodSplatScale:       { min: 0.01, max: 10,   default: 1 },
  lodRenderScale:      { min: 0.1,  max: 10,   default: 1 },
  maxStdDev:           { min: 1,    max: 100,  default: 8 },
  maxPagedSplats:      { min: SPARK_PAGE_SIZE, max: 256 * SPARK_PAGE_SIZE, multipleOf: SPARK_PAGE_SIZE, default: 16 * SPARK_PAGE_SIZE },
  coneFov0:            { min: 0,    max: 180,  default: 90 },
  coneFov:             { min: 0,    max: 180,  default: 120 },
  coneFoveate:         { min: 0,    max: 1,    default: 0.4 },
  behindFoveate:       { min: 0,    max: 1,    default: 0.2 },
  minPixelRadius:      { min: 0,    max: 256,  default: 0 },
  maxPixelRadius:      { min: 1,    max: 4096, default: 512 },
  minAlpha:            { min: 0,    max: 1,    default: 0.5 * (1 / 255) },
  preBlurAmount:       { min: 0,    max: 5,    default: 0 },
  blurAmount:          { min: 0,    max: 5,    default: 0 },
  falloff:             { min: 0,    max: 1,    default: 1 },
  clipXY:              { min: 0.5,  max: 5,    default: 1.4 },
  focalAdjustment:     { min: 0.1,  max: 5,    default: 1 },
  sortRadial:          { default: true },
  minSortIntervalMs:   { min: 0,    max: 10000, integer: true, default: 0 },
  enableLod:           { default: true },
  enableLodFetching:   { default: true },
  lodSplatCount:       { min: 10_000, max: 50_000_000, integer: true, allowNull: true, default: null },
  lodInflate:          { default: false },
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate and clamp a single numeric field.
 */
function validateNumber(value: unknown, def: FieldDef): number | null {
  if (def.allowNull && value === null) return null
  if (def.allowNull && value === undefined) return def.default as number | null

  let n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) n = def.default as number

  // Clamp to bounds
  if (def.min !== undefined) n = Math.max(def.min, n)
  if (def.max !== undefined) n = Math.min(def.max, n)

  // Integer rounding
  if (def.integer) n = Math.round(n)

  // Multiple-of rounding (round up to nearest multiple)
  if (def.multipleOf) {
    n = Math.ceil(n / def.multipleOf) * def.multipleOf
  }

  return n as number
}

/**
 * Validate a boolean field.
 */
function validateBoolean(value: unknown): boolean {
  return Boolean(value)
}

// ---------------------------------------------------------------------------
// SparkControls class
// ---------------------------------------------------------------------------

export type SettingsChangeHandler = (changed: Set<keyof SparkSettings>) => void

/**
 * Branded Object3D that holds editable Spark settings.
 *
 * The `settings` property is a plain object that Studio serializes for source
 * sync. Transform attributes (position, rotation, scale) are blocked by the
 * transaction guard so they never persist.
 */
export class SparkControls extends Object3D {
  /** HMR-safe brand for runtime detection. */
  declare isSparkControls: boolean
  declare type: string

  private _settings: SparkSettings
  private _listeners: SettingsChangeHandler[] = []

  constructor(initial?: Partial<SparkSettings>) {
    super()
    this.isSparkControls = true
    this.type = 'SparkControls'
    this.name = 'Spark'

    // Start with defaults, then overlay any provided values
    const defaults = this.createDefaultSettings()
    if (initial) {
      for (const [key, val] of Object.entries(initial)) {
        if (val !== undefined) {
          ;(defaults as unknown as Record<string, unknown>)[key] = val
        }
      }
    }
    this._settings = defaults
  }

  /**
   * Create a settings object with all field defaults.
   */
  createDefaultSettings(): SparkSettings {
    const s = {} as SparkSettings
    for (const [key, def] of Object.entries(FIELD_DEFS)) {
      ;(s as unknown as Record<string, unknown>)[key] = def.default
    }
    return s
  }

  /**
   * Get the current validated settings (deep copy).
   */
  get settings(): SparkSettings {
    return { ...this._settings }
  }

  /**
   * Set settings from a plain object. All values are validated and clamped.
   * Emits change notifications for any fields that actually changed.
   */
  set settings(value: Partial<SparkSettings>) {
    const previous = { ...this._settings }
    const validated: Record<string, unknown> = {}

    for (const [key, def] of Object.entries(FIELD_DEFS)) {
      const k = key as keyof SparkSettings
      const raw = value[k]
      if (raw === undefined) continue

      if (typeof def.default === 'boolean') {
        validated[k] = validateBoolean(raw)
      } else {
        validated[k] = validateNumber(raw, def)
      }
    }

    // Enforce cone angle invariant: coneFov0 <= coneFov
    if (validated.coneFov0 !== undefined && validated.coneFov !== undefined) {
      if ((validated.coneFov0 as number) > (validated.coneFov as number)) {
        validated.coneFov = validated.coneFov0
      }
    }

    // Merge validated into current
    const merged = { ...this._settings, ...validated } as SparkSettings
    this._settings = merged

    // Determine which fields actually changed
    const changed = new Set<keyof SparkSettings>()
    for (const [key] of Object.entries(FIELD_DEFS)) {
      const k = key as keyof SparkSettings
      if (previous[k] !== merged[k]) {
        changed.add(k)
      }
    }

    // Notify listeners
    if (changed.size > 0) {
      for (const fn of this._listeners) {
        fn(changed)
      }
    }
  }

  /**
   * Subscribe to settings changes. Returns an unsubscribe function.
   */
  onChange(fn: SettingsChangeHandler): () => void {
    this._listeners.push(fn)
    return () => {
      const idx = this._listeners.indexOf(fn)
      if (idx >= 0) this._listeners.splice(idx, 1)
    }
  }

  /**
   * Dispose: clear all listeners.
   */
  dispose(): void {
    this._listeners.length = 0
  }
}
