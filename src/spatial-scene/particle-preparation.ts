import { z } from "zod"

import { createSha256HexHasher } from "../code/sha256.js"
import { SpatialAssetIdSchema, SpatialTimeUsSchema } from "./contracts.js"
import { parseSpatialValue } from "./identity.js"
import { parseSpatialParticleSystem, spatialParticleSystemSha256, type SpatialParticleSystem } from "./particle.js"

export const SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES = 64
export const SPATIAL_PARTICLE_PREPARATION_LIMITS = Object.freeze({ surfaceSets: 64, trianglesPerSurface: 100_000 })

const coordinate = z.number().finite().min(-1_000_000).max(1_000_000)
const vec3 = z.tuple([coordinate, coordinate, coordinate])
const surfaceSchema = z.strictObject({
  assetId: SpatialAssetIdSchema,
  triangles: z.array(z.tuple([vec3, vec3, vec3])).min(1).max(SPATIAL_PARTICLE_PREPARATION_LIMITS.trianglesPerSurface),
})
const inputSchema = z.strictObject({
  sampleTimeUs: SpatialTimeUsSchema,
  surfaces: z.array(surfaceSchema).max(SPATIAL_PARTICLE_PREPARATION_LIMITS.surfaceSets).default([]),
  system: z.unknown(),
})

export interface SpatialPreparedParticleInstances {
  readonly bytes: Uint8Array
  readonly byteLength: number
  readonly instanceCount: number
  readonly sha256: string
  readonly strideBytes: typeof SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES
  readonly systemSha256: string
  readonly sampleTimeUs: number
}

type Vec3 = readonly [number, number, number]
type Random = () => number

function randomGenerator(seed: number): Random {
  let state = seed >>> 0 || 0x6d2b79f5
  return () => {
    state = Math.imul(state ^ state >>> 15, state | 1)
    state ^= state + Math.imul(state ^ state >>> 7, state | 61)
    return ((state ^ state >>> 14) >>> 0) / 4_294_967_296
  }
}

function particleSeed(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0
  value = Math.imul(value ^ value >>> 16, 0x85ebca6b)
  value = Math.imul(value ^ value >>> 13, 0xc2b2ae35)
  return (value ^ value >>> 16) >>> 0
}

function interpolate(keys: readonly { readonly t: number; readonly value: number }[], t: number): number {
  const upper = keys.findIndex(key => key.t >= t)
  if (upper <= 0) return keys[0]!.value
  const left = keys[upper - 1]!, right = keys[upper]!
  const amount = (t - left.t) / (right.t - left.t)
  return left.value + (right.value - left.value) * amount
}

function interpolateColor(keys: readonly { readonly t: number; readonly color: readonly [number, number, number, number] }[], t: number): readonly [number, number, number, number] {
  const upper = keys.findIndex(key => key.t >= t)
  if (upper <= 0) return keys[0]!.color
  const left = keys[upper - 1]!, right = keys[upper]!
  const amount = (t - left.t) / (right.t - left.t)
  return [0, 1, 2, 3].map(index => left.color[index]! + (right.color[index]! - left.color[index]!) * amount) as [number, number, number, number]
}

function normalize(value: Vec3): Vec3 {
  const length = Math.hypot(...value)
  return length === 0 ? [0, 0, 0] : [value[0] / length, value[1] / length, value[2] / length]
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]
}

function addScaled(target: [number, number, number], value: Vec3, scale = 1): void {
  target[0] += value[0] * scale
  target[1] += value[1] * scale
  target[2] += value[2] * scale
}

function sampleSphere(random: Random, radius: number, volume: boolean): Vec3 {
  const z = random() * 2 - 1
  const angle = random() * Math.PI * 2
  const radial = radius * (volume ? Math.cbrt(random()) : 1)
  const planar = Math.sqrt(1 - z * z)
  return [radial * planar * Math.cos(angle), radial * z, radial * planar * Math.sin(angle)]
}

function trianglePoint(triangle: readonly [Vec3, Vec3, Vec3], random: Random): Vec3 {
  const first = Math.sqrt(random()), second = random()
  const a = 1 - first, b = first * (1 - second), c = first * second
  return [triangle[0][0] * a + triangle[1][0] * b + triangle[2][0] * c, triangle[0][1] * a + triangle[1][1] * b + triangle[2][1] * c, triangle[0][2] * a + triangle[1][2] * b + triangle[2][2] * c]
}

function shapePosition(shape: SpatialParticleSystem["emitters"][number]["shape"], random: Random, surfaces: ReadonlyMap<string, readonly (readonly [Vec3, Vec3, Vec3])[]>): Vec3 {
  if (shape.kind === "point") return [0, 0, 0]
  if (shape.kind === "sphere") return sampleSphere(random, shape.radius, shape.volume)
  if (shape.kind === "box") {
    const point: Vec3 = [(random() - 0.5) * shape.size[0], (random() - 0.5) * shape.size[1], (random() - 0.5) * shape.size[2]]
    if (shape.volume) return point
    const axis = Math.floor(random() * 3), sign = random() < 0.5 ? -0.5 : 0.5
    return point.map((value, index) => index === axis ? shape.size[index]! * sign : value) as [number, number, number]
  }
  if (shape.kind === "disc") {
    const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * shape.radius
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius]
  }
  if (shape.kind === "spline") {
    const scaled = random() * (shape.controlPoints.length - 1), index = Math.min(shape.controlPoints.length - 2, Math.floor(scaled)), amount = scaled - index
    const left = shape.controlPoints[index]!, right = shape.controlPoints[index + 1]!
    return [left[0] + (right[0] - left[0]) * amount, left[1] + (right[1] - left[1]) * amount, left[2] + (right[2] - left[2]) * amount]
  }
  const triangles = surfaces.get(shape.assetId)
  if (triangles === undefined) throw new RangeError(`Particle surface ${shape.assetId} has no prepared triangle set.`)
  return trianglePoint(triangles[Math.floor(random() * triangles.length)]!, random)
}

function inside(position: Vec3, volume: SpatialParticleSystem["killVolumes"][number]): boolean {
  if (volume.kind === "box") return position.every((value, index) => value >= volume.min[index]! && value <= volume.max[index]!)
  return Math.hypot(position[0] - volume.center[0], position[1] - volume.center[1], position[2] - volume.center[2]) <= volume.radius
}

export function prepareSpatialParticleInstances(input: unknown): SpatialPreparedParticleInstances {
  const parsed = parseSpatialValue(inputSchema, input, "particle preparation")
  const system = parseSpatialParticleSystem(parsed.system)
  const surfaces = new Map<string, readonly (readonly [Vec3, Vec3, Vec3])[]>()
  for (const surface of parsed.surfaces) {
    if (surfaces.has(surface.assetId)) throw new RangeError(`Duplicate particle surface ${surface.assetId}.`)
    surfaces.set(surface.assetId, surface.triangles)
  }
  const capacity = new Uint8Array(system.maxCount * SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES)
  const view = new DataView(capacity.buffer)
  let instanceCount = 0
  const sampleSeconds = parsed.sampleTimeUs / 1_000_000
  for (const [emitterIndex, emitter] of system.emitters.entries()) {
    if (!emitter.enabled) continue
    const maximumLifetimeSeconds = emitter.lifetimeUs[1] / 1_000_000
    const firstContinuous = Math.max(0, Math.floor((sampleSeconds - maximumLifetimeSeconds) * emitter.rate))
    const lastContinuous = Math.floor(sampleSeconds * emitter.rate)
    const births: { index: number; time: number }[] = []
    for (let index = firstContinuous; index < lastContinuous; index += 1) births.push({ index, time: index / emitter.rate })
    for (let index = 0; index < (emitter.burst ?? 0); index += 1) births.push({ index: -(index + 1), time: 0 })
    for (const birth of births) {
      const random = randomGenerator(particleSeed(emitter.seed, birth.index))
      const lifetimeSeconds = (emitter.lifetimeUs[0] + random() * (emitter.lifetimeUs[1] - emitter.lifetimeUs[0])) / 1_000_000
      const ageSeconds = sampleSeconds - birth.time
      if (ageSeconds < 0 || ageSeconds >= lifetimeSeconds) continue
      const base = shapePosition(emitter.shape, random, surfaces)
      const initialVelocity: Vec3 = emitter.velocity.map((value, index) => value + (random() * 2 - 1) * emitter.velocitySpread[index]!) as [number, number, number]
      const acceleration: [number, number, number] = [0, 0, 0]
      let drag = 0
      for (const force of system.forces) {
        if (force.kind === "gravity") addScaled(acceleration, force.acceleration)
        else if (force.kind === "drag") drag += force.coefficient
        else if (force.kind === "vortex") addScaled(acceleration, normalize(cross(normalize(force.axis), base)), force.strength)
        else {
          const turbulence = randomGenerator(particleSeed(force.seed, birth.index + Math.round(force.scale * 1000)))
          addScaled(acceleration, normalize([turbulence() * 2 - 1, turbulence() * 2 - 1, turbulence() * 2 - 1]), force.strength)
        }
      }
      const damping = drag === 0 ? 1 : Math.exp(-drag * ageSeconds)
      const position = base.map((value, index) => value + initialVelocity[index]! * ageSeconds * damping + 0.5 * acceleration[index]! * ageSeconds * ageSeconds) as [number, number, number]
      if (system.killVolumes.some(volume => inside(position, volume))) continue
      const velocity = initialVelocity.map((value, index) => value * damping + acceleration[index]! * ageSeconds) as [number, number, number]
      const normalizedAge = ageSeconds / lifetimeSeconds
      const color = interpolateColor(emitter.colorOverLife, normalizedAge)
      if (instanceCount >= system.maxCount) throw new RangeError(`Prepared particle count exceeds maxCount ${system.maxCount}.`)
      const row = [
        ...position, ageSeconds,
        ...velocity, lifetimeSeconds,
        interpolate(emitter.sizeOverLife.keys, normalizedAge), interpolate(emitter.opacityOverLife.keys, normalizedAge),
        ...color, random(), emitterIndex,
      ]
      row.forEach((value, column) => view.setFloat32(instanceCount * SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES + column * 4, value, true))
      instanceCount += 1
    }
  }
  const bytes = capacity.slice(0, instanceCount * SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES)
  const hasher = createSha256HexHasher(); hasher.update(bytes)
  return Object.freeze({ bytes, byteLength: bytes.length, instanceCount, sha256: hasher.digestHex(), strideBytes: SPATIAL_PARTICLE_INSTANCE_STRIDE_BYTES, systemSha256: spatialParticleSystemSha256(system), sampleTimeUs: parsed.sampleTimeUs })
}
