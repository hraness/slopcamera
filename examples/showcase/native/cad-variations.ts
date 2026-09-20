/** Rebuild a width/height variation, verify a STEP round-trip, and bind its Blender presentation. */
import { join,dirname,resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises'
import { parseSpatialGlb } from '../../../src/spatial-scene/gltf'
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../../..'),base=join(root,'artifacts/showcase/native/cad'),sources=join(root,'examples/showcase/native/cad')
const [flag,python]=process.argv.slice(2)
if(flag!=='--python'||!python)throw new Error('Usage: bun examples/showcase/native/cad-variations.ts --python <absolute-runtime-path>')
await mkdir(base,{recursive:true})
async function cli(label:string,args:string[]) {
 const argv=[process.execPath,join(root,'apps/desktop/dist/cli/main.js'),...args,'--json'],start=Date.now()
 const c=Bun.spawn(argv,{cwd:root,stdout:'pipe',stderr:'pipe'});const[stdout,stderr,exitCode]=await Promise.all([new Response(c.stdout).text(),new Response(c.stderr).text(),c.exited])
 await writeFile(join(base,label+'.stdout.json'),stdout);await writeFile(join(base,label+'.stderr.txt'),stderr);await writeFile(join(base,label+'.command.json'),JSON.stringify({argv,exitCode,milliseconds:Date.now()-start},null,2)+'\n')
 if(exitCode!==0)throw new Error(label+' failed '+stdout.slice(-1500)+' '+stderr.slice(-1500))
 console.log(JSON.stringify({label,exitCode,milliseconds:Date.now()-start}));return JSON.parse(stdout)
}
const baseline=JSON.parse(await readFile(join(base,'run.stdout.json'),'utf8'))
if(baseline.document.state!=='succeeded'||baseline.document.custody!=='closed')throw new Error('Baseline must succeed and close')
const job=JSON.parse(await readFile(join(sources,'job.json'),'utf8'))
job.bundleSha256=baseline.document.bundleSha256;job.jobId='studio_showcase_cad_wide_'+Date.now();job.parameters={widthMm:132,heightMm:68}
await writeFile(join(base,'wide.job.json'),JSON.stringify(job,null,2)+'\n')
const wide=await cli('wide-run',['studio','run',join(base,'wide.job.json'),'--allow-trusted-code','--python',python])
const roundtrip=join(base,'roundtrip-source');await mkdir(roundtrip,{recursive:true});await copyFile(join(sources,'import_step.py'),join(roundtrip,'scene.py'))
function retainedJobRoot(result:any) {
 if(!/^[a-zA-Z0-9_-]{1,160}$/.test(result.document?.jobId??''))throw new Error('Invalid retained job identity')
 const expected=join(root,'artifacts/slopcamera/private/studio/jobs',result.document.jobId)
 if(resolve(root,result.receipt.path)!==join(expected,'receipt.json'))throw new Error('Receipt path does not match its retained job')
 return expected
}
const baselineRoot=join(retainedJobRoot(baseline),'outputs');await copyFile(join(baselineRoot,'model.step'),join(roundtrip,'model.step'))
await writeFile(join(roundtrip,'source.json'),JSON.stringify({engine:'cadquery',entrypoint:{kind:'python',path:'scene.py'},files:['scene.py','model.step']},null,2)+'\n')
const bundle=await cli('roundtrip-bundle',['studio','bundle',join(roundtrip,'source.json')]);job.bundleSha256=bundle.bundleSha256;job.jobId='studio_showcase_cad_roundtrip_'+Date.now();job.parameters={input:'model.step'}
await writeFile(join(base,'roundtrip.job.json'),JSON.stringify(job,null,2)+'\n')
const imported=await cli('roundtrip-run',['studio','run',join(base,'roundtrip.job.json'),'--allow-trusted-code','--python',python])
async function facts(result:any){return JSON.parse(await readFile(join(retainedJobRoot(result),'working/result.json'),'utf8'))}
const first=await facts(baseline),second=await facts(imported),variant=await facts(wide)
const a=first.bounds[0],b=second.bounds[0],v=variant.bounds[0],relativeVolumeError=Math.abs(a.volume-b.volume)/a.volume
if(!a.valid||!b.valid||!v.valid||!Number.isFinite(relativeVolumeError)||v.volume<=0||a.solids!==b.solids||relativeVolumeError>0.00001)throw new Error('STEP round trip changed solid validity/count/volume')
await writeFile(join(base,'cad-observations.json'),JSON.stringify({baseline:first,wide:variant,roundtrip:second,relativeVolumeError},null,2)+'\n')
const preview=join(base,'preview-source');await mkdir(preview,{recursive:true})
await copyFile(join(sources,'preview.py'),join(preview,'scene.py'));await copyFile(join(sources,'studio_scene.py'),join(preview,'studio_scene.py'));await copyFile(join(baselineRoot,'model.glb'),join(preview,'baseline.glb'));await copyFile(join(retainedJobRoot(wide),'outputs/model.glb'),join(preview,'wide.glb'))
const measurements=[]
for(const [name,expected] of [['baseline',{min:[-.05,-.004,-.032],max:[.05,.06,.032]}],['wide',{min:[-.066,-.004,-.032],max:[.066,.072,.032]}]] as const){
 const model=parseSpatialGlb(await readFile(join(preview,name+'.glb')))
 const geometry=model.evaluate({metersPerUnit:1,sourceUp:'y',materialMode:'source',timeUs:0})
 const maximumCoordinateErrorMeters=Math.max(...(['min','max'] as const).flatMap(key=>expected[key].map((value,index)=>Math.abs(value-geometry.bounds[key][index]!))))
 if(maximumCoordinateErrorMeters>1e-7)throw new Error('CAD GLB units or axis conversion differs from expected dimensions')
 measurements.push({name,profile:model.profile,bounds:geometry.bounds,expectedMetersYUp:expected,maximumCoordinateErrorMeters,primitiveCount:geometry.primitives.length})
}
await writeFile(join(base,'glb-measurements.json'),JSON.stringify(measurements,null,2)+'\n')
await writeFile(join(preview,'source.json'),JSON.stringify({engine:'blender',entrypoint:{kind:'python',path:'scene.py'},files:['scene.py','studio_scene.py','baseline.glb','wide.glb']},null,2)+'\n')
const previewBundle=await cli('preview-bundle',['studio','bundle',join(preview,'source.json')])
const previewJob=JSON.parse(await readFile(join(root,'examples/showcase/native/product/job.json'),'utf8'));previewJob.bundleSha256=previewBundle.bundleSha256;previewJob.jobId='studio_showcase_cad_preview_'+Date.now()
await writeFile(join(base,'preview.job.json'),JSON.stringify(previewJob,null,2)+'\n');console.log(JSON.stringify({relativeVolumeError,previewJob:join(base,'preview.job.json')}))
