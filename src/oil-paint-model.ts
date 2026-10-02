export * from "./oil-paint-model-core.js"

export interface Bristle {
  x: number
  y: number
  readonly rootLateral: number
  readonly rootAlong: number
  readonly threshold: number
  readonly radius: number
  load: number
  cure: number
  readonly k: Float64Array
  readonly s: Float64Array
  readonly drying: number
}
