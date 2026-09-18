import { expect, test } from "bun:test"
import fc from "fast-check"
import { auditSpatialCameraTrack, compileSpatialCameraRig, solveSpatialFraming, SpatialCameraRigSchema } from "./camera-rig.js"
import { evaluateSpatialScene } from "./evaluate.js"
import { fixtureCamera, fixtureScene } from "./test-fixture.js"

const target={entityId:"entity_subject",position:[0,0,0] as [number,number,number],radiusM:1}
const compile=(rig:object, overrides:object={})=>compileSpatialCameraRig({camera:fixtureCamera(),rig,frameRate:{numerator:10,denominator:1},frameCount:10,...overrides})
function rotatedMinusZ(q:readonly number[]){const [x,y,z,w]=q;return [-2*(x!*z!+w!*y!),-2*(y!*z!-w!*x!),-1+2*(x!*x!+y!*y!)]}

test("semantic push-in and rack focus compile deterministically with exact rational clock",()=>{
  const camera={...fixtureCamera(),lens:{focalLengthMm:50,sensorWidthMm:36,apertureFStop:2}}, input={camera,rig:{kind:"dolly",cameraId:"camera_main",startUs:7,endUs:1_000_007,easing:"smoothstep",from:[0,0,10],to:[0,0,5],target},frameRate:{numerator:24,denominator:1},frameCount:24,rackFocus:{startDistanceM:10,endDistanceM:5}}
  const a=compileSpatialCameraRig(input), b=compileSpatialCameraRig(structuredClone(input))
  expect(a).toEqual(b); expect(a.samples[0]!.exactTimeUs).toEqual({numerator:"7",denominator:"1"});expect(a.samples[1]!.exactTimeUs).toEqual({numerator:"125021",denominator:"3"})
  expect(a.samples[0]!.camera.lens).toMatchObject({focalLengthMm:50,sensorWidthMm:36,apertureFStop:2,focusDistanceM:10});expect(Object.isFrozen(a.samples[0]!.camera.lens)).toBe(true)
  expect(()=>compileSpatialCameraRig({...input,frameCount:23})).toThrow("frameCount must exactly cover")
})

test("rig schemas are strict and bounded, and source snapshots are isolated",()=>{
  expect(SpatialCameraRigSchema.safeParse({...{kind:"tripod",cameraId:"camera_main",startUs:0,endUs:1,target,pose:fixtureCamera().pose},extra:true}).success).toBe(false)
  expect(SpatialCameraRigSchema.safeParse({kind:"rail",cameraId:"camera_main",startUs:0,endUs:1,target,points:Array.from({length:65},()=>[0,0,1])}).success).toBe(false)
  const input={camera:fixtureCamera(),rig:{kind:"dolly",cameraId:"camera_main",startUs:0,endUs:1_000_000,from:[0,0,10],to:[0,0,5],target},frameRate:{numerator:10,denominator:1},frameCount:10}, track=compileSpatialCameraRig(input)
  input.rig.from[2]=999; expect(track.samples[0]!.camera.pose.position[2]).toBe(10);expect(Object.isFrozen(track)).toBe(true)
})

test("look-at maps camera -Z to targets for horizontal and vertical aims and rejects coincidence",()=>{
  for(const [from,to] of [[[0,0,8],[0,0,0]],[[8,0,0],[0,0,0]],[[0,8,0],[0,0,0]]] as const){const q=compile({kind:"tripod",cameraId:"camera_main",startUs:0,endUs:1_000_000,target:{...target,position:to},pose:{position:from,rotation:[0,0,0,1]}}).samples[0]!.camera.pose.rotation,f=rotatedMinusZ(q),d=to.map((v,i)=>v-from[i]!),n=Math.hypot(...d);expect(f[0]).toBeCloseTo(d[0]!/n,12);expect(f[1]).toBeCloseTo(d[1]!/n,12);expect(f[2]).toBeCloseTo(d[2]!/n,12)}
  expect(()=>compile({kind:"tripod",cameraId:"camera_main",startUs:0,endUs:1_000_000,target,pose:{position:[0,0,0],rotation:[0,0,0,1]}})).toThrow("must not coincide")
})

test("every rig kind has its declared motion semantics",()=>{
  const common={cameraId:"camera_main",startUs:0,endUs:1_000_000,target}, rigs=[
    [{...common,kind:"dolly",from:[0,0,8],to:[0,0,4]},[0,0,8]], [{...common,kind:"crane",from:[0,1,8],to:[0,5,8]},[0,1,8]],
    [{...common,kind:"orbit",center:[0,0,0],radiusM:8,startAngleRad:0,endAngleRad:1,heightM:2},[0,2,8]], [{...common,kind:"rail",points:[[0,0,8],[1,0,8],[5,0,8]]},[0,0,8]],
    [{...common,kind:"chase",offset:[0,2,5],fromTarget:[1,0,0],toTarget:[3,0,0]},[1,2,5]], [{...common,kind:"tripod",pose:{position:[0,3,8],rotation:[0,0,0,1]}},[0,3,8]],
    [{...common,kind:"target-tracking",from:[0,0,8],to:[1,0,8],targetEnd:[2,0,0]},[0,0,8]],
  ] as const
  for(const [rig,first] of rigs) expect(compile(rig).samples[0]!.camera.pose.position).toEqual(first)
  const rail=compile({...common,kind:"rail",points:[[0,0,8],[1,0,8],[5,0,8]]}).samples[2]!.camera.pose.position;expect(rail[0]).toBeCloseTo(1,12) // 0.2 of total chord length
})

test("authored shake is deterministic, seed-sensitive, and impossible without a seed",()=>{
  const rig={kind:"handheld",cameraId:"camera_main",startUs:0,endUs:1_000_000,target,pose:fixtureCamera().pose,shake:{seed:4,amplitudeM:.1,frequencyHz:2,layers:2}}, a=compile(rig), b=compile(structuredClone(rig)), c=compile({...rig,shake:{...rig.shake,seed:5}})
  expect(a).toEqual(b);expect(a.samples.map(x=>x.camera.pose.position)).not.toEqual(c.samples.map(x=>x.camera.pose.position));expect(()=>compile({...rig,shake:{amplitudeM:.1,frequencyHz:2,layers:2}})).toThrow()
})

test("framing honors calibrated principal point and declared screen goals",()=>{
  const camera=fixtureCamera(), single=[target], goals=[{kind:"screen-position",targets:single,position:[.2,.8],tolerance:1e-9},{kind:"headroom",targets:single,headroom:.1,tolerance:1e-9},{kind:"rule-of-thirds",targets:single,quadrant:"upper-right",tolerance:1e-9},{kind:"close-up",targets:single,tolerance:.05},{kind:"medium",targets:single,tolerance:.05},{kind:"wide",targets:single,tolerance:.05},{kind:"two-shot",targets:[{...target,entityId:"entity_a",position:[-1,0,0]},{...target,entityId:"entity_b",position:[1,0,0]}],tolerance:.05},{kind:"over-shoulder",targets:[target,{...target,entityId:"entity_b",position:[1,0,0]}],tolerance:.05}] as const
  for(const goal of goals) expect(solveSpatialFraming(camera,goal).satisfied).toBe(true)
  const screen=solveSpatialFraming(camera,goals[0]);if(!screen.satisfied)throw new Error("fixture");const p=screen.camera.pose.position,depth=p[2],x=camera.projection.kind==="perspective"?camera.projection.cx+(-p[0])*camera.projection.fx/depth:0,y=camera.projection.kind==="perspective"?camera.projection.cy-(-p[1])*camera.projection.fy/depth:0;expect(x/camera.projection.width).toBeCloseTo(.2,12);expect(y/camera.projection.height).toBeCloseTo(.8,12)
  expect(solveSpatialFraming(camera,{kind:"close-up",targets:[{position:[0,0,0],radiusM:1}],tolerance:.05})).toMatchObject({satisfied:false,report:{code:"missing-bounds"}})
})

test("audits use axial depth, collision radii, stable evidence ordering, and quaternion angle",()=>{
 const track=compileSpatialCameraRig({camera:{...fixtureCamera(),lens:{focalLengthMm:50,sensorWidthMm:36,focusDistanceM:10}},rig:{kind:"tripod",cameraId:"camera_main",startUs:0,endUs:1_000_000,pose:fixtureCamera().pose,target},frameRate:{numerator:2,denominator:1},frameCount:2}), subjects=[{entityId:"entity_side",position:[100,0,0],radiusM:1},{entityId:"entity_behind",position:[0,0,20],radiusM:1}]
 const findings=auditSpatialCameraTrack(track,{subjects,collisionBounds:[{entityId:"entity_wall",position:[0,0,11.4],radiusM:1}],cameraCollisionRadiusM:.5,maxFramingDeviation:.01})
 expect(findings.some(x=>x.kind==="clipping"&&x.entityId==="entity_side")).toBe(false);expect(findings.some(x=>x.kind==="framing-deviation"&&x.entityId==="entity_side")).toBe(true);expect(findings.some(x=>x.kind==="clipping"&&x.entityId==="entity_behind"&&x.measured===-10)).toBe(true);expect(findings.some(x=>x.kind==="collision"&&x.limit===1.5)).toBe(true)
 expect(findings).toEqual(auditSpatialCameraTrack(track,{subjects,collisionBounds:[{entityId:"entity_wall",position:[0,0,11.4],radiusM:1}],cameraCollisionRadiusM:.5,maxFramingDeviation:.01}));expect(findings.every((x,i)=>i===0||findings[i-1]!.frameIndex<=x.frameIndex)).toBe(true)
 expect(findings.every(x=>Number.isFinite(x.measured)&&x.cameraId==="camera_main"&&Number.isInteger(x.frameIndex))).toBe(true)
})

test("legacy cameras retain exact evaluation identity",()=>fc.assert(fc.property(fc.integer({min:0,max:999_999}),timeUs=>{const scene=fixtureScene(),before=JSON.stringify(scene),camera=evaluateSpatialScene(scene,{cameraId:"camera_main",timeUs}).camera;expect(camera).toEqual(scene.cameras[0]!);expect("lens" in camera).toBe(false);expect(JSON.stringify(scene)).toBe(before)}),{numRuns:50}))
