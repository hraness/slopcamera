/** Reproduce the retained editorial-film -> media showroom -> orbit workflow.
 * Local browser/FFmpeg work only. Run under the host's normal render scheduler.
 * All commands retain their original JSON results; source authoring is separate.
 */
import {mkdir,statfs} from 'node:fs/promises';
const output=`artifacts/showcase/spatial/reproductions/${new Date().toISOString().replaceAll(':','-')}`;
await mkdir(output,{recursive:true});
async function run(id:string,argv:string[],renders=false):Promise<string>{
 if(renders){const capacity=await statfs('.');if(capacity.bavail*capacity.bsize<4*1024**3)throw new Error('Rendering requires at least4GiB free.');}
 const child=Bun.spawn([process.execPath,...argv],{stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 const resultPath=`${output}/${id}.json`;
 await Bun.write(resultPath,stdout);await Bun.write(`${output}/${id}.stderr.log`,stderr);
 if(exitCode!==0)throw new Error(`${id} failed (exit${exitCode}); inspect retained result. No automatic retry.`);
 return resultPath;
}
const html=await run('editorial',['apps/desktop/cli/main.ts','html','render','--input','examples/showcase/html/editorial.json','--json'],true);
await run('author-stage',['examples/showcase/spatial/author-stage.ts',html]);
const scene='artifacts/showcase/spatial/source/orbit.scene.json';
await run('check',['apps/desktop/cli/main.ts','scene','check',scene,'--json']);
const orbit=await run('orbit',['apps/desktop/cli/main.ts','scene','render',scene,'--request','artifacts/showcase/spatial/source/orbit.request.json','--json'],true);
console.log(JSON.stringify({htmlResult:html,orbitResult:orbit,authoredSource:'artifacts/showcase/spatial/source'},null,2));
