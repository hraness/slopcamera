/** Validate the authored source or write one fresh inert three-view job. Never render. */
import {createHash,randomUUID} from "node:crypto";
import {lstat,mkdir,readFile,readdir,writeFile} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {z} from "zod";
import {parseStudioJob,parseStudioSourceBundle,planStudioJob,StudioPathSchema,studioSourceBundleSha256} from "../../../../src/studio";
import {assertFinalJob,sourcePaths} from "./recipes";
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,"../../../..");
process.umask(0o077);
const [argument,...rest]=process.argv.slice(2),mode=argument??"--write-jobs";
if((mode!=="--check"&&mode!=="--write-jobs")||rest.length)throw Error("Usage: bun examples/showcase/native/imported-model-study/prepare.ts [--check|--write-jobs]");
const sha=(bytes:Uint8Array)=>createHash("sha256").update(bytes).digest("hex");
const descriptor=z.strictObject({engine:z.literal("blender"),entrypoint:z.strictObject({kind:z.literal("python"),path:z.literal("scene.py")}),files:z.array(StudioPathSchema).length(8)})
 .parse(JSON.parse(await readFile(join(directory,"source.json"),"utf8")));
if(JSON.stringify(descriptor.files)!==JSON.stringify(sourcePaths))throw Error("Exact eight-file source closure required");
const allFiles:{path:string;bytes:number;sha256:string}[]=[];
async function walk(relative:string){
 const physical=join(directory,relative),info=await lstat(physical);
 if(info.isSymbolicLink())throw Error("Symlink in authored source");
 if(info.isDirectory()){for(const name of (await readdir(physical)).sort())await walk(relative?relative+"/"+name:name);return;}
 if(!info.isFile()||info.nlink!==1||info.size>1024**2)throw Error("Source must be bounded regular files");
 const bytes=await readFile(physical);allFiles.push({path:relative,bytes:bytes.length,sha256:sha(bytes)});
}
await walk("");
const sourceBytes=allFiles.reduce((sum,file)=>sum+file.bytes,0);
if(sourceBytes>4*1024**2)throw Error("Authored assets/source exceed the 4 MiB cap");
const files=descriptor.files.map(path=>{const found=allFiles.find(file=>file.path===path);if(!found)throw Error("Missing source "+path);return found;});
const bundle=parseStudioSourceBundle({kind:"slopcamera.studio-source-bundle",schemaVersion:1,engine:"blender",entrypoint:descriptor.entrypoint,files}),bundleSha256=studioSourceBundleSha256(bundle);
const expected=["final-views.json"];
if(JSON.stringify((await readdir(join(directory,"jobs"))).sort())!==JSON.stringify(expected))throw Error("Exactly one final-three-view template required");
const plans=[];
for(const name of expected){
 const job=assertFinalJob(JSON.parse(await readFile(join(directory,"jobs",name),"utf8")),bundleSha256);
 plans.push({name,plan:planStudioJob({bundle,job})});
}
const facts=z.object({model:z.object({bytes:z.number(),sha256:z.string()}),texture:z.object({sha256:z.string(),decodedRgbSha256:z.string()}),authoring:z.object({generatorSha256:z.string()})}).parse(JSON.parse(await readFile(join(directory,"asset-facts.json"),"utf8")));
if(facts.authoring.generatorSha256!==allFiles.find(file=>file.path==="author-assets.ts")?.sha256)throw Error("Original asset generator identity changed");
const png=await readFile(join(directory,"textures/field-label.png"));
if(sha(png)!==facts.texture.sha256||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error("PNG identity/header changed");
const chunks:string[]=[];
for(let offset=8;offset<png.length;){
 const length=png.readUInt32BE(offset),type=png.toString("latin1",offset+4,offset+8);if(offset+12+length>png.length||!["IHDR","IDAT","IEND","pHYs"].includes(type))throw Error("PNG is outside authored metadata-free profile");
 chunks.push(type);offset+=length+12;if(type==="IEND"&&offset!==png.length)throw Error("PNG has trailing bytes");
}
const raw=await sharp(png,{limitInputPixels:2048*2048}).removeAlpha().raw().toBuffer({resolveWithObject:true});
if(raw.info.width!==2048||raw.info.height!==2048||raw.info.channels!==3||sha(raw.data)!==facts.texture.decodedRgbSha256)throw Error("Original decoded RGB pixels changed");
const glb=await readFile(join(directory,"assets/field-carton.glb"));if(glb.length!==facts.model.bytes||sha(glb)!==facts.model.sha256)throw Error("GLB identity changed");
const jsonLength=glb.readUInt32LE(12),document=JSON.parse(glb.toString("utf8",20,20+jsonLength)) as {images:{bufferView:number}[];bufferViews:{byteOffset:number;byteLength:number}[]};
const view=document.bufferViews[document.images[0]!.bufferView]!;
if(!glb.subarray(28+jsonLength+view.byteOffset,28+jsonLength+view.byteOffset+view.byteLength).equals(png))throw Error("Embedded PNG bytes differ from original");
let outputDirectory:string|null=null;const preparedJobs=[];
if(mode==="--write-jobs"){
 const nonce=randomUUID().replaceAll("-","");outputDirectory=join(root,"artifacts/showcase/native/pending-studies","imported-model-"+nonce);
 await mkdir(outputDirectory,{recursive:true,mode:0o700});await writeFile(join(outputDirectory,"source-manifest.json"),JSON.stringify(bundle,null,2)+"\n",{flag:"wx",mode:0o600});
 for(const {name,plan}of plans){const job=parseStudioJob({...plan.job,jobId:"studio_imported_model_final_views_"+nonce}),path=join(outputDirectory,name);await writeFile(path,JSON.stringify(job,null,2)+"\n",{flag:"wx",mode:0o600});preparedJobs.push({path,jobId:job.jobId});}
}
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
console.log(JSON.stringify({status:"source-checked-execution-separate",executed:false,bundleSha256,bundleBytes:files.reduce((sum,file)=>sum+file.bytes,0),authoredBytes:sourceBytes,sourceFiles:allFiles,texture:{chunks,decodedRgbSha256:sha(raw.data),embeddedPngByteIdentical:true},outputDirectory,preparedJobs,plans:plans.map(({name,plan})=>({name,frames:plan.frameCount,readiness:plan.readiness})),aggregateStudyBudgetBytes:192*1024**2,nextCommands:preparedJobs.flatMap(({path,jobId})=>[
 "slopcamera studio bundle examples/showcase/native/imported-model-study/source.json --json",
 `slopcamera studio plan ${quote(path)} --json`,
 `slopcamera studio probe ${quote(path)} --blender-bin /absolute/path/to/Blender --json`,
 `slopcamera studio run ${quote(path)} --allow-trusted-code --blender-bin /absolute/path/to/Blender --json`,
 `slopcamera studio inspect ${jobId} --json`,
 `bun examples/showcase/native/imported-model-study/prepare-replay.ts ${jobId}`]),next:"Match the bundle hash and inspect the plan/probe before explicit scheduled execution. The 192 MiB study budget includes retained, working and future output bytes; it is not each job's output cap."},null,2));
