import { slopcameraApi as coreSlopcameraApi } from "./index-core.js"
import { inspectSlopcameraOilPaintKmMix, replaySlopcameraOilPaint, serializeSlopcameraOilPaintReplay, simulateSlopcameraOilPaint } from "./oil-paint.js"

export * from "./index-core.js"
export * from "./oil-paint.js"

export const slopcameraApi = Object.freeze({
  ...coreSlopcameraApi,
  inspectSlopcameraOilPaintKmMix,
  replaySlopcameraOilPaint,
  serializeSlopcameraOilPaintReplay,
  simulateSlopcameraOilPaint,
})
/** @deprecated Use slopcameraApi. */
export const diagramApi = slopcameraApi
