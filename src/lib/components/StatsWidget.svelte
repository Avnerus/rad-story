<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import Stats, { type StatsInstance } from 'stats.js'

  let frameId: number | null = null
  let statsInstance: StatsInstance | null = null

  onMount(() => {
    const instance = new Stats()
    instance.showPanel(0) // FPS panel

    // Override default inline styles so the widget is positioned by our CSS class
    // rather than stats.js's hard-coded inline styles
    instance.dom.classList.add('stats-widget')
    instance.dom.setAttribute('data-testid', 'stats-widget')

    document.body.appendChild(instance.dom)
    statsInstance = instance

    const tick = () => {
      statsInstance!.begin()
      frameId = requestAnimationFrame(tick)
      statsInstance!.end()
    }
    frameId = requestAnimationFrame(tick)
  })

  onDestroy(() => {
    if (frameId !== null) {
      cancelAnimationFrame(frameId)
      frameId = null
    }
    if (statsInstance) {
      statsInstance.dom.remove()
      statsInstance = null
    }
  })
</script>

<!-- StatsWidget manages its own DOM node (appended to document.body) -->
