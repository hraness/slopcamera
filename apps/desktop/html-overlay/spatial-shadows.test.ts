import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { SPATIAL_SHADOW_POLICY, spatialShadowRuntimeSource } from "./spatial-shadows";

const three: unknown = createRequire(import.meta.url)("three");
function run(script: string): Record<string, unknown> {
  return runInNewContext(`${spatialShadowRuntimeSource()}
const world=new THREE.Scene(),tracked=[];
const box=(size,position,cast,receive)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial());mesh.position.set(...position);mesh.castShadow=cast;mesh.receiveShadow=receive;world.add(mesh);return mesh;};
const key=()=>{const light=new THREE.DirectionalLight();light.position.set(7,12,9);light.target.position.set(0,0,0);light.castShadow=true;world.add(light,light.target);return light;};
${script}`, { THREE: three }) as Record<string, unknown>;
}

test("directional fit contains translated casters, preserves light direction, and ignores huge receive-only ground", () => {
  const result = run(`const mesh=box([12,9,20],[200,40,-300],true,true),light=key();
world.updateMatrixWorld(true);
const before=light.target.position.clone().sub(light.position).normalize();
configureSpatialShadows(world,8192,value=>tracked.push(value));
const camera=light.shadow.camera,first=[camera.left,camera.right,camera.top,camera.bottom,camera.near,camera.far];
const after=light.target.position.clone().sub(light.position).normalize();
const boxWorld=new THREE.Box3().setFromObject(mesh),corners=[];
for(const x of [boxWorld.min.x,boxWorld.max.x])for(const y of [boxWorld.min.y,boxWorld.max.y])for(const z of [boxWorld.min.z,boxWorld.max.z])corners.push(new THREE.Vector3(x,y,z).project(camera));
box([100000,1,100000],[200,34,-300],false,true);
configureSpatialShadows(world,8192,()=>{});
({contained:corners.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<1),directionError:before.distanceTo(after),groundUnchanged:first.every((value,index)=>Math.abs(value-[camera.left,camera.right,camera.top,camera.bottom,camera.near,camera.far][index])<1e-9),mapSize:light.shadow.mapSize.x,bias:light.shadow.bias,normalBias:light.shadow.normalBias,tracked:tracked.length,near:camera.near,far:camera.far});`);
  expect(result.contained).toBe(true);
  expect(result.directionError).toBeLessThan(1e-12);
  expect(result.groundUnchanged).toBe(true);
  expect(result.mapSize).toBe(2048);
  expect(result.bias).toBeLessThan(0);
  expect(result.normalBias).toBeGreaterThan(0);
  expect(result.normalBias).toBeLessThanOrEqual(SPATIAL_SHADOW_POLICY.maximumNormalBiasMeters);
  expect(result.tracked).toBe(1);
  expect(result.near).toBeGreaterThan(0);
  expect(result.far).toBeGreaterThan(result.near as number);
});

test("many directional, spot and point lights stay inside the shared atlas and hardware budgets", () => {
  const result = run(`box([10,20,15],[0,0,0],true,true);
const lights=[];
for(let index=0;index<120;index++){const light=index%3===0?new THREE.PointLight():index%3===1?new THREE.SpotLight():new THREE.DirectionalLight();light.castShadow=true;light.position.set(20,30,40);world.add(light);if(light.target)world.add(light.target);lights.push(light);}
configureSpatialShadows(world,1024,value=>tracked.push(value));
({texels:lights.reduce((sum,light)=>sum+light.shadow.mapSize.x*light.shadow.mapSize.y*(light.isPointLight?6:1),0),hardwareSafe:lights.every(light=>light.shadow.mapSize.x<=1024),powerOfTwo:lights.every(light=>Number.isInteger(Math.log2(light.shadow.mapSize.x))),tracked:tracked.length,finite:lights.every(light=>Number.isFinite(light.shadow.normalBias)&&light.shadow.normalBias>0)});`);
  expect(result.texels).toBeLessThanOrEqual(SPATIAL_SHADOW_POLICY.maximumAtlasTexels);
  expect(result.hardwareSafe).toBe(true);
  expect(result.powerOfTwo).toBe(true);
  expect(result.tracked).toBe(120);
  expect(result.finite).toBe(true);
});

test("matrix-authored lights remain deterministic and explicit participation is preserved", () => {
  const result = run(`const mesh=box([3,5,2],[0,2,0],true,false),light=key(),off=new THREE.SpotLight();
world.add(off,off.target);off.castShadow=false;light.updateMatrix();light.matrixAutoUpdate=false;
configureSpatialShadows(world,8192,()=>{});
const first=JSON.stringify({matrix:light.matrix.elements,target:light.target.position,projection:light.shadow.camera.projectionMatrix.elements,bias:light.shadow.normalBias});
configureSpatialShadows(world,8192,()=>{});
({repeated:first===JSON.stringify({matrix:light.matrix.elements,target:light.target.position,projection:light.shadow.camera.projectionMatrix.elements,bias:light.shadow.normalBias}),cast:mesh.castShadow,receive:mesh.receiveShadow,offCast:off.castShadow,offMap:off.shadow.mapSize.x});`);
  expect(result.repeated).toBe(true);
  expect(result.cast).toBe(true);
  expect(result.receive).toBe(false);
  expect(result.offCast).toBe(false);
  expect(result.offMap).toBe(512);
});

test("empty caster scenes have finite defaults and register every generated map for disposal", () => {
  const result = run(`box([100,1,100],[0,0,0],false,true);const light=key();
let disposed=0;light.shadow.dispose=()=>disposed++;
configureSpatialShadows(world,8192,value=>tracked.push(value));
for(const value of tracked)value.dispose();
({finite:Number.isFinite(light.shadow.normalBias),disposed,mapSize:light.shadow.mapSize.x});`);
  expect(result.finite).toBe(true);
  expect(result.disposed).toBe(1);
  expect(result.mapSize).toBe(2048);
});


test("current Three point shadow maps allocate six cube faces without legacy atlas downscaling", () => {
  const result = run(`const light=new THREE.PointLight();light.castShadow=true;world.add(light);box([1,1,1],[0,0,0],true,true);
configureSpatialShadows(world,1024,()=>{});
({mapSize:light.shadow.mapSize.x,frameExtents:light.shadow.getFrameExtents().toArray()});`);
  expect(result.mapSize).toBe(1024);
  expect(result.frameExtents).toEqual([1, 1]);
  expect(SPATIAL_SHADOW_POLICY.pointMapFaces).toBe(6);
});
