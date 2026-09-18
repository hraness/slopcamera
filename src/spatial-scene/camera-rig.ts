import { z } from "zod"
import { deepFreezeJson } from "../code/json-snapshot.js"
import { SpatialCameraIdSchema, SpatialCameraSchema, SpatialEntityIdSchema, SpatialFrameRateSchema, SpatialPoseSchema, SpatialTimeUsSchema, SpatialVec3Schema, type SpatialCamera } from "./contracts.js"
import { parseSpatialValue, SpatialSceneError, spatialValueSha256 } from "./identity.js"
import { parseSpatialCameraTrack, SPATIAL_CAMERA_TRACK_MAX_FRAMES, type SpatialCameraTrack } from "./camera-track.js"
import { reduceSpatialFrameRate, spatialFrameCount, spatialFrameSample } from "./time.js"

const scalar = z.number().finite().min(-1_000_000).max(1_000_000)
const positive = z.number().finite().positive().max(1_000_000)
const target = z.strictObject({ entityId: SpatialEntityIdSchema.optional(), position: SpatialVec3Schema, radiusM: positive })
const timing = { startUs: SpatialTimeUsSchema, endUs: SpatialTimeUsSchema }
const base = { cameraId: SpatialCameraIdSchema, ...timing, easing: z.enum(["linear", "smoothstep", "smootherstep"]).optional() }
const shake = z.strictObject({ seed: z.number().int().min(0).max(0xffff_ffff), amplitudeM: z.number().finite().min(0).max(10), frequencyHz: z.number().finite().min(0.01).max(100), layers: z.number().int().min(1).max(8) })
export const SpatialCameraRigSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("dolly"), from: SpatialVec3Schema, to: SpatialVec3Schema, target }),
  z.strictObject({ ...base, kind: z.literal("crane"), from: SpatialVec3Schema, to: SpatialVec3Schema, target }),
  z.strictObject({ ...base, kind: z.literal("orbit"), center: SpatialVec3Schema, radiusM: positive, startAngleRad: scalar, endAngleRad: scalar, heightM: scalar, target }),
  z.strictObject({ ...base, kind: z.literal("rail"), points: z.array(SpatialVec3Schema).min(2).max(64), target }),
  z.strictObject({ ...base, kind: z.literal("handheld"), pose: SpatialPoseSchema, target, shake }),
  z.strictObject({ ...base, kind: z.literal("chase"), target, offset: SpatialVec3Schema, fromTarget: SpatialVec3Schema.optional(), toTarget: SpatialVec3Schema.optional(), shake: shake.optional() }),
  z.strictObject({ ...base, kind: z.literal("tripod"), pose: SpatialPoseSchema, target }),
  z.strictObject({ ...base, kind: z.literal("target-tracking"), from: SpatialVec3Schema, to: SpatialVec3Schema, target, targetEnd: SpatialVec3Schema.optional() }),
]).refine(value => value.endUs > value.startUs, "Camera rig duration must be nonempty.")
export type SpatialCameraRig = Readonly<z.infer<typeof SpatialCameraRigSchema>>

export const SpatialRackFocusSchema = z.strictObject({ startDistanceM: positive, endDistanceM: positive })
export type SpatialRackFocus = Readonly<z.infer<typeof SpatialRackFocusSchema>>
const compileSchema = z.strictObject({ camera: SpatialCameraSchema, rig: SpatialCameraRigSchema, frameRate: SpatialFrameRateSchema, frameCount: z.number().int().min(1).max(SPATIAL_CAMERA_TRACK_MAX_FRAMES), rackFocus: SpatialRackFocusSchema.optional() })

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const vec = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [mix(a[0]!, b[0]!, t), mix(a[1]!, b[1]!, t), mix(a[2]!, b[2]!, t)]
function eased(t: number, kind: SpatialCameraRig["easing"]): number { return kind === "smoothstep" ? t*t*(3-2*t) : kind === "smootherstep" ? t*t*t*(t*(t*6-15)+10) : t }
function hash(seed: number, n: number): number { let x = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x7feb352d); x ^= x >>> 15; return ((x >>> 0) / 0x1_0000_0000) * 2 - 1 }
function shakeAt(spec: z.infer<typeof shake> | undefined, seconds: number): [number, number, number] {
  if (!spec) return [0,0,0]
  const out: [number,number,number] = [0,0,0]
  for (let layer=0; layer<spec.layers; layer++) for (let axis=0; axis<3; axis++) out[axis] = out[axis]! + Math.sin(seconds * spec.frequencyHz * (layer+1) * Math.PI*2 + hash(spec.seed, layer*3+axis)*Math.PI) * spec.amplitudeM / (spec.layers * (layer+1))
  return out
}
const normalize = (v: readonly number[]): [number,number,number] => { const n=Math.hypot(...v); return [v[0]!/n,v[1]!/n,v[2]!/n] }
const cross = (a:readonly number[],b:readonly number[]):[number,number,number] => [a[1]!*b[2]!-a[2]!*b[1]!,a[2]!*b[0]!-a[0]!*b[2]!,a[0]!*b[1]!-a[1]!*b[0]!]
function quaternionFromBasis(x:readonly number[],y:readonly number[],z:readonly number[]): [number,number,number,number] {
  const m00=x[0]!,m01=y[0]!,m02=z[0]!,m10=x[1]!,m11=y[1]!,m12=z[1]!,m20=x[2]!,m21=y[2]!,m22=z[2]!, trace=m00+m11+m22; let q:[number,number,number,number]
  if(trace>0){const s=2*Math.sqrt(trace+1);q=[(m21-m12)/s,(m02-m20)/s,(m10-m01)/s,s/4]}
  else if(m00>m11&&m00>m22){const s=2*Math.sqrt(1+m00-m11-m22);q=[s/4,(m01+m10)/s,(m02+m20)/s,(m21-m12)/s]}
  else if(m11>m22){const s=2*Math.sqrt(1+m11-m00-m22);q=[(m01+m10)/s,s/4,(m12+m21)/s,(m02-m20)/s]}
  else {const s=2*Math.sqrt(1+m22-m00-m11);q=[(m02+m20)/s,(m12+m21)/s,s/4,(m10-m01)/s]}
  const n=Math.hypot(...q); return q.map(v=>v/n) as [number,number,number,number]
}
function lookAt(position: readonly number[], targetPosition: readonly number[]): [number,number,number,number] {
  const forward=[targetPosition[0]!-position[0]!,targetPosition[1]!-position[1]!,targetPosition[2]!-position[2]!]
  if(Math.hypot(...forward)<1e-9) throw new SpatialSceneError("invalid-data","Camera and look-at target must not coincide.")
  const f=normalize(forward), up=Math.abs(f[1]!)>.999999?[0,0,1]:[0,1,0], right=normalize(cross(f,up)), correctedUp=cross(right,f)
  return quaternionFromBasis(right,correctedUp,[-f[0],-f[1],-f[2]])
}
function pointOnRail(points: readonly (readonly number[])[], t: number): [number,number,number] {
  // Chord-length parameterization gives authored segments proportional time and avoids speed jumps caused solely by unequal spacing.
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]!-points[i]![0]!,p[1]!-points[i]![1]!,p[2]!-points[i]![2]!)), total=lengths.reduce((a,b)=>a+b,0)
  if(total===0) return [...points[0]!] as [number,number,number]
  let distance=t*total,index=0; while(index<lengths.length-1&&distance>lengths[index]!){distance-=lengths[index]!;index++}
  return vec(points[index]!,points[index+1]!,lengths[index]===0?0:distance/lengths[index]!)
}
function sampleRig(rig: SpatialCameraRig, t: number): { position:[number,number,number], target:[number,number,number] } {
  const u=eased(t,rig.easing); let position:[number,number,number], aim:[number,number,number]=[...rig.target.position]
  if (rig.kind === "orbit") position=[rig.center[0]+Math.sin(mix(rig.startAngleRad,rig.endAngleRad,u))*rig.radiusM,rig.center[1]+rig.heightM,rig.center[2]+Math.cos(mix(rig.startAngleRad,rig.endAngleRad,u))*rig.radiusM]
  else if (rig.kind === "rail") position=pointOnRail(rig.points,u)
  else if (rig.kind === "handheld" || rig.kind === "tripod") position=[...rig.pose.position]
  else if (rig.kind === "chase") { aim=vec(rig.fromTarget??rig.target.position,rig.toTarget??rig.target.position,u); position=[aim[0]+rig.offset[0],aim[1]+rig.offset[1],aim[2]+rig.offset[2]] }
  else position=vec(rig.from,rig.to,u)
  if (rig.kind === "target-tracking" && rig.targetEnd) aim=vec(rig.target.position,rig.targetEnd,u)
  const s=shakeAt(rig.kind === "handheld" || rig.kind === "chase" ? rig.shake : undefined,(rig.endUs-rig.startUs)*t/1e6)
  return { position:[position[0]+s[0],position[1]+s[1],position[2]+s[2]], target:aim }
}

/** Compiles semantic motion to an ordinary immutable camera track; no runtime rig or random source remains. */
export function compileSpatialCameraRig(input: unknown): SpatialCameraTrack {
  const value=parseSpatialValue(compileSchema,input,"camera rig compilation"), rate=reduceSpatialFrameRate(value.frameRate), duration=value.rig.endUs-value.rig.startUs
  if (value.camera.cameraId !== value.rig.cameraId) throw new SpatialSceneError("conflict","Rig and camera identities differ.")
  if (spatialFrameCount(duration,rate)!==value.frameCount) throw new SpatialSceneError("invalid-data","frameCount must exactly cover the rig's half-open duration at frameRate.")
  const clock={startUs:value.rig.startUs,frameRate:rate,frameCount:value.frameCount}
  const samples=Array.from({length:value.frameCount},(_,frameIndex)=>{ const relative=spatialFrameSample(frameIndex,duration,rate), t=Number(relative.exactTimeUs.numerator)/Number(relative.exactTimeUs.denominator)/duration, sampled=sampleRig(value.rig,t), denominator=BigInt(relative.exactTimeUs.denominator); const lens=value.rackFocus ? { ...(value.camera.lens ?? {focalLengthMm:50,sensorWidthMm:36}), focusDistanceM:mix(value.rackFocus.startDistanceM,value.rackFocus.endDistanceM,eased(t,value.rig.easing)) } : value.camera.lens
    return {frameIndex,timeUs:value.rig.startUs+relative.timeUs,exactTimeUs:{numerator:String(BigInt(value.rig.startUs)*denominator+BigInt(relative.exactTimeUs.numerator)),denominator:String(denominator)},camera:{...value.camera,pose:{position:sampled.position,rotation:lookAt(sampled.position,sampled.target)},...(lens===undefined?{}:{lens})}}
  })
  return parseSpatialCameraTrack({kind:"slopcamera.spatial-camera-track",schemaVersion:1,sceneSha256:spatialValueSha256({domain:"slopcamera.camera-rig.v1",camera:value.camera,rig:value.rig,frameRate:rate,frameCount:value.frameCount,rackFocus:value.rackFocus??null}),cameraId:value.camera.cameraId,clock,samples})
}

const framingTolerance=z.number().finite().min(0).max(.5).default(.05)
export const SpatialFramingGoalSchema = z.discriminatedUnion("kind", [
  z.strictObject({kind:z.literal("close-up"),targets:z.array(target).min(1).max(3),tolerance:framingTolerance}), z.strictObject({kind:z.literal("medium"),targets:z.array(target).min(1).max(3),tolerance:framingTolerance}), z.strictObject({kind:z.literal("wide"),targets:z.array(target).min(1).max(3),tolerance:framingTolerance}), z.strictObject({kind:z.literal("two-shot"),targets:z.array(target).length(2),tolerance:framingTolerance}), z.strictObject({kind:z.literal("over-shoulder"),targets:z.array(target).min(2).max(3),tolerance:framingTolerance}),
  z.strictObject({kind:z.literal("screen-position"),targets:z.array(target).length(1),position:z.tuple([z.number().finite().min(0).max(1),z.number().finite().min(0).max(1)]),tolerance:framingTolerance}), z.strictObject({kind:z.literal("headroom"),targets:z.array(target).length(1),headroom:z.number().finite().min(0).max(.5),tolerance:framingTolerance}), z.strictObject({kind:z.literal("rule-of-thirds"),targets:z.array(target).length(1),quadrant:z.enum(["upper-left","upper-right","lower-left","lower-right"]),tolerance:framingTolerance}),
])
export type SpatialFramingResult = Readonly<{ satisfied:true; camera:SpatialCamera } | { satisfied:false; report:{ code:"missing-bounds"|"impossible"|"unsatisfied"; goal:string; entityIds:readonly string[]; detail:string; deviation?:number } }>
/** Solves spherical world bounds against the camera's calibrated pixel intrinsics. */
export function solveSpatialFraming(cameraInput: unknown, goalInput: unknown): SpatialFramingResult {
  const camera=parseSpatialValue(SpatialCameraSchema,cameraInput,"framing camera"), goal=parseSpatialValue(SpatialFramingGoalSchema,goalInput,"framing goal"), ids=goal.targets.flatMap(x=>x.entityId?[x.entityId]:[])
  if (ids.length!==goal.targets.length) return deepFreezeJson({satisfied:false,report:{code:"missing-bounds",goal:goal.kind,entityIds:ids,detail:"Every framing target requires supplied known bounds and identity."}})
  if(camera.projection.kind!=="perspective") return deepFreezeJson({satisfied:false,report:{code:"impossible",goal:goal.kind,entityIds:ids,detail:"Semantic framing requires a perspective camera."}})
  const p=camera.projection, min=goal.targets.reduce((a,x)=>[Math.min(a[0],x.position[0]-x.radiusM),Math.min(a[1],x.position[1]-x.radiusM),Math.min(a[2],x.position[2]-x.radiusM)] as [number,number,number],[Infinity,Infinity,Infinity] as [number,number,number]), max=goal.targets.reduce((a,x)=>[Math.max(a[0],x.position[0]+x.radiusM),Math.max(a[1],x.position[1]+x.radiusM),Math.max(a[2],x.position[2]+x.radiusM)] as [number,number,number],[-Infinity,-Infinity,-Infinity] as [number,number,number]), center=vec(min,max,.5), halfW=(max[0]-min[0])/2, halfH=(max[1]-min[1])/2, depthRadius=(max[2]-min[2])/2
  const fill=goal.kind==="close-up"?.8:goal.kind==="medium"?.55:goal.kind==="wide"?.3:goal.kind==="over-shoulder"?.7:.6
  const depth=Math.max(halfW*p.fx/(p.width*fill/2),halfH*p.fy/(p.height*fill/2),p.near+depthRadius+1e-6)
  if(depth+depthRadius>=p.far) return deepFreezeJson({satisfied:false,report:{code:"impossible",goal:goal.kind,entityIds:ids,detail:"Target bounds cannot fit inside the camera clipping range."}})
  let desiredX=.5,desiredY=.5; if(goal.kind==="screen-position") [desiredX,desiredY]=goal.position; else if(goal.kind==="rule-of-thirds"){desiredX=goal.quadrant.endsWith("left")?1/3:2/3;desiredY=goal.quadrant.startsWith("upper")?1/3:2/3}else if(goal.kind==="headroom") desiredY=goal.headroom+(halfH*p.fy/depth)/p.height
  // For a -Z camera with no roll, pixel = principal point + focal * camera-space coordinate / depth.
  const centerPixelX=desiredX*p.width,centerPixelY=desiredY*p.height, localCenter:[number,number,number]=[(centerPixelX-p.cx)*depth/p.fx,-(centerPixelY-p.cy)*depth/p.fy,-depth]
  const q=camera.pose.rotation, [qx,qy,qz,qw]=q, [lx,ly,lz]=localCenter, tx=2*(qy*lz-qz*ly),ty=2*(qz*lx-qx*lz),tz=2*(qx*ly-qy*lx), worldOffset:[number,number,number]=[lx+qw*tx+(qy*tz-qz*ty),ly+qw*ty+(qz*tx-qx*tz),lz+qw*tz+(qx*ty-qy*tx)], position:[number,number,number]=[center[0]-worldOffset[0],center[1]-worldOffset[1],center[2]-worldOffset[2]], solved={...camera,pose:{position,rotation:q}}
  const actual=worldToCamera([center[0]-position[0],center[1]-position[1],center[2]-position[2]],q), actualDepth=-actual[2], projectedX=p.cx+actual[0]*p.fx/actualDepth, projectedY=p.cy-actual[1]*p.fy/actualDepth, deviation=Math.hypot(projectedX/p.width-desiredX,projectedY/p.height-desiredY)
  return deviation<=goal.tolerance+1e-12 ? deepFreezeJson({satisfied:true,camera:solved}) : deepFreezeJson({satisfied:false,report:{code:"unsatisfied",goal:goal.kind,entityIds:ids,detail:"Calibrated framing exceeds the declared normalized-screen tolerance.",deviation}})
}

export type SpatialCameraAuditFinding = Readonly<{ kind:"clipping"|"collision"|"acceleration"|"framing-deviation"|"focus-error"|"angular-velocity"; cameraId:string; frameIndex:number; timeUs:number; entityId?:string | undefined; measured:number; limit:number }>
const auditOptions=z.strictObject({subjects:z.array(target).max(128).default([]),collisionBounds:z.array(target).max(128).default([]),cameraCollisionRadiusM:z.number().finite().min(0).max(100).default(0),maxAcceleration:z.number().finite().positive().max(1_000_000).default(50),maxAngularVelocity:z.number().finite().positive().max(100_000).default(4),maxFramingDeviation:z.number().finite().min(0).max(1).default(.1),maxFocusErrorM:z.number().finite().positive().max(1_000_000).default(.5)})
function worldToCamera(delta:readonly number[],q:readonly number[]):[number,number,number]{const [x,y,z,w]=q, tx=2*(-y!*delta[2]!+z!*delta[1]!),ty=2*(-z!*delta[0]!+x!*delta[2]!),tz=2*(-x!*delta[1]!+y!*delta[0]!);return [delta[0]!+w!*tx+(-y!*tz+z!*ty),delta[1]!+w!*ty+(-z!*tx+x!*tz),delta[2]!+w!*tz+(-x!*ty+y!*tx)]}
export function auditSpatialCameraTrack(trackInput: unknown, optionsInput: unknown): readonly SpatialCameraAuditFinding[] {
  const track=parseSpatialCameraTrack(trackInput), options=parseSpatialValue(auditOptions,optionsInput,"camera audit options"), findings:SpatialCameraAuditFinding[]=[]
  const add=(sample:SpatialCameraTrack["samples"][number],finding:Omit<SpatialCameraAuditFinding,"cameraId"|"frameIndex"|"timeUs">)=>findings.push({cameraId:track.cameraId,frameIndex:sample.frameIndex,timeUs:sample.timeUs,...finding})
  for(let i=0;i<track.samples.length;i++){const s=track.samples[i]!,p=s.camera.pose.position,proj=s.camera.projection
    for(const subject of options.subjects){const delta=[subject.position[0]-p[0],subject.position[1]-p[1],subject.position[2]-p[2]],local=worldToCamera(delta,s.camera.pose.rotation),depth=-local[2]!, nearEdge=depth-subject.radiusM,farEdge=depth+subject.radiusM;if(nearEdge<proj.near||farEdge>proj.far)add(s,{kind:"clipping",entityId:subject.entityId,measured:depth,limit:nearEdge<proj.near?proj.near:proj.far});const focus=s.camera.lens?.focusDistanceM;if(focus!==undefined&&Math.abs(focus-depth)>options.maxFocusErrorM)add(s,{kind:"focus-error",entityId:subject.entityId,measured:Math.abs(focus-depth),limit:options.maxFocusErrorM});const lateral=Math.hypot(local[0],local[1]),deviation=depth<=0?1:Math.atan2(lateral,depth)/Math.PI;if(deviation>options.maxFramingDeviation)add(s,{kind:"framing-deviation",entityId:subject.entityId,measured:deviation,limit:options.maxFramingDeviation})}
    for(const bound of options.collisionBounds){const d=Math.hypot(bound.position[0]-p[0],bound.position[1]-p[1],bound.position[2]-p[2]),limit=bound.radiusM+options.cameraCollisionRadiusM;if(d<limit)add(s,{kind:"collision",entityId:bound.entityId,measured:d,limit})}
    if(i>=2){const a=track.samples[i-2]!,b=track.samples[i-1]!,dt=(s.timeUs-b.timeUs)/1e6,dt0=(b.timeUs-a.timeUs)/1e6;if(dt>0&&dt0>0){const acceleration=Math.hypot(...([0,1,2].map(k=>(p[k]!-b.camera.pose.position[k]!)/dt-(b.camera.pose.position[k]!-a.camera.pose.position[k]!)/dt0) as [number,number,number]))/((dt+dt0)/2);if(acceleration>options.maxAcceleration)add(s,{kind:"acceleration",measured:acceleration,limit:options.maxAcceleration})}}
    if(i>0){const b=track.samples[i-1]!,seconds=(s.timeUs-b.timeUs)/1e6;if(seconds>0){const raw=s.camera.pose.rotation.reduce((sum,v,k)=>sum+v*b.camera.pose.rotation[k]!,0),dot=Math.min(1,Math.max(-1,Math.abs(raw))),velocity=2*Math.acos(dot)/seconds;if(velocity>options.maxAngularVelocity)add(s,{kind:"angular-velocity",measured:velocity,limit:options.maxAngularVelocity})}}
  }
  const kindOrder={clipping:0,collision:1,acceleration:2,"framing-deviation":3,"focus-error":4,"angular-velocity":5} as const
  findings.sort((a,b)=>a.frameIndex-b.frameIndex||kindOrder[a.kind]-kindOrder[b.kind]||(a.entityId??"").localeCompare(b.entityId??""))
  return deepFreezeJson(findings)
}
