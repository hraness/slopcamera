/** Compare original masters to the blend-only replay. No resizing or engine calls. */
import assert from "node:assert/strict";
import {writeFile} from "node:fs/promises";
import {join,dirname,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";
import {parseStudioPlan,parseStudioSourceBundle,studioSourceBundleSha256,validateStudioReceipt} from "../../../../src/studio";
import {readRegular,replayJob,sha,successfulOriginal} from "./recipes";

export function measure(a:Uint8Array,b:Uint8Array){
 assert(a.length>0&&a.length===b.length);let absolute=0,above8=0,maximum=0;
 for(let i=0;i<a.length;i++){const d=Math.abs(a[i]!-b[i]!);absolute+=d;if(d>8)above8++;maximum=Math.max(maximum,d);}
 return {channels:a.length,totalAbsoluteChannelError:absolute,meanAbsoluteChannelError:absolute/a.length,maximumChannelError:maximum,channelsAbove8:above8,above8Fraction:above8/a.length,accepted:absolute*2<=a.length&&above8*1000<=a.length};
}
if(import.meta.main){
 process.umask(0o077);
 const [originalId,replayId,...rest]=process.argv.slice(2);
 assert(originalId&&replayId&&rest.length===0,"Usage: bun examples/showcase/native/imported-model-study/compare-pixels.ts <original-job-id> <replay-job-id>");
 assert.match(replayId,/^studio_imported_model_(?:packed_)?replay_[a-f0-9]{32}$/u);
 const directory=dirname(fileURLToPath(import.meta.url)),repository=resolve(directory,"../../../..");
 const original=await successfulOriginal(repository,directory,originalId),root=join(repository,"artifacts/slopcamera/private/studio/jobs",replayId);
 const planBytes=await readRegular(join(root,"plan.json"),1024**2),receiptBytes=await readRegular(join(root,"receipt.json"),1024**2);
 const plan=parseStudioPlan(JSON.parse(planBytes.toString())),receipt=validateStudioReceipt({plan,receipt:JSON.parse(receiptBytes.toString())});
 assert(receipt.state==="succeeded"&&receipt.custody==="closed"&&receipt.exitCode===0);assert.equal(receipt.jobId,replayId);
 const bundle=parseStudioSourceBundle({kind:"slopcamera.studio-source-bundle",schemaVersion:1,engine:"blender",entrypoint:{kind:"blend",path:"native/scene.blend"},files:[{path:"native/scene.blend",bytes:original.native.bytes,sha256:original.native.sha256}]});
 assert.equal(studioSourceBundleSha256(plan.bundle),studioSourceBundleSha256(bundle));
 assert.deepEqual(plan.job,replayJob(original.job,replayId,studioSourceBundleSha256(bundle)));
 assert.equal(plan.runtimeSha256,original.plan.runtimeSha256);
 const frames=receipt.outputs.slice().sort((a,b)=>a.frame!-b.frame!);
 assert.deepEqual(frames.map(o=>[o.outputId,o.frame,o.path]),[0,1,2].map(i=>["beauty",i,`frames/${String(i).padStart(6,"0")}.png`]));
 async function decode(jobRoot:string,row:{path:string;bytes:number;sha256:string}){
  const bytes=await readRegular(join(jobRoot,"outputs",row.path),8*1024**2);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);
  const options={limitInputPixels:960*540,sequentialRead:true,failOn:"warning" as const};
  const meta=await sharp(bytes,options).metadata();assert.equal(meta.width,960);assert.equal(meta.height,540);assert.equal(meta.channels,3);assert.equal(meta.depth,"uchar");assert.equal(meta.hasAlpha,false);
  const {data,info}=await sharp(bytes,options).raw().toBuffer({resolveWithObject:true});assert.equal(info.width,960);assert.equal(info.height,540);assert.equal(info.channels,3);assert.equal(data.length,960*540*3);
  return {data,identity:{fileSha256:row.sha256,bytes:row.bytes,pixelSha256:sha(data),width:960,height:540,channels:3}};
 }
 const compared=[];
 for(let frame=0;frame<3;frame++){const a=await decode(original.root,original.frames[frame]!),b=await decode(root,frames[frame]!);compared.push({frame,original:a.identity,replay:b.identity,...measure(a.data,b.data)});}
 const report={kind:"slopcamera.showcase.texture-replay-pixel-comparison",thresholds:{meanAbsoluteChannelErrorMaximum:0.5,channelDifferenceThreshold:8,aboveThresholdFractionMaximum:0.001},originalJob:originalId,replayJob:replayId,originalReceiptSha256:original.receiptSha256,replayReceiptSha256:sha(receiptBytes),runtimeSha256:plan.runtimeSha256,decoder:{sharp:sharp.versions.sharp,vips:sharp.versions.vips},resized:false,frames:compared,accepted:compared.every(f=>f.accepted),inspectorQualificationSeparate:true};
 const output=join(repository,"artifacts/showcase/native/pending-studies",replayId+"-pixel-comparison.json");
 await writeFile(output,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});console.log(JSON.stringify({output,...report},null,2));
 if(!report.accepted)process.exitCode=1;
}
