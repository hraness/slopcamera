import {expect,test} from "bun:test";
import {mkdtemp,writeFile,symlink,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {assertFinalJob,finalJob,inspectionJob,readRegular,replayJob} from "./recipes";

const bundle="a".repeat(64),native="b".repeat(64);
test("finite final profile accepts the qualified three discrete views",()=>{
 const job=finalJob("studio_imported_model_final_views_test",bundle);
 expect(assertFinalJob(job,bundle)).toEqual(job);
 expect(job.render).toEqual({width:960,height:540,frameRate:{numerator:24,denominator:1},startFrame:0,endFrameExclusive:3});
 expect(job.limits.maximumOutputBytes).toBe(8*1024**2);
});
test("independent profile, closure, output and budget drift reject",()=>{
 const original=finalJob("studio_imported_model_final_views_test",bundle);
 const changes=[
  {engine:{...original.engine,samples:16}},{engine:{...original.engine,denoise:false}},
  {engine:{...original.engine,device:"gpu"}},{engine:{...original.engine,viewTransform:"Standard"}},
  {render:{...original.render,endFrameExclusive:2}},{render:{...original.render,startFrame:1}},
  {render:{...original.render,width:1280}},{parameters:{unreviewed:true}},
  {limits:{...original.limits,maximumOutputBytes:192*1024**2}},
  {limits:{...original.limits,timeoutSeconds:720}},{outputs:original.outputs.slice(0,1)},
  {bundleSha256:"c".repeat(64)},
 ];
 for(const change of changes)expect(()=>assertFinalJob({...original,...change},bundle)).toThrow();
});
test("replay keeps exact engine and three-frame settings, with beauty only",()=>{
 const original=finalJob("studio_imported_model_final_views_test",bundle),job=replayJob(original,"studio_replay_test",native);
 if(original.engine.engine!=="blender")throw Error("Expected Blender fixture");
 expect(job.engine).toEqual(original.engine);expect(job.render).toEqual(original.render);
 expect(job.outputs.map(o=>o.role)).toEqual(["beauty"]);expect(job.bundleSha256).toBe(native);
 const changed={...original,engine:{...original.engine,samples:16}};
 expect(()=>replayJob(changed,"studio_replay_test",native)).toThrow();
});
test("build-only inspector drops render and binds the original native digest",()=>{
 const original=finalJob("studio_imported_model_final_views_test",bundle),job=inspectionJob(original,"studio_inspection_test",bundle,native);
 if(job.engine.engine!=="blender")throw Error("Expected Blender fixture");
 expect("render" in job).toBe(false);expect(job.stage).toBe("build");
 expect(job.parameters).toEqual({sourceBlendSha256:native});
 expect(job.engine.samples).toBe(1);expect(job.engine.denoise).toBe(false);
 expect(job.outputs.map(o=>o.role)).toEqual(["native-source"]);
 expect(job.limits).toEqual({timeoutSeconds:120,maximumOutputBytes:4*1024**2,maximumOutputFiles:8});
 expect(()=>inspectionJob(original,"studio_inspection_test",bundle,"bad")).toThrow();
 expect(original.render?.endFrameExclusive).toBe(3);
});
test("bounded file input refuses oversize and symlink paths",async()=>{
 const root=await mkdtemp(join(tmpdir(),"slopcamera-imported-recipe-"));
 try{
  const file=join(root,"source"),link=join(root,"link");await writeFile(file,"retained");await symlink(file,link);
  expect((await readRegular(file,8)).toString()).toBe("retained");
  await expect(readRegular(file,7)).rejects.toThrow();await expect(readRegular(link,8)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
