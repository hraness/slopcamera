/** Finite inert recipes for this specimen. No engine or subprocess is started. */
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {lstat,readFile} from "node:fs/promises";
import {join} from "node:path";
import {parseStudioJob,parseStudioPlan,parseStudioSourceBundle,studioSourceBundleSha256,validateStudioReceipt} from "../../../../src/studio";

export const sourcePaths=["scene.py","asset_io.py","scene_checks.py","studio_scene.py","asset-facts.json","assets/field-carton.glb","textures/field-label.png","artwork.svg"] as const;
export const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
export async function readRegular(path:string,maximum:number){
 const info=await lstat(path);assert(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size<=maximum,"Expected a bounded regular file: "+path);
 const bytes=await readFile(path);assert.equal(bytes.length,info.size);return bytes;
}
export async function currentBundle(directory:string){
 const descriptor=JSON.parse((await readRegular(join(directory,"source.json"),4096)).toString());
 assert.deepEqual(descriptor,{engine:"blender",entrypoint:{kind:"python",path:"scene.py"},files:[...sourcePaths]});
 const files=[];for(const path of sourcePaths){const bytes=await readRegular(join(directory,path),1024**2);files.push({path,bytes:bytes.length,sha256:sha(bytes)});}
 return parseStudioSourceBundle({kind:"slopcamera.studio-source-bundle",schemaVersion:1,engine:"blender",entrypoint:descriptor.entrypoint,files});
}
export function finalJob(jobId:string,bundleSha256:string){
 return parseStudioJob({kind:"slopcamera.studio-job",schemaVersion:1,jobId,bundleSha256,stage:"render",parameters:{},
  engine:{engine:"blender",renderer:"cycles",device:"cpu",samples:128,transparent:false,viewTransform:"AgX",denoise:true,seed:0},
  render:{width:960,height:540,frameRate:{numerator:24,denominator:1},startFrame:0,endFrameExclusive:3},
  outputs:[{id:"beauty",role:"beauty",format:"png",interpretation:{kind:"raster",colorSpace:"srgb",alpha:"opaque",dataType:"uint8",channels:["R","G","B"],semantic:"color",unit:"unitless"},kind:"sequence",pathPattern:"frames/%06d.png"},
   {id:"native",role:"native-source",format:"blend",interpretation:{kind:"native-source"},kind:"file",path:"native/scene.blend"}],
  limits:{timeoutSeconds:360,maximumOutputBytes:8*1024**2,maximumOutputFiles:32},execution:{trust:"trusted-current-user",isolation:"none",hermetic:false}});
}
export function assertFinalJob(value:unknown,bundleSha256:string){
 const job=parseStudioJob(value);assert.deepEqual(job,finalJob(job.jobId,bundleSha256),"Final three-view profile changed");return job;
}
export function replayJob(original:ReturnType<typeof finalJob>,jobId:string,bundleSha256:string){
 assertFinalJob(original,original.bundleSha256);
 return parseStudioJob({...original,jobId,bundleSha256,outputs:original.outputs.filter(o=>o.role==="beauty")});
}
export function inspectionJob(original:ReturnType<typeof finalJob>,jobId:string,bundleSha256:string,nativeSha256:string){
 assertFinalJob(original,original.bundleSha256);assert.match(nativeSha256,/^[a-f0-9]{64}$/u);
 const {render: _render,...base}=original;
 return parseStudioJob({...base,jobId,bundleSha256,stage:"build",parameters:{sourceBlendSha256:nativeSha256},engine:{...base.engine,samples:1,denoise:false},outputs:base.outputs.filter(o=>o.role==="native-source"),limits:{timeoutSeconds:120,maximumOutputBytes:4*1024**2,maximumOutputFiles:8}});
}
export async function successfulOriginal(repository:string,directory:string,jobId:string){
 assert.match(jobId,/^studio_imported_model_final_views_[a-f0-9]{32}$/u);
 const root=join(repository,"artifacts/slopcamera/private/studio/jobs",jobId);
 const planBytes=await readRegular(join(root,"plan.json"),1024**2),receiptBytes=await readRegular(join(root,"receipt.json"),1024**2);
 const plan=parseStudioPlan(JSON.parse(planBytes.toString())),receipt=validateStudioReceipt({plan,receipt:JSON.parse(receiptBytes.toString())});
 assert.equal(plan.job.jobId,jobId);assert.equal(receipt.jobId,jobId);assert(receipt.state==="succeeded"&&receipt.custody==="closed"&&receipt.exitCode===0);
 const bundle=await currentBundle(directory);assert.equal(studioSourceBundleSha256(plan.bundle),studioSourceBundleSha256(bundle));
 const job=assertFinalJob(plan.job,studioSourceBundleSha256(bundle));assert(plan.runtimeSha256,"Bound native runtime required");
 assert.equal(receipt.outputs.length,4);const frames=receipt.outputs.filter(o=>o.outputId==="beauty").sort((a,b)=>a.frame!-b.frame!);
 assert.deepEqual(frames.map(o=>[o.frame,o.path]),[0,1,2].map(i=>[i,`frames/${String(i).padStart(6,"0")}.png`]));
 const native=receipt.outputs.filter(o=>o.outputId==="native");assert.equal(native.length,1);assert.equal(native[0]!.path,"native/scene.blend");
 for(const output of receipt.outputs){const bytes=await readRegular(join(root,"outputs",output.path),8*1024**2);assert.equal(bytes.length,output.bytes);assert.equal(sha(bytes),output.sha256);}
 return {root,plan,job,receipt,receiptSha256:sha(receiptBytes),native:native[0]!,frames};
}
