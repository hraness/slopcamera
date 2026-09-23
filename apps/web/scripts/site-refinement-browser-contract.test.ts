import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { parseRefinementRequest, parseRefinementPhase, refinementCaseFailure, parseRefinementCaseFailure,
  refinementCases, refinementDeadline, projectRefinementPaint, projectRefinementHeroPosition, compareRefinementHeroCopies } from "./site-refinement-browser-contract"
import { refinementScope, refinementCopyScope, refinementBaselineProfile, refinementBaselineRevision, refinementBaselineTree,
  refinementIntegratedRevision, refinementCopyElementKeys, refinementInstallCommand } from "./site-refinement-profile"
import { refinementIslands } from "./site-refinement-fixtures"
import { assertRefinementBaselineManifest } from "./verify-site-marketing"
import { siteShellCases, siteShellDeadlineMs, type ShellElement } from "./site-shell-browser-contract"
import { siteCopyCases, siteCopyDeadlineMs } from "./site-copy-browser-contract"
const css=`/assets/site-${"a".repeat(64)}.css`
const payload=(origin:string)=>({origin,resources:["/","/404.html","/assets/foundation.css",css,"/cells.svg","/grain.svg",...Array.from({length:14},(_,i)=>`/font-${i}.woff2`)].sort(),stylesheets:["/assets/foundation.css",css],finalCss:css})
const request=(scope:typeof refinementScope|typeof refinementCopyScope=refinementScope)=>parseRefinementRequest({schemaVersion:1,token:"12345678-1234-1234-1234-123456789abc",scope,baselineProfile:refinementBaselineProfile,appDirectory:"/work/apps/web",chromeExecutable:"/work/chrome",endpoint:"ws://127.0.0.1:54321/devtools/browser/1234-abcd",current:payload("http://127.0.0.1:54322"),baseline:payload("http://127.0.0.1:54323"),fieldAssets:["/grain.svg","/cells.svg"]})
const result=()=>({schemaVersion:1,token:request().token,scope:refinementScope,baselineProfile:refinementBaselineProfile,sequence:2,kind:"result",node:"24.18.1",playwright:"1.62.0",browser:"145.0.0.0",cases:siteShellCases.map(item=>item.name),comparison:"unchanged-shell-with-closed-refinement-islands",closed:true,negativeControls:["/-final-css","/-foundation-css","/404.html-final-css"],observations:siteShellCases.map(s=>({name:s.name,islands:s.route==="/"?11:0,codeBlocks:s.route==="/"?6:0,interfaceRows:s.route==="/"?4:0,sourceDisclosure:s.route==="/",material:s.route==="/",foundationRestored:s.route==="/"&&s.width===1440&&s.theme==="system"&&s.system==="light",transparencyRestored:s.route==="/"&&(s.width===390||s.width===1440)&&s.theme!=="system"&&s.direction===undefined&&!s.coarse&&s.forced==="none"}))})
test("explicit refinement identities retain the original complete separate matrices and deadlines",()=>{
 expect(refinementCases(refinementScope)).toBe(siteShellCases);expect(siteShellCases).toHaveLength(76)
 expect(refinementCases(refinementCopyScope)).toBe(siteCopyCases);expect(siteCopyCases).toHaveLength(8)
 expect(refinementDeadline(refinementScope)).toBe(siteShellDeadlineMs);expect(siteShellDeadlineMs).toBe(720000)
 expect(refinementDeadline(refinementCopyScope)).toBe(siteCopyDeadlineMs);expect(siteCopyDeadlineMs).toBe(180000)
 expect(refinementCopyElementKeys).toHaveLength(18);expect(new Set(refinementCopyElementKeys).size).toBe(18)
 for(const scope of [refinementScope,refinementCopyScope] as const)expect(request(scope).scope).toBe(scope)
 for(const mutation of [{scope:"marketing-lantern-v2"},{baselineProfile:"install-family-ed48ebb3-v1"},{scope:"unknown"},{extra:true},{fieldAssets:["https://remote/grain.svg","/cells.svg"]}])expect(()=>parseRefinementRequest({...request(),...mutation})).toThrow()
})
test("acceptance refuses missing cases, observations, restoration or false cleanup",()=>{
 expect(parseRefinementPhase(result(),2,request())).toEqual(result())
 for(const mutation of [{cases:result().cases.slice(1)},{closed:false},{comparison:"equivalent"},{negativeControls:["/-final-css"]},{observations:result().observations.slice(1)},{nativeBrowserZoom:true},{scope:refinementCopyScope}])expect(()=>parseRefinementPhase({...result(),...mutation},2,request())).toThrow()
 for(const field of ["islands","codeBlocks","interfaceRows","sourceDisclosure","material","foundationRestored","transparencyRestored"]){const observations=structuredClone(result().observations);const at=field==="foundationRestored"?observations.findIndex(item=>item.foundationRestored):field==="transparencyRestored"?observations.findIndex(item=>item.transparencyRestored):0;(observations[at] as unknown as Record<string,unknown>)[field]=false;expect(()=>parseRefinementPhase({...result(),observations},2,request())).toThrow()}
})
test("reviewed baseline binds the independent clean revision and integrated equivalence",()=>{
 const snapshot={inputs:[],artifacts:[],files:new Map(),stylesheets:["/foundation.css",css]}
 const manifest={schemaVersion:4,baselineProfile:refinementBaselineProfile,checkoutRevision:refinementBaselineRevision,sourceRevision:refinementBaselineRevision,sourceTree:refinementBaselineTree,integratedRevision:refinementIntegratedRevision,inputs:[],artifacts:[]}
 expect(()=>assertRefinementBaselineManifest(manifest,snapshot)).not.toThrow()
 for(const mutation of [{sourceTree:"a".repeat(40)},{checkoutRevision:refinementIntegratedRevision},{sourceRevision:refinementIntegratedRevision},{integratedRevision:refinementBaselineRevision},{schemaVersion:3},{artifacts:[{path:"index.html"}]},{extra:true}])expect(()=>assertRefinementBaselineManifest({...manifest,...mutation},snapshot)).toThrow()
})
test("failure receipts retain only the completed paired prefix of their own scope",()=>{
 for(const scope of [refinementScope,refinementCopyScope] as const)for(let i=0;i<refinementCases(scope).length;i++){
  const cases=refinementCases(scope),failure=refinementCaseFailure(request(scope),cases[i]!.name,"comparison",cases.slice(0,i).map(item=>item.name),new AggregateError([Error("specific failure")],"wrapper"))
  expect(String(failure.error)).toContain("specific failure");expect(parseRefinementCaseFailure(failure,request(scope))).toEqual(failure)
  for(const mutation of [{accepted:true},{completed:true},{scope:"install-copy"},{scenario:"unknown"},{comparedCases:[...cases.slice(0,i).map(item=>item.name),cases[i]!.name]}])expect(()=>parseRefinementCaseFailure({...failure,...mutation},request(scope))).toThrow()
 }
})
test("paint projection asserts only owned positive properties and preserves unlisted differences",()=>{
 const item:ShellElement={key:".topbar[0]",rect:[0,0,100,72],text:"Header",semantics:{role:null},styles:{"border-bottom-color":"rgb(2, 2, 2)","box-shadow":"none",width:"100px",color:"rgb(1, 1, 1)"}}
 const old={...item,styles:{...item.styles,"border-bottom-color":"rgb(3, 3, 3)"}},paint={".topbar":{"border-bottom-color":"rgb(2, 2, 2)"}}
 expect(projectRefinementPaint(item,old,paint)).toEqual(old)
 expect(()=>projectRefinementPaint({...item,styles:{...item.styles,"border-bottom-color":"red"}},old,paint)).toThrow()
 expect(projectRefinementPaint({...item,styles:{...item.styles,color:"red"}},old,paint).styles.color).toBe("red")
})
test("literal fixtures admit only the six reviewed authored islands",()=>{
 expect(Object.keys(refinementIslands)).toEqual([".hraness-marketing-hero__boundary",".hraness-marketing-proof-frame","#install","#page-title",".hraness-marketing-hero__summary","#questions","#closing","#workflow","#interfaces","#design",".hraness-marketing-facts"])
 expect(refinementInstallCommand.split("\n")).toEqual(["bun add --global https://github.com/hraness/slopcamera/releases/download/v3.3.6/hraness-slopcamera-3.3.6.tgz","slopcamera skill install --target agents"])
 const fixture=Object.values(refinementIslands).join("")
 expect(fixture).not.toMatch(/\sstyle=/u);expect(fixture).toContain('syntax-code language-typescript');expect(fixture).toContain("docs/how-to/use-current-source.md")
 expect(fixture).toContain("Illustrative session · included starter");expect(fixture).not.toContain("Start a new source checkout")
})
test("refinement driver preserves browser pin and shared parent custody gates",async()=>{
 const [parent,driver]=await Promise.all([readFile(new URL("./verify-site-marketing.ts",import.meta.url),"utf8"),readFile(new URL("./site-refinement-browser-driver.mjs",import.meta.url),"utf8")])
 for(const boundary of ["assertWorkerInputsUnchanged(inputs, after)","collectProtocol(protocolDirectory, observation)","workerAbsent && chromeAbsent","servers.every(server => server.closed)","candidateIdentity(actualApp), candidate","performance.now() < deadline"])expect(parent).toContain(boundary)
 for(const boundary of ['manifest.version, "1.62.0"','realpath(chromium.executablePath()), request.chromeExecutable',"closeOwnedPreviewBrowser","Both underlying case settlements","parsePhase(result, 2, request)","publishWorkerPhase(directory, 2, result)"])expect(driver).toContain(boundary)
})

test("copy acceptance binds both different commands and exact 18/22 inventories to real port evidence",()=>{
 const old="bun apps/desktop/dist/cli/main.js skill install --target agents"
 const ports=(command:string)=>({write:"success",fallback:"throw",writes:Array.from({length:5},()=>command),fallbacks:Array.from({length:3},()=>({value:command,readonly:true,start:0,end:command.length,focused:true,offscreen:true})),timers:[{delay:2500,started:0,fired:2500,cancelled:false},{delay:2500,started:2501,fired:null,cancelled:true},{delay:2500,started:2502,fired:null,cancelled:false}]})
 const copyRequest=request(refinementCopyScope),steps=["idle-focus","idle-hover","copied-focus","copied-hover","reset","fallback-success","fallback-failed","failed-hover","fallback-throw","recovered"]
 const phase={...result(),scope:refinementCopyScope,cases:siteCopyCases.map(item=>item.name),comparison:"refined-copy-with-original-state-machine",negativeControls:["copy-stylesheet-disabled","copy-focus-suppressed"],observations:siteCopyCases.map(item=>({name:item.name,command:refinementInstallCommand,baselineCommand:old,steps,elementsPerSample:18,baselineElementsPerSample:22,current:ports(refinementInstallCommand),baseline:ports(old)}))}
 expect(()=>parseRefinementPhase(phase,2,copyRequest)).not.toThrow()
 for(const change of [{command:old},{baselineCommand:refinementInstallCommand},{elementsPerSample:22},{baselineElementsPerSample:18},{steps:steps.slice(1)},{current:ports(old)},{baseline:ports(refinementInstallCommand)}]){
  const observations=phase.observations.map((item,index)=>index===0?{...item,...change}:item)
  expect(()=>parseRefinementPhase({...phase,observations},2,copyRequest)).toThrow()
 }
})

test("the single Sugar High structural line is separately admitted and never mistaken for a syntax token",async()=>{
 const source=await readFile(new URL("./site-refinement-browser-contract.ts",import.meta.url),"utf8")
 expect(refinementIslands["#interfaces"].match(/class="sh__line"/gu)).toHaveLength(1)
 expect(source).toContain('wrappers.length!==1');expect(source).toContain('wrappers[0]!.className!=="sh__line"')
 expect(source).toContain('.syntax-code span:not(.sh__line)');expect(source).toContain('throw Error("Missing syntax kind")')
})


test("the canonical 0.8 install frame admits only its exact 14px radius",async()=>{
 const source=await readFile(new URL("./site-refinement-browser-contract.ts",import.meta.url),"utf8")
 expect(source).toContain('sample("#install",{"border-radius":"14px"})')
 const seams=Object.fromEntries(["top","right","bottom","left"].map(side=>[`border-${side}-color`,"rgb(1, 1, 1)"]))
 const current:ShellElement={key:"#install[0]",rect:[20,200,280,400],text:"Install",semantics:{role:null},styles:{...seams,"border-radius":"14px",color:"rgb(2, 2, 2)",width:"280px"}}
 const baseline={...current,styles:{...current.styles,"border-radius":"10px"}}
 const paint={"#install":{"border-radius":"14px"},"section-line":{"border-top-color":"rgb(1, 1, 1)"}}
 expect(projectRefinementPaint(current,baseline,paint)).toEqual(baseline)
 for(let radius=0;radius<=64;radius++)if(radius!==14)expect(()=>projectRefinementPaint({...current,styles:{...current.styles,"border-radius":`${radius}px`}},baseline,paint)).toThrow()
 expect(()=>projectRefinementPaint({...current,styles:{...current.styles,"border-radius":"14px 10px"}},baseline,paint)).toThrow()
 const changed={...current,rect:[21,201,281,401],styles:{...current.styles,color:"red",width:"281px"}}
 const projected=projectRefinementPaint(changed,baseline,paint)
 expect(projected.rect).toEqual(changed.rect);expect(projected.styles.color).toBe("red");expect(projected.styles.width).toBe("281px")
})


test("hero centering projects only the shared copy offset of two retained text anchors",()=>{
 const base:ShellElement={key:"#page-title[0]",rect:[40,112,400,120],text:"Title",semantics:{role:"heading"},styles:{color:"black",height:"120px"}}
 for(const key of ["#page-title[0]",".hraness-marketing-hero__summary[0]"])for(let shift=-64;shift<=64;shift++){
  const current={...base,key,rect:[40,112+shift/4,400,120]}
  expect(projectRefinementHeroPosition(current,112+shift/4,112)).toEqual({...base,key})
 }
 for(const key of [".topbar[0]","#install[0]",".hraness-marketing-hero[0]","#page-title[1]",".hraness-marketing-hero__actions[0]"]){const other={...base,key};expect(projectRefinementHeroPosition(other,128.75,112)).toBe(other)}
 const changed={...base,rect:[41,130,401,121],text:"Changed",styles:{color:"red",height:"121px"}}
 expect(projectRefinementHeroPosition(changed,128.75,112)).toEqual({...changed,rect:[41,113.25,401,121]})
 for(const invalid of [NaN,Infinity,-Infinity])expect(()=>projectRefinementHeroPosition(base,invalid,112)).toThrow()
})


test("hero copy height admits only natural literal boundary wrapping, never container or child drift",()=>{
 const selector=".slopcamera-product-hero > .hraness-marketing-hero__copy"
 const side=(top:number,lines:number)=>({copyTop:top,boundaryLines:lines,boundaryLineHeight:20,nameComputedInsets:{top:"auto",right:"auto",bottom:"auto",left:"auto"},elements:Array.from({length:6},(_,index)=>({
  key:index===0?`${selector}[0]`:`${selector} > *[${index-1}]`,rect:[40,index===0?top:top+(index-1)*40,400,index===0?160+lines*20:index===5?lines*20:20],text:index===0||index===5?`Boundary lines ${lines}`:`Child ${index}`,semantics:{role:null},styles:{display:index===0?"grid":"block",height:`${index===0?160+lines*20:index===5?lines*20:20}px`,"padding-bottom":"0px","row-gap":"20px",color:"black"} as Record<string,string>
 })).map((item,index)=>index!==1?item:{...item,text:"Slopcamera",rect:[40,top,1,1],styles:{...item.styles,position:"absolute",width:"1px",height:"1px",clip:"rect(0px, 0px, 0px, 0px)","clip-path":"inset(50%)","white-space":"nowrap","overflow-x":"hidden","overflow-y":"hidden",top:`${top}px`,right:"400px",bottom:`${400-top}px`,left:"40px",...Object.fromEntries(["top","right","bottom","left"].flatMap(edge=>[[`margin-${edge}`,"0px"],[`padding-${edge}`,"0px"],[`border-${edge}-width`,"0px"]]))}})})
 const baseline=side(112,2),current=side(128.75,3)
 expect(()=>compareRefinementHeroCopies(current,baseline)).not.toThrow()
 for(let extra=1;extra<=32;extra++){
  const padding=structuredClone(current);padding.elements[0]!.styles={...padding.elements[0]!.styles,"padding-bottom":`${extra}px`};expect(()=>compareRefinementHeroCopies(padding,baseline)).toThrow()
  const height=structuredClone(current);height.elements[0]!.rect=[40,128.75,400,220+extra];height.elements[0]!.styles={...height.elements[0]!.styles,height:`${220+extra}px`};expect(()=>compareRefinementHeroCopies(height,baseline)).toThrow()
 }
 for(const index of [1,2,3,4]){const changed=structuredClone(current);changed.elements[index]!.rect=[41,changed.elements[index]!.rect[1]!,400,20];expect(()=>compareRefinementHeroCopies(changed,baseline)).toThrow()}
 const paddedBoundary=structuredClone(current);paddedBoundary.elements[5]!.rect=[40,288.75,400,80];paddedBoundary.elements[0]!.rect=[40,128.75,400,240];expect(()=>compareRefinementHeroCopies(paddedBoundary,baseline)).toThrow()
 const gap=structuredClone(current);gap.elements[0]!.styles={...gap.elements[0]!.styles,"row-gap":"21px"};expect(()=>compareRefinementHeroCopies(gap,baseline)).toThrow()
 for(const property of ["top","right","bottom","left"] as const)for(const value of ["0px","1px","-1px","1%","initial"]){const inset=structuredClone(current);inset.nameComputedInsets[property]=value;expect(()=>compareRefinementHeroCopies(inset,baseline)).toThrow()}
 for(const property of ["position","clip","clip-path","white-space","margin-top","padding-bottom"]){const changed=structuredClone(current);changed.elements[1]!.styles={...changed.elements[1]!.styles,[property]:"initial"};expect(()=>compareRefinementHeroCopies(changed,baseline)).toThrow()}
 for(const edge of ["top","right","bottom","left"])for(const value of ["-1px","1px"]){const changed=structuredClone(current);changed.elements[1]!.styles={...changed.elements[1]!.styles,[`margin-${edge}`]:value};expect(()=>compareRefinementHeroCopies(changed,baseline)).toThrow()}
 const displacedName=structuredClone(current);displacedName.elements[1]!.rect=[40,129.75,1,1];expect(()=>compareRefinementHeroCopies(displacedName,baseline)).toThrow()
 const visibleInset=structuredClone(current);visibleInset.elements[2]!.styles={...visibleInset.elements[2]!.styles,top:"1px"};expect(()=>compareRefinementHeroCopies(visibleInset,baseline)).toThrow()
})
