/** Check this authored source or create fresh inert job documents; never render. */
import {createHash,randomUUID} from "node:crypto";
import {lstat,mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {z} from "zod";
import {parseStudioJob,parseStudioSourceBundle,planStudioJob,StudioPathSchema,studioSourceBundleSha256} from "../../../../src/studio";
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,"../../../..");
const [mode,...rest]=process.argv.slice(2);
if((mode!=="--check"&&mode!=="--write-jobs")||rest.length)throw Error("Usage: bun examples/showcase/native/cad-exploded/prepare.ts <--check|--write-jobs>");
const descriptor=z.strictObject({engine:z.literal("blender"),entrypoint:z.strictObject({kind:z.literal("python"),path:StudioPathSchema}),files:z.array(StudioPathSchema).length(5)})
 .parse(JSON.parse(await readFile(join(directory,"source.json"),"utf8")));
const files=[];
for(const path of descriptor.files){
 const physical=join(directory,path),info=await lstat(physical);
 if(!info.isFile()||info.isSymbolicLink()||info.size>1024**2)throw Error("Source must be bounded regular files");
 const bytes=await readFile(physical);
 files.push({path,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
}
const bundle=parseStudioSourceBundle({kind:"slopcamera.studio-source-bundle",schemaVersion:1,engine:"blender",entrypoint:descriptor.entrypoint,files});
const bundleSha256=studioSourceBundleSha256(bundle);
const names=(await readdir(join(directory,"jobs"))).filter(name=>name.endsWith(".json")).sort();
if(names.length!==4)throw Error("Exactly three smoke jobs and one film job are required");
const plans=[];
for(const name of names){
 const job=parseStudioJob(JSON.parse(await readFile(join(directory,"jobs",name),"utf8")));
 if(job.bundleSha256!==bundleSha256)throw Error("Source changed; review and rebind exact job templates before execution");
 plans.push({name,plan:planStudioJob({bundle,job})});
}
const preparedJobs=[];
let outputDirectory:string|null=null;
if(mode==="--write-jobs"){
 const nonce=randomUUID().replaceAll("-","");
 outputDirectory=join(root,"artifacts/showcase/native/pending-studies","cad-exploded-"+nonce);
 await mkdir(outputDirectory,{recursive:true});
 await writeFile(join(outputDirectory,"source-manifest.json"),JSON.stringify(bundle,null,2)+"\n",{flag:"wx"});
 for(const {name,plan} of plans){
  const job=parseStudioJob({...plan.job,jobId:plan.job.jobId+"_"+nonce});
  const path=join(outputDirectory,name);
  await writeFile(path,JSON.stringify(job,null,2)+"\n",{flag:"wx"});
  preparedJobs.push({path,jobId:job.jobId,frames:plan.frameCount});
 }
}
console.log(JSON.stringify({status:"source-checked-native-qualification-pending",executed:false,bundleSha256,
 sourceBytes:files.reduce((sum,file)=>sum+file.bytes,0),outputDirectory,preparedJobs,
 plans:plans.map(({name,plan})=>({name,frames:plan.frameCount,readiness:plan.readiness})),
 next:"Review source and disk capacity; explicitly bundle, plan, probe and run selected smoke jobs under the native scheduler. Do not run the film before smoke and deadline review."},null,2));
