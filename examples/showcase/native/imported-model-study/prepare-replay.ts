/** Bind a successful three-view import to fresh inert replay/inspector recipes. */
import {randomUUID} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {parseStudioSourceBundle,studioSourceBundleSha256,planStudioJob} from "../../../../src/studio";
import {inspectionJob,readRegular,replayJob,sha,successfulOriginal} from "./recipes";

const directory=dirname(fileURLToPath(import.meta.url)),repository=resolve(directory,"../../../..");
const [jobId,...rest]=process.argv.slice(2);
if(!jobId||rest.length)throw Error("Usage: bun examples/showcase/native/imported-model-study/prepare-replay.ts <successful-final-views-job-id>");
process.umask(0o077);
const original=await successfulOriginal(repository,directory,jobId);
const native=await readRegular(join(original.root,"outputs",original.native.path),8*1024**2);
const inspectionPaths=["inspect.py","asset_io.py","scene_checks.py","asset-facts.json","assets/field-carton.glb","textures/field-label.png","artwork.svg"];
// Read every input before creating a destination. Replay physically contains only the native file.
const inspectionInputs=[];for(const path of inspectionPaths)inspectionInputs.push({path,bytes:await readRegular(join(directory,path),1024**2)});
const nonce=randomUUID().replaceAll("-",""),base=join(repository,"artifacts/showcase/native/pending-studies","imported-model-replay-"+nonce);
await mkdir(base,{recursive:true,mode:0o700});
async function save(path:string,bytes:Uint8Array){await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,bytes,{flag:"wx",mode:0o600});}
const json=(value:unknown)=>Buffer.from(JSON.stringify(value,null,2)+"\n");
const records=[];
for(const name of ["replay","inspection"] as const){
 const inputs=name==="replay"?[{path:"native/scene.blend",bytes:native}]:[...inspectionInputs,{path:"native/scene.blend",bytes:native}];
 const sourceRoot=join(base,name+"-source");
 for(const input of inputs)await save(join(sourceRoot,input.path),input.bytes);
 const entrypoint={kind:name==="replay"?"blend" as const:"python" as const,path:name==="replay"?"native/scene.blend":"inspect.py"};
 const bundle=parseStudioSourceBundle({kind:"slopcamera.studio-source-bundle",schemaVersion:1,engine:"blender",entrypoint,files:inputs.map(({path,bytes})=>({path,bytes:bytes.length,sha256:sha(bytes)}))});
 const bundleSha256=studioSourceBundleSha256(bundle),id="studio_imported_model_"+name+"_"+nonce;
 const job=name==="replay"?replayJob(original.job,id,bundleSha256):inspectionJob(original.job,id,bundleSha256,original.native.sha256);
 const sourcePath=join(base,name+".source.json"),jobPath=join(base,name+".job.json");
 await save(sourcePath,json({engine:"blender",entrypoint,files:inputs.map(i=>i.path)}));
 await save(join(base,name+".bundle.json"),json(bundle));await save(jobPath,json(job));
 const plan=planStudioJob({bundle,job});
 records.push({name,sourceRoot,sourcePath,jobPath,jobId:id,bundleSha256,sourceBytes:inputs.reduce((sum,i)=>sum+i.bytes.length,0),frames:plan.frameCount});
}
await save(join(base,"lineage.json"),json({originalJob:jobId,originalReceiptSha256:original.receiptSha256,originalBundleSha256:original.job.bundleSha256,runtimeSha256:original.plan.runtimeSha256,native:original.native,records}));
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
console.log(JSON.stringify({status:"inert-replay-recipes-written",executed:false,base,records,aggregateStudyBudgetBytes:192*1024**2,nextCommands:records.flatMap(r=>[
 "slopcamera studio bundle "+quote(r.sourcePath)+" --source-root "+quote(r.sourceRoot)+" --json",
 "slopcamera studio plan "+quote(r.jobPath)+" --json",
 "slopcamera studio probe "+quote(r.jobPath)+" --blender-bin /absolute/path/to/Blender --json",
 "slopcamera studio run "+quote(r.jobPath)+" --allow-trusted-code --blender-bin /absolute/path/to/Blender --json",
 "slopcamera studio inspect "+r.jobId+" --json"]),comparisonCommand:"bun examples/showcase/native/imported-model-study/compare-pixels.ts "+jobId+" "+records[0]!.jobId,next:"Run and collect replay first; pixel comparison must pass before the separately reviewed inspector. Inspect all original/replay frames. Preparation never launches an engine."},null,2));
