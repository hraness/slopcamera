import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const source='examples/showcase/diagram/source-to-film.diagram.json'
const out='artifacts/showcase/workflows'
await mkdir(out,{recursive:true})
for(const [kind,script] of [['imperative','examples/render-workflow.ts'],['declarative','examples/declarative-workflow.ts']] as const){
 const process=Bun.spawn([Bun.argv[0]!,script,source,`${out}/${kind}`],{stdout:'pipe',stderr:'inherit'})
 const result=await new Response(process.stdout).text()
 const code=await process.exited
 await writeFile(`${out}/${kind}.json`,result)
 assert.equal(code,0,`${kind} workflow failed`)
}

const child=Bun.spawn([Bun.argv[0]!,'src/cli.ts','mcp','--root',process.cwd()],{stdin:'pipe',stdout:'pipe',stderr:'inherit'})
const reader=child.stdout.getReader(), decoder=new TextDecoder()
let pending='',received=0
const responses:unknown[]=[]
async function response(id:number){
 for(;;){
  const newline=pending.indexOf('\n')
  if(newline>=0){
   const value=JSON.parse(pending.slice(0,newline));pending=pending.slice(newline+1)
   assert.equal(value.id,id,'Unexpected protocol response')
   assert.equal(value.error,undefined,'MCP protocol error')
   responses.push(value)
   return value.result
  }
  const next=await reader.read();assert.equal(next.done,false,'MCP closed before response')
  received+=next.value!.length;assert.ok(received<1024*1024,'MCP response bound')
  pending+=decoder.decode(next.value,{stream:true})
 }
}
function send(value:unknown){child.stdin.write(JSON.stringify(value)+'\n')}
const deadline=setTimeout(()=>child.kill('SIGTERM'),60_000)
try{
 send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'slopcamera-workflow-example',version:'1.0.0'}}})
 await response(1)
 send({jsonrpc:'2.0',method:'notifications/initialized'})
 send({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'check_diagram',arguments:{path:source}}})
 const checked=await response(2);assert.notEqual(checked.isError,true)
 send({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'render_diagram',arguments:{path:source,out_dir:`${out}/mcp`}}})
 const rendered=await response(3);assert.notEqual(rendered.isError,true)
 child.stdin.end()
 while(!(await reader.read()).done){}
 assert.equal(await child.exited,0,'MCP did not exit cleanly')
}finally{
 clearTimeout(deadline)
 if(child.exitCode===null){child.stdin.end();child.kill('SIGTERM');await child.exited}
 reader.releaseLock()
}
await writeFile(`${out}/mcp.json`,JSON.stringify(responses,null,2)+'\n')
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
const pixels=await Promise.all(['imperative','declarative','mcp'].map(async kind=>({kind,sha256:hash(await readFile(`${out}/${kind}/source-to-film.light.png`))})))
assert.equal(new Set(pixels.map(p=>p.sha256)).size,1,'The three interfaces disagree on their shared PNG output')
console.log(JSON.stringify({source,interfaces:pixels,outputDirectory:out}))
