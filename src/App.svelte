<script lang="ts">
  import { Canvas } from '@threlte/core'
  import { Studio } from '@threlte/studio'
  import { onMount } from 'svelte'
  import { WebGLRenderer } from 'three'
  import { validateRadUrl } from '$lib/spark/radUrl'
  import { getDeviceProfile } from '$lib/spark/deviceProfile'
  import ScrollAnimatorExtension from '$lib/studio/scroll-animator/ScrollAnimatorExtension.svelte'
  import SparkControlsExtension from '$lib/studio/spark-controls/SparkControlsExtension.svelte'
  import type { DeviceProfile } from '$lib/types'
  import { parseRoute, navigateToLanding, type RouteMatch } from '$lib/router'
  import RadStoryScene from '$lib/components/RadStoryScene.svelte'
  import StatsWidget from '$lib/components/StatsWidget.svelte'
  import type { ComponentType } from 'svelte'

  const SAMPLE_URL = 'https://storage.googleapis.com/forge-dev-public/asundqui/rad/260217/cozy-spaceship_2-lod.rad'

  let appState: 'landing' | 'viewer' | 'scene' | 'not-found' = $state('landing')
  let urlInput = $state(SAMPLE_URL)
  let activeUrl = $state('')
  let errorMsg = $state('')
  let loading = $state(false)
  // profile is immutable after startup — $state.raw avoids unnecessary
  // reactivity and eliminates state_referenced_locally warnings in children
  let profile: DeviceProfile = $state.raw(getDeviceProfile())

  // Scene route state
  let sceneMatch = $state<RouteMatch | null>(null)
  let SceneComponent = $state<ComponentType | null>(null)
  let sceneMode = $state<'view' | 'edit' | null>(null)
  let attemptedSceneName = $state('')

  // Debug flag derived from query string
  let debugMode = $state(false)

  // Check for URL in query string on mount
  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    const urlParam = params.get('url')
    if (urlParam) {
      const result = validateRadUrl(urlParam)
      if (result.ok) {
        urlInput = result.url
      }
    }

    // Parse initial route
    handleRouteChange()

    // Listen for navigation events
    window.addEventListener('popstate', handleRouteChange)
  })

  function handleRouteChange(): void {
    const match = parseRoute()
    sceneMatch = match

    // Recompute debug flag from current query string
    const params = new URLSearchParams(window.location.search)
    debugMode = params.get('debug') === 'true'

    switch (match.kind) {
      case 'scene':
        SceneComponent = match.scene.component
        sceneMode = match.mode
        appState = 'scene'
        loading = true
        break
      case 'not-found':
        attemptedSceneName = match.attemptedName
        appState = 'not-found'
        break
      case 'landing':
        SceneComponent = null
        // Navigate to landing from scene/not-found
        if (appState === 'scene' || appState === 'not-found') {
          appState = 'landing'
        }
        break
    }
  }

  function handleSubmit(e: Event) {
    e.preventDefault()
    handleStart()
  }

  function handleStart() {
    const result = validateRadUrl(urlInput)
    if (!result.ok) {
      errorMsg = result.error
      return
    }

    errorMsg = ''
    activeUrl = result.url
    loading = true
    appState = 'viewer'

    // Update URL in address bar for reloadability
    const url = new URL(window.location.href)
    url.searchParams.set('url', activeUrl)
    window.history.replaceState({}, '', url.toString())
  }

  function handleBack() {
    appState = 'landing'
    loading = false
    activeUrl = ''
  }

  function handleReady() {
    loading = false
  }

  function handleSceneReady() {
    loading = false
  }

  function handleGoHome() {
    navigateToLanding()
  }
</script>

{#if appState === 'landing'}
  <div class="landing">
    <h1>RAD Story</h1>
    <p>
      Design scroll-based stories over RAD scans.
      Paste a <code>.rad</code> URL below and click Start.
    </p>

    <form class="url-form" onsubmit={handleSubmit}>
      <input
        type="text"
        class="url-input"
        placeholder="https://example.com/model-lod.rad"
        bind:value={urlInput}
        aria-label="RAD file URL"
      />
      <button type="submit" class="start-btn">Start</button>
      {#if errorMsg}
        <span class="error-msg" role="alert">{errorMsg}</span>
      {/if}
    </form>
  </div>
{:else if appState === 'not-found'}
  <div class="landing">
    <h1>Scene not found</h1>
    <p>
      No scene named "<code>{attemptedSceneName}</code>" exists.
    </p>
    <button class="start-btn" onclick={handleGoHome}>Go home</button>
  </div>
{:else if appState === 'scene' && SceneComponent}
  <!-- Scene route: render the scene component inside Canvas. Studio only in edit mode. -->
  {#if debugMode}
    <StatsWidget />
  {/if}
  {#if sceneMode === 'view'}
    <div class="viewer-header">
      <button class="back-btn" onclick={handleGoHome} aria-label="Go back">← Home</button>
      <span class="url-label">Scene: {sceneMatch?.kind === 'scene' ? sceneMatch.scene.name : ''}</span>
    </div>
  {/if}

  <div class="viewer-stage">
    <Canvas
      renderMode="always"
      dpr={profile.dpr}
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: false,
          alpha: false,
          powerPreference: 'default',
        })
      }
    >
      {#if sceneMode === 'edit'}
        <Studio extensions={[ScrollAnimatorExtension, SparkControlsExtension]}>
          <SceneComponent {profile} onReady={handleSceneReady} />
        </Studio>
      {:else}
        <SceneComponent {profile} onReady={handleSceneReady} />
      {/if}
    </Canvas>

    {#if loading}
      <div class="loading-overlay">
        <div class="spinner"></div>
        <span>Loading splats…</span>
      </div>
    {/if}
  </div>

  <div class="scroll-spacer"></div>
{:else}
  <!-- Ad-hoc URL viewer (existing landing form workflow) -->
  <div class="viewer-header">
    <button class="back-btn" onclick={handleBack} aria-label="Go back">← Back</button>
    <span class="url-label" title={activeUrl}>{activeUrl}</span>
  </div>

  <div class="viewer-stage">
    <Canvas
      renderMode="always"
      dpr={profile.dpr}
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          antialias: false,
          alpha: false,
          powerPreference: 'default',
        })
      }
    >
      <Studio extensions={[ScrollAnimatorExtension, SparkControlsExtension]}>
        <RadStoryScene
          url={activeUrl}
          {profile}
          onReady={handleReady}
        />
      </Studio>
    </Canvas>

    {#if loading}
      <div class="loading-overlay">
        <div class="spinner"></div>
        <span>Loading splats…</span>
      </div>
    {/if}
  </div>

  <div class="scroll-spacer"></div>
{/if}
