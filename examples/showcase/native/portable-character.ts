import { join,dirname,resolve,isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { mkdir,readFile,writeFile } from 'node:fs/promises'
import { parseSpatialGlb } from '../../../src/spatial-scene/gltf'
import { denseGlb } from './portable-character/dense-glb'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..'),out=join(root,'artifacts/showcase/native/character-portable',String(Date.now())),sources=join(root,'examples/showcase/native/portable-character')
const [flag,blender]=process.argv.slice(2)
if(flag!=='--blender-bin'||!blender||!isAbsolute(blender))throw new Error('Usage: bun examples/showcase/native/portable-character.ts --blender-bin <absolute-runtime-path>')
await mkdir(out,{recursive:true})
async function cli(label:string,args:string[]){const argv=[process.execPath,join(root,'apps/desktop/dist/cli/main.js'),...args,'--json'],start=Date.now(),c=Bun.spawn(argv,{cwd:root,stdout:'pipe',stderr:'pipe'});const[stdout,stderr,exitCode]=await Promise.all([new Response(c.stdout).text(),new Response(c.stderr).text(),c.exited]);await writeFile(join(out,label+'.stdout.json'),stdout);await writeFile(join(out,label+'.stderr.txt'),stderr);await writeFile(join(out,label+'.command.json'),JSON.stringify({argv,exitCode,milliseconds:Date.now()-start},null,2)+'\n');if(exitCode!==0)throw new Error(label+' failed '+stdout.slice(-1400)+' '+stderr.slice(-500));console.log(JSON.stringify({label,exitCode,milliseconds:Date.now()-start}));return JSON.parse(stdout)}
const bundle=await cli('bundle',['studio','bundle',join(sources,'export.source.json')])
const job=JSON.parse(await readFile(join(sources,'job.json'),'utf8'));job.bundleSha256=bundle.bundleSha256;job.jobId='studio_showcase_character_portable_'+Date.now();await writeFile(join(out,'bound.job.json'),JSON.stringify(job,null,2)+'\n')
const run=await cli('run',['studio','run',join(out,'bound.job.json'),'--blender-bin',blender,'--allow-trusted-code'])
const file=join(root,dirname(run.receipt.path),'outputs/character.glb'),input=await readFile(file),adapted=denseGlb(input)
await writeFile(join(out,'dense.glb'),adapted.bytes,{flag:'wx'})
await writeFile(join(out,'adaptation.json'),JSON.stringify({nativeJob:run.receipt,adapterSourceSha256:createHash('sha256').update(await readFile(join(sources,'dense-glb.ts'))).digest('hex'),...adapted.proof},null,2)+'\n')
const doc=adapted.document,joints=new Set(doc.skins.flatMap((s:any)=>s.joints)),jointClips=doc.animations.map((a:any,index:number)=>({index,name:a.name,jointChannels:a.channels.filter((c:any)=>joints.has(c.target.node)).map((c:any)=>({joint:doc.nodes[c.target.node].name,path:c.target.path}))})).filter((a:any)=>a.jointChannels.length)
await writeFile(join(out,'joint-channels.json'),JSON.stringify(jointClips,null,2)+'\n')
if(jointClips.length===0)throw new Error('No actual joint channel in exported GLB')
const model=parseSpatialGlb(adapted.bytes),samples:any[]=[]
for(const clip of jointClips){const options={metersPerUnit:1,sourceUp:'y' as const,materialMode:'source' as const,clip:{index:clip.index,offsetUs:0,playback:'loop' as const}},a=model.evaluate({...options,timeUs:0}),b=model.evaluate({...options,timeUs:2_500_000});let maximumDelta=0,changedCoordinates=0;for(let p=0;p<a.primitives.length;p++){const pa=a.primitives[p]!.positions,pb=b.primitives[p]!.positions;for(let i=0;i<pa.length;i++){const delta=Math.abs(pa[i]!-pb[i]!);maximumDelta=Math.max(maximumDelta,delta);if(delta>1e-6)changedCoordinates++}}samples.push({...clip,maximumDelta,changedCoordinates,firstBounds:a.bounds,laterBounds:b.bounds})}
if(!samples.some(sample=>sample.maximumDelta>0.05&&sample.changedCoordinates>50))throw new Error('No meaningful observed animated deformation')
const facts={profile:model.profile,rig:model.rigFacts,durations:model.clipDurationsSeconds,samples}
await writeFile(join(out,'facts.json'),JSON.stringify(facts,null,2)+'\n')
const admitted=await cli('admit',['scene','asset','admit',join(out,'dense.glb'),'--source-root',out,'--output',join(out,'asset.manifest.json'),'--asset-id','asset_character'])
console.log(JSON.stringify({profile:facts.profile,rig:facts.rig,clips:facts.durations,samples,admission:admitted.receipt}))
