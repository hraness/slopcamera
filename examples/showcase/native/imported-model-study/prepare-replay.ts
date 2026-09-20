/** Prepare only: bind one actual successful import scene to a fresh native replay and inspector. */
import {createHash,randomUUID} from "node:crypto";
import {copyFile,lstat,mkdir,readFile,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseStudioJob,parseStudioPlan,parseStudioSourceBundle,studioSourceBundleSha256,validateStudioReceipt} from "../../../../src/studio";
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,"../../../..");
const [jobId,...rest]=process.argv.slice(2);
if(!jobId||!/^studio_imported_model_01_hero_v1_[a-f0-9]{32}$/u.test(jobId)||rest.length)throw Error("Usage: bun examples/showcase/native/imported-model-study/prepare-replay.ts <successful-prepared-hero-job-id>");
const sha=(data:Uint8Array)=>createHash("sha256").update(data).digest("hex");
const jobRoot=join(root,"artifacts/slopcamera/private/studio/jobs",jobId);
const plan=parseStudioPlan(JSON.parse(await readFile(join(jobRoot,"plan.json"),"utf8")));
const receiptBytes=await readFile(join(jobRoot,"receipt.json")),receipt=validateStudioReceipt({plan,receipt:JSON.parse(receiptBytes.toString())});
if(receipt.state!=="succeeded"||receipt.custody!=="closed"||receipt.jobId!==jobId||receipt.exitCode!==0)throw Error("Original import scene is not a successful closed attempt");
const native=receipt.outputs.find(file=>file.role==="native-source"&&file.format==="blend"&&file.path==="native/scene.blend");
if(!native||native.bytes>64*1024**2)throw Error("No bounded retained native scene");
const source=join(jobRoot,"outputs",native.path),info=await lstat(source);
if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size!==native.bytes)throw Error("Invalid retained scene file");
const bytes=await readFile(source);if(sha(bytes)!==native.sha256)throw Error("Retained native scene changed");
// Bind the actual importer source to the current authored files before creating any replay recipe.
for(const file of plan.bundle.files){const path=join(directory,file.path),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==file.bytes||sha(await readFile(path))!==file.sha256)throw Error("Current authored source differs from successful import: "+file.path);}
const nonce=randomUUID().replaceAll("-",""),base=join(root,"artifacts/showcase/native/pending-studies","imported-model-replay-"+nonce);
await mkdir(join(base,"native"),{recursive:true});await writeFile(join(base,"native/scene.blend"),bytes,{flag:"wx",mode:0o600});
async function bundle(entrypoint:{kind:"blend"|"python";path:string},paths:string[]){
 const files=[];for(const path of paths){const data=await readFile(join(base,path));files.push({path,bytes:data.length,sha256:sha(data)});}
 return parseStudioSourceBundle({kind:"slopcamera.studio-source-bundle",schemaVersion:1,engine:"blender",entrypoint,files});
}
const replay=await bundle({kind:"blend",path:"native/scene.blend"},["native/scene.blend"]);
await writeFile(join(base,"replay.source.json"),JSON.stringify({engine:"blender",entrypoint:replay.entrypoint,files:replay.files.map(file=>file.path)},null,2)+"\n",{flag:"wx"});
const jobs=[];
for(let frame=0;frame<3;frame++){
 const job=parseStudioJob({...plan.job,jobId:"studio_imported_model_replay_"+frame+"_"+nonce,bundleSha256:studioSourceBundleSha256(replay),render:{...plan.job.render,startFrame:frame,endFrameExclusive:frame+1},outputs:plan.job.outputs.filter(output=>output.role==="beauty")});
 const path=join(base,"replay-"+frame+".job.json");await writeFile(path,JSON.stringify(job,null,2)+"\n",{flag:"wx"});jobs.push({path,jobId:job.jobId});
}
const paths=["inspect.py","asset_io.py","scene_checks.py","asset-facts.json","assets/field-carton.glb","textures/field-label.png","artwork.svg"];
for(const path of paths){await mkdir(dirname(join(base,path)),{recursive:true});await copyFile(join(directory,path),join(base,path));}
const inspection=await bundle({kind:"python",path:"inspect.py"},[...paths,"native/scene.blend"]);
await writeFile(join(base,"inspection.source.json"),JSON.stringify({engine:"blender",entrypoint:inspection.entrypoint,files:inspection.files.map(file=>file.path)},null,2)+"\n",{flag:"wx"});
const inspectionJob=parseStudioJob({...plan.job,jobId:"studio_imported_model_inspection_"+nonce,bundleSha256:studioSourceBundleSha256(inspection),parameters:{sourceBlendSha256:native.sha256},stage:"build",engine:{...plan.job.engine,samples:1},outputs:plan.job.outputs.filter(output=>output.role==="native-source"),limits:{timeoutSeconds:120,maximumOutputBytes:64*1024**2,maximumOutputFiles:4}});
await writeFile(join(base,"inspection.job.json"),JSON.stringify(inspectionJob,null,2)+"\n",{flag:"wx"});
await writeFile(join(base,"lineage.json"),JSON.stringify({originalJob:jobId,originalReceiptSha256:sha(receiptBytes),native,replayBundleSha256:studioSourceBundleSha256(replay),inspectionBundleSha256:studioSourceBundleSha256(inspection)},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({status:"inert-replay-recipes-written",nativeExecution:false,base,jobs,inspectionJobId:inspectionJob.jobId,next:"Bundle each source descriptor and match its SHA. Explicit scheduled plan/probe/run requires cleared storage and review. Do not confuse preparation with successful native replay."},null,2));
