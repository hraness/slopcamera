import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

// An original dense halftone fixture with16,384 separated regions. This is a
// limit specimen: a rejected trace is the intended useful observation.
const out='artifacts/showcase/vector-detail'
await mkdir(out,{recursive:true})
const width=1024, height=1024
const pixels=Buffer.alloc(width*height*3,255)
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
 if(x%8>=2&&x%8<6&&y%8>=2&&y%8<6){const i=(y*width+x)*3;pixels[i]=28;pixels[i+1]=53;pixels[i+2]=87}
}
await sharp(pixels,{raw:{width,height,channels:3}}).png().toFile(`${out}/dense-halftone.png`)
const child=Bun.spawn([process.execPath,'apps/desktop/cli/main.ts','image','vectorize',`${out}/dense-halftone.png`,'--output',`${out}/dense-halftone.svg`,'--json'],{stdout:'pipe',stderr:'pipe'})
const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited])
await writeFile(`${out}/result.json`,JSON.stringify({exitCode,stdout,stderr},null,2)+'\n')
console.log(JSON.stringify({exitCode,stdout:stdout.slice(0,2000),stderr:stderr.slice(-500)}))
