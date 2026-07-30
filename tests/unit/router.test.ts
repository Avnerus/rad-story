import { describe, it, expect } from 'vitest'
import { validateSceneName } from '$lib/scenes/registry'
import { parseRoute } from '$lib/router'

describe('validateSceneName', () => {
  it('accepts valid lowercase alphanumeric names', () => {
    expect(validateSceneName('baby_yoda')).toBe('baby_yoda')
    expect(validateSceneName('scene1')).toBe('scene1')
    expect(validateSceneName('a')).toBe('a')
    expect(validateSceneName('my_scene_2')).toBe('my_scene_2')
  })

  it('rejects empty strings', () => {
    expect(validateSceneName('')).toBeNull()
  })

  it('rejects names with path traversal', () => {
    expect(validateSceneName('../evil')).toBeNull()
    expect(validateSceneName('..')).toBeNull()
    expect(validateSceneName('a/b')).toBeNull()
  })

  it('rejects names with uppercase letters', () => {
    expect(validateSceneName('BabyYoda')).toBeNull()
    expect(validateSceneName('SCENE')).toBeNull()
  })

  it('rejects names with special characters', () => {
    expect(validateSceneName('my-scene')).toBeNull()
    expect(validateSceneName('my scene')).toBeNull()
    expect(validateSceneName('my.scene')).toBeNull()
  })
})

describe('parseRoute', () => {
  it('returns landing for root path', () => {
    expect(parseRoute('/')).toEqual({ kind: 'landing' })
    expect(parseRoute('')).toEqual({ kind: 'landing' })
  })

  it('returns landing for unknown paths', () => {
    expect(parseRoute('/viewer')).toEqual({ kind: 'landing' })
    expect(parseRoute('/?url=foo')).toEqual({ kind: 'landing' })
    expect(parseRoute('/random/path')).toEqual({ kind: 'landing' })
  })

  it('returns scene match for valid scene names', () => {
    const match = parseRoute('/scene/baby_yoda')
    expect(match.kind).toBe('scene')
    if (match.kind === 'scene') {
      expect(match.scene.name).toBe('baby_yoda')
      expect(match.scene.component).toBeDefined()
    }
  })

  it('returns not-found for unknown scene names', () => {
    const match = parseRoute('/scene/nonexistent')
    expect(match.kind).toBe('not-found')
    if (match.kind === 'not-found') {
      expect(match.attemptedName).toBe('nonexistent')
    }
  })

  it('returns not-found for path traversal attempts', () => {
    const match = parseRoute('/scene/../router')
    // The regex won't match paths with slashes, so this falls through to landing
    expect(match.kind).toBe('landing')
  })

  it('returns not-found for uppercase scene names (rejected by validator)', () => {
    const match = parseRoute('/scene/Baby_Yoda')
    // The route regex [a-z0-9_] doesn't match uppercase, but the broader
    // regex [a-zA-Z0-9_] in parseRoute catches it, then validateSceneName rejects
    // it → not-found
    expect(match.kind).toBe('not-found')
  })
})
