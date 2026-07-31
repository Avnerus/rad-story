declare module 'stats.js' {
  export interface StatsPanel {
    dom: HTMLCanvasElement
    update(value: number, maxValue: number): void
  }

  export interface StatsInstance {
    REVISION: number
    dom: HTMLDivElement
    domElement: HTMLDivElement
    addPanel(panel: StatsPanel): StatsPanel
    showPanel(id: number): void
    begin(): void
    end(): number
    update(): void
    setMode(id: number): void
  }

  // stats.js exports `Stats` as a class whose constructor returns a plain
  // object (not `this`). We declare it as a callable value returning
  // StatsInstance so TypeScript infers the correct type from `new Stats()`.
  const Stats: new () => StatsInstance

  export default Stats
}
