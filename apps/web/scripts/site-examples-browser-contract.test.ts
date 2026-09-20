import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseExamplesRequest, parseExamplesPhase, parseExamplesCaseFailure, examplesCaseFailure, examplesCaseNames,
  examplesNegativeControls, examplesDocsCases, examplesDocsExtraCases, examplesPlayerCases, examplesScope, examplesBaselineProfile,
  examplesDirectedRatios, assertExamplesRatioGeometry, examplesContentType, parseExampleByteRange, compareExamplesFlow, projectExamplesState, compareExamplesHeroBackgroundImage, type ExamplesRequest } from "./site-examples-browser-contract"
import { siteShellCases, assertFooterKeyboardCoverage, workflowExamplesHomeSelectors, type ShellElement } from "./site-shell-browser-contract"
import { siteCopyCases } from "./site-copy-browser-contract"
import { refinementInstallCommand } from "./site-refinement-profile"
import { assertExamplesBaselineManifest, assertExamplesHeroTextures } from "./verify-site-examples"
import { examplesBaselineRevision, examplesBaselineTree, examplesHeroTextures } from "./site-examples-profile"
import { decodeWorkerJson, encodeWorkerJson, decodeProfiledWorkerJson, encodeProfiledWorkerJson,
  publishWorkerPhase, publishProfiledWorkerPhase, examplesWorkerProtocolLimit, workerProtocolLimit } from "./preview-browser-protocol"
import { readPreviewFile } from "./preview-file"
import { projectExamplesHeroActions } from "./site-examples-cta"
import { compareRefinementHeroCopies } from "./site-refinement-browser-contract"
const hash = "a".repeat(64)
const media = [{ id: "editorial", path: "/assets/examples/editorial-aaaaaaaaaaaa.mp4", sha256: hash,
  poster: "/assets/examples/editorial-aaaaaaaaaaaa.webp", guide: "/docs/tutorials/first-animation", width: 1280, height: 720, durationSeconds: 8, hasAudio: false },
{ id: "native-product", path: "/assets/examples/native-product-bbbbbbbbbbbb.mp4", sha256: "b".repeat(64),
  poster: "/assets/examples/native-product-bbbbbbbbbbbb.webp", guide: "/docs/how-to/native-films", width: 1280, height: 720, durationSeconds: 8, hasAudio: false }]
const resources = [...new Set(["/", "/404.html", "/docs", "/docs/tutorials/first-diagram", "/docs/tutorials/first-animation",
  "/docs/how-to/render-motion-graphics", "/docs/how-to/vectorize-images", "/docs/reference/capabilities", "/docs/how-to/native-films", "/docs/how-to/parametric-design", "/docs/how-to/edit-video",
  "/graphs/site-foundation/style.css", `/assets/site-${hash}.css`, ...media.flatMap(item => [item.path, item.poster]),
  ...Array.from({length: 10}, (_, i) => `/fonts/font-${i}.woff2`)])].sort()
const payload = (port: number) => ({ origin: `http://127.0.0.1:${port}`, resources, stylesheets: ["/graphs/site-foundation/style.css", `/assets/site-${hash}.css`], finalCss: `/assets/site-${hash}.css` })
function request(): ExamplesRequest { return parseExamplesRequest({ schemaVersion: 1, token: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", scope: examplesScope,
  baselineProfile: examplesBaselineProfile, appDirectory: "/tmp/app", chromeExecutable: "/tmp/chrome", endpoint: "ws://127.0.0.1:3211/devtools/browser/aaaaaaaa", current: payload(3212), baseline: payload(3213), media }) }
const ports = () => ({ write: "success", fallback: "throw", writes: Array.from({length:5},()=>refinementInstallCommand),
  fallbacks: Array.from({length:3},()=>({value:refinementInstallCommand,readonly:true,start:0,end:refinementInstallCommand.length,focused:true,offscreen:true})),
  timers: [{delay:2500,started:1,fired:2501,cancelled:false},{delay:2500,started:1,fired:null,cancelled:true},{delay:2500,started:1,fired:null,cancelled:false}] })
function terminal(req = request()) {
 const observations = examplesCaseNames.map((name, index) => {
  if (index < siteShellCases.length) return {name,passed:true,currentObstructions:[],baselineObstructions:[]}
  if (index < siteShellCases.length + siteCopyCases.length) return {name,passed:true,command:refinementInstallCommand,current:ports(),baseline:ports()}
  if (!name.startsWith("player-")) {
   const scenario = [...examplesDocsCases, ...examplesDocsExtraCases].find(item => item.name === name)!
   return {name,passed:true,figures:name.includes("parametric-design")?5:name.includes("/edit-video-")?7:2,videos:name.includes("first-animation")?2:name.includes("/edit-video-")?7:0,shellPaired:true,
    navigation:{mode:scenario.width<=768?"disclosure":"sidebar",javascript:!("javascript" in scenario&&scenario.javascript===false),currentHref:scenario.route,
     defaultClosed:true,keyboardToggle:scenario.width<=768?"enter-open-space-close":"not-applicable",closedLinksHidden:true,articleBeforeFold:true}}
  }
  if (name === "player-captions") return {name,passed:true,captions:"not-present",media:[],initialMediaRequests:0}
  return {name,passed:true,media:[{id:"editorial",paused:!['player-visible-auto','player-offscreen-hidden'].includes(name),
   time:name==='player-failed-media'?0:1,controls:true,readyState:3,muted:true,
   error:null,source:`${req.current.origin}${media[0]!.path}`}],
   ...(name==='player-save-data'?{policyInput:'emulated-navigator-save-data'}:{}), ...(['player-offscreen-hidden','player-manual-pause'].includes(name)?{hiddenObserved:true}:{}),
   ...(['player-no-js','player-docs-manual','player-reduced-motion','player-save-data','player-failed-media'].includes(name)?{initialMediaRequests:0}:{}),
   ...(name==='player-failed-media'?{failedRequests:1,sourceError:{id:'editorial',source:`${req.current.origin}${media[0]!.path}`,count:1,owned:true}}:{})}
 })
 return {schemaVersion:1,token:req.token,scope:examplesScope,baselineProfile:examplesBaselineProfile,sequence:2,kind:'result',node:'24.18.1',playwright:'1.62.0',browser:'151.0.0.0',closed:true,cases:[...examplesCaseNames],negativeControls:[...examplesNegativeControls],observations}
}
const mutate = (value: unknown, action: (record: any) => void) => { const copy = structuredClone(value); action(copy); return copy }

function ctaFixture(current: boolean, available = 500, direction = "ltr", height = 42) {
 const copySelector=".slopcamera-product-hero > .hraness-marketing-hero__copy", top=current?120:100, left=40
 const texts=["Install Slopcamera",current?"Explore the examples":"See example requests"]
 const widths=[172,current?197.678:201.834],gap=10.4, natural=widths[0]!+gap+widths[1]!,wrapped=natural>available
 const width=Math.min(available,natural),rowHeight=wrapped?2*height+gap:height,rowX=direction==="rtl"?left+available-width:left,rowY=top+180
 const zero=Object.fromEntries(["top","right","bottom","left"].flatMap(edge=>[[`margin-${edge}`,"0px"],[`padding-${edge}`,"0px"],[`border-${edge}-width`,"0px"]]))
 const rowStyles:Record<string,string>={...zero,display:"flex",position:"static","box-sizing":"border-box","flex-wrap":"wrap","flex-direction":"row","align-items":"center","justify-content":"flex-start",direction,"row-gap":`${gap}px`,"column-gap":`${gap}px`,width:`${width}px`,height:`${rowHeight}px`,color:"black","margin-top":"8px"}
 const elements=Array.from({length:6},(_,index)=>({key:index===0?`${copySelector}[0]`:`${copySelector} > *[${index-1}]`,rect:[left,top+index*30,available,20],text:`Child ${index}`,semantics:{role:null},styles:{...zero,display:"block",height:"20px",color:"black"} as Record<string,string>}))
 elements[0]={...elements[0]!,rect:[left,top,available,240+rowHeight],styles:{...zero,display:"grid",height:`${240+rowHeight}px`,width:`${available}px`,"justify-items":"start",direction,color:"black"}}
 elements[1]={...elements[1]!,text:"Slopcamera",rect:[left,top,1,1],styles:{...zero,display:"block",position:"absolute",width:"1px",height:"1px",clip:"rect(0px, 0px, 0px, 0px)","clip-path":"inset(50%)","white-space":"nowrap","overflow-x":"hidden","overflow-y":"hidden",top:"auto",right:"auto",bottom:"auto",left:"auto"}}
 elements[4]={...elements[4]!,rect:[rowX,rowY,width,rowHeight],text:texts.join(" "),styles:rowStyles}
 elements[5]={...elements[5]!,rect:[left,rowY+rowHeight+20,available,20]}
 const buttons=widths.map((width,index)=>{
  const offset=index===1&&!wrapped?widths[0]!+gap:0,x=direction==="rtl"?rowX+elements[4]!.rect[2]!-offset-width:rowX+offset,y=rowY+(index===1&&wrapped?height+gap:0)
  return {key:`${copySelector} > .hraness-marketing-hero__actions > a[${index}]`,rect:[x,y,width,height],text:texts[index]!,semantics:{href:index===0?"#install":"#examples",role:null},styles:{...zero,display:"flex",position:"static","box-sizing":"border-box","align-items":"center","justify-content":"center","flex-grow":"0","flex-shrink":"1","flex-basis":"auto","align-self":"auto",order:"0",direction,width:`${width}px`,height:`${height}px`,"padding-left":"17.6px","padding-right":"17.6px","border-left-width":"1px","border-right-width":"1px","font-family":"Nebula Sans","font-size":"15.2px",color:"black","background-color":"white"} as Record<string,string>}
 })
 const textRects=buttons.map(button=>[button.rect[0]!+18.6,button.rect[1]!+(height-18)/2,button.rect[2]!-37.2,18])
 return {hero:{copyTop:top,boundaryLines:1,boundaryLineHeight:20,nameComputedInsets:{top:"auto",right:"auto",bottom:"auto",left:"auto"},elements},actions:{buttons,textRects}}
}
function compareCta(current:ReturnType<typeof ctaFixture>,baseline:ReturnType<typeof ctaFixture>) {
 compareRefinementHeroCopies(projectExamplesHeroActions(current.hero,baseline.hero,current.actions,baseline.actions),baseline.hero)
}
describe("examples-only native CTA intrinsic width proof",()=>{
 test("reproduces the retained 544px failure and admits only its text-derived width",()=>{
  const current=ctaFixture(true),baseline=ctaFixture(false)
  expect(current.hero.elements[4]!.rect[2]).toBeCloseTo(380.078,3);expect(baseline.hero.elements[4]!.rect[2]).toBeCloseTo(384.234,3)
  const former={...current.hero,elements:current.hero.elements.map((item,index)=>index===4?{...item,text:baseline.hero.elements[4]!.text}:item)}
  expect(()=>compareRefinementHeroCopies(former,baseline.hero)).toThrow()
  const before=structuredClone(current)
  expect(()=>compareCta(current,baseline)).not.toThrow();expect(current).toEqual(before)
 })
 for(const available of [272,342,500])for(const direction of ["ltr","rtl"])for(const height of [42,48])
  test(`preserves ${available}px ${direction} wrapping, heights and natural alignment at ${height}px`,()=>{
   expect(()=>compareCta(ctaFixture(true,available,direction,height),ctaFixture(false,available,direction,height))).not.toThrow()
  })
 const corruptions:Record<string,(value:ReturnType<typeof ctaFixture>)=>void>={
  "missing anchor":v=>{v.actions.buttons.pop()},
  "missing range":v=>{v.actions.textRects.pop()},
  "wrong text":v=>{v.actions.buttons[1]!.text="Different wording"},
  "wrong primary href":v=>{v.actions.buttons[0]!.semantics.href="#other"},
  "secondary width unrelated to text":v=>{v.actions.buttons[1]!.rect[2]!+=2},
  "text escapes padding":v=>{v.actions.textRects[1]![0]!+=2},
  "text escapes vertically":v=>{v.actions.textRects[1]![1]!-=80},
  "nonfinite range":v=>{v.actions.textRects[1]![2]=NaN},
  "nonzero margin":v=>{v.actions.buttons[1]!.styles["margin-left"]="1px"},
  "padding drift":v=>{v.actions.buttons[1]!.styles["padding-left"]="18.6px"},
  "border drift":v=>{v.actions.buttons[1]!.styles["border-right-width"]="2px"},
  "font drift":v=>{v.actions.buttons[1]!.styles["font-family"]="Other font"},
  "unblockified button display":v=>{v.actions.buttons[1]!.styles.display="inline-flex"},
  "button paint drift":v=>{v.actions.buttons[1]!.styles.color="red"},
  "primary paint drift":v=>{v.actions.buttons[0]!.styles.color="red"},
  "button height drift":v=>{v.actions.buttons[1]!.rect[3]!+=2},
  "row gap drift":v=>{v.hero.elements[4]!.styles["row-gap"]="11.4px"},
  "column gap drift":v=>{v.hero.elements[4]!.styles["column-gap"]="11.4px"},
  "row width unrelated to text":v=>{v.hero.elements[4]!.rect[2]!+=2},
  "row computed width mismatch":v=>{v.hero.elements[4]!.styles.width="381px"},
  "row padding":v=>{v.hero.elements[4]!.styles["padding-right"]="1px"},
  "row alignment":v=>{v.hero.elements[4]!.rect[0]!+=2},
  "row height":v=>{v.hero.elements[4]!.rect[3]!+=2},
  "row paint":v=>{v.hero.elements[4]!.styles.color="red"},
  "button gap":v=>{v.actions.buttons[1]!.rect[0]!+=2;v.actions.textRects[1]![0]!+=2},
  "copy width":v=>{v.hero.elements[0]!.rect[2]!+=2},
  "primary intrinsic width":v=>{v.actions.buttons[0]!.rect[2]!+=2;v.actions.textRects[0]![2]!+=2},
  "other retained geometry":v=>{v.hero.elements[2]!.rect[0]!+=2},
  "vertical text alignment":v=>{v.actions.textRects[1]![1]!+=2},
 }
 for(const [name,corrupt]of Object.entries(corruptions))test(`rejects ${name} on either tree`,()=>{
  for(const side of ["current","baseline"]as const){const pair={current:ctaFixture(true),baseline:ctaFixture(false)};corrupt(pair[side]);expect(()=>compareCta(pair.current,pair.baseline)).toThrow()}
 })
 test("refuses different wrapping modes and an ambiguous wrap threshold",()=>{
  expect(()=>compareCta(ctaFixture(true,382),ctaFixture(false,382))).toThrow()
  expect(()=>compareCta(ctaFixture(true,380.078),ctaFixture(false,380.078))).toThrow()
 })
 test("retains strict RTL right edge and wrapped line placement",()=>{
  for(const available of [272,500]){
   const current=ctaFixture(true,available,"rtl"),baseline=ctaFixture(false,available,"rtl")
   current.actions.buttons[1]!.rect[0]!-=2;current.actions.textRects[1]![0]!-=2
   expect(()=>compareCta(current,baseline)).toThrow()
  }
  const current=ctaFixture(true,272),baseline=ctaFixture(false,272)
  current.actions.buttons[1]!.rect[1]!-=2;current.actions.textRects[1]![1]!-=2
  expect(()=>compareCta(current,baseline)).toThrow()
 })
})

describe("examples-only finite worker protocol", () => {
 test("roundtrips the complete 133-case receipt without dropping copy or media evidence", async () => {
  const req=request(), receipt=terminal(req)
  const bytes=encodeProfiledWorkerJson(receipt,examplesScope)
  expect(receipt.observations).toHaveLength(133)
  expect(bytes.byteLength).toBeGreaterThan(workerProtocolLimit)
  expect(bytes.byteLength).toBeLessThanOrEqual(examplesWorkerProtocolLimit)
  expect(parseExamplesPhase(decodeProfiledWorkerJson(bytes,examplesScope),2,req)).toEqual(receipt)
  expect(()=>encodeWorkerJson(receipt)).toThrow()
  expect(()=>decodeWorkerJson(bytes)).toThrow()
  const directory=await mkdtemp(join(await realpath(tmpdir()),'slopcamera-examples-protocol-'))
  try {
   await expect(publishWorkerPhase(directory,2,receipt)).rejects.toThrow()
   await publishProfiledWorkerPhase(directory,2,receipt,examplesScope)
   const published=await readPreviewFile(join(directory,'result.json'),examplesWorkerProtocolLimit)
   expect(published).toEqual(bytes)
   expect(await readPreviewFile(join(directory,'.result.json.tmp'),examplesWorkerProtocolLimit)).toEqual(bytes)
   expect(parseExamplesPhase(decodeProfiledWorkerJson(published,examplesScope),2,req)).toEqual(receipt)
   await expect(readPreviewFile(join(directory,'result.json'),workerProtocolLimit)).rejects.toThrow()
   await expect(publishProfiledWorkerPhase(directory,2,receipt,examplesScope)).rejects.toThrow()
   expect(await readPreviewFile(join(directory,'result.json'),examplesWorkerProtocolLimit)).toEqual(bytes)
  } finally { await rm(directory,{recursive:true,force:true}) }
 })
 test("keeps historical callback signatures and exact32KiB ceiling",()=>{
  expect([{a:1},{b:2}].map(encodeWorkerJson).map(decodeWorkerJson)).toEqual([{a:1},{b:2}])
  const value={text:'a'.repeat(workerProtocolLimit-Buffer.byteLength(JSON.stringify({text:''})+'\n'))}
  expect(encodeWorkerJson(value).byteLength).toBe(workerProtocolLimit)
  expect(decodeWorkerJson(encodeWorkerJson(value))).toEqual(value)
  expect(()=>encodeWorkerJson({text:value.text+'a'})).toThrow()
 })
 test("checks the exact128KiB UTF8 boundary and retains canonical decoding",()=>{
  const space=examplesWorkerProtocolLimit-Buffer.byteLength(JSON.stringify({text:''})+'\n')
  const value={text:'é'.repeat(Math.floor(space/2))+'a'.repeat(space%2)}
  const bytes=encodeProfiledWorkerJson(value,examplesScope)
  expect(bytes.byteLength).toBe(examplesWorkerProtocolLimit)
  expect(decodeProfiledWorkerJson(bytes,examplesScope)).toEqual(value)
  expect(()=>encodeProfiledWorkerJson({text:value.text+'a'},examplesScope)).toThrow()
  expect(()=>decodeProfiledWorkerJson(Buffer.from(JSON.stringify({text:value.text+'a'})+'\n'),examplesScope)).toThrow()
  for(const invalid of [Buffer.from('{"a":1,"a":2}\n'),Buffer.from('{} \n'),Buffer.from([0xff]),Buffer.from('{}\n{}\n')])
   expect(()=>decodeProfiledWorkerJson(invalid,examplesScope)).toThrow()
 })
 test("requires the exact scope and preserves error receipt roundtrip",async()=>{
  const req=request(), value=examplesCaseFailure(req,examplesCaseNames[0]!,"pair",[],new Error('failure'))
  const bytes=encodeProfiledWorkerJson(value,examplesScope)
  expect(parseExamplesCaseFailure(decodeProfiledWorkerJson(bytes,examplesScope),req)).toEqual(value)
  for(const profile of ['optional-support-v1','unknown',undefined] as const) {
   expect(()=>encodeProfiledWorkerJson(value,profile as never)).toThrow()
   expect(()=>decodeProfiledWorkerJson(bytes,profile as never)).toThrow()
   await expect(publishProfiledWorkerPhase('/unused',2,value,profile as never)).rejects.toThrow()
  }
 })
 test("admits64 total videos while retaining32 per page",()=>{
  const value=request()
  const extended=Array.from({length:64},(_,i)=>i<2?value.media[i]!:{...value.media[0]!,id:`variant-${i}`,
   path:`/assets/examples/variant-${i}-aaaaaaaaaaaa.mp4`,poster:`/assets/examples/variant-${i}-aaaaaaaaaaaa.webp`})
  const expanded={...value,media:extended,current:{...value.current,resources:[...new Set([...value.current.resources,...extended.flatMap(item=>[item.path,item.poster])])].sort()}}
  expect(parseExamplesRequest(decodeProfiledWorkerJson(encodeProfiledWorkerJson(expanded,examplesScope),examplesScope)).media).toHaveLength(64)
  expect(()=>parseExamplesRequest({...expanded,media:[...extended,{...extended[0],id:'over-limit'}]})).toThrow()
  const receipt=terminal(expanded), observation=receipt.observations.find(item=>item.name==='player-docs-manual')!
  const sample=(observation as any).media[0]
  ;(observation as any).media=extended.slice(0,32).map(item=>({...sample,id:item.id,source:`${expanded.current.origin}${item.path}`}))
  expect(()=>parseExamplesPhase(receipt,2,expanded)).not.toThrow()
  ;(observation as any).media.push({...sample,id:extended[32]!.id,source:`${expanded.current.origin}${extended[32]!.path}`})
  expect(()=>parseExamplesPhase(receipt,2,expanded)).toThrow()
 })
})

describe("workflow-examples-v1 independent native contract", () => {
 test("retains the exact76 shell cases and adds mandatory copy/docs/media cases in order", () => {
  expect(siteShellCases).toHaveLength(76)
  expect(examplesCaseNames.slice(0,76)).toEqual(siteShellCases.map(item=>item.name))
  expect(examplesDocsCases).toHaveLength(32); expect(examplesDocsExtraCases).toHaveLength(8)
  expect(examplesCaseNames).toHaveLength(76+8+40+examplesPlayerCases.length)
  expect(examplesDocsCases.filter(item=>item.route==="/docs/how-to/edit-video")).toHaveLength(4)
  expect(new Set(examplesCaseNames).size).toBe(examplesCaseNames.length)
  expect(examplesDocsCases.filter(item=>item.route==="/docs/how-to/parametric-design").map(({width,theme})=>({width,theme}))).toEqual([
   {width:390,theme:"light"},{width:390,theme:"dark"},{width:1440,theme:"light"},{width:1440,theme:"dark"}])
 })
 test("admits only the new exact scope and snapshot resources", () => { expect(request().scope).toBe(examplesScope) })
 test("admits the same bounded canvas in portrait orientation",()=>{
  const value=mutate(request(),(r:any)=>{r.media[0].width=720;r.media[0].height=1280})
  expect(parseExamplesRequest(value).media[0]!.height).toBe(1280)
 })
 test("retains the registry bounds for manually played simulation crops and longer lessons",()=>{
  const value=mutate(request(),(r:any)=>{r.media[0].width=1280;r.media[0].height=960;r.media[0].durationSeconds=120})
  expect(parseExamplesRequest(value).media[0]!.height).toBe(960)
 })
 test.each([
  (r:any)=>{r.scope='optional-support-v1'},(r:any)=>{r.baselineProfile='other'},(r:any)=>{r.extra=true},
  (r:any)=>{r.current.origin=r.baseline.origin},(r:any)=>{r.endpoint='ws://example.com:123/devtools/browser/aaaa'},
  (r:any)=>{r.endpoint='ws://127.0.0.1:99999/devtools/browser/aaaa'},(r:any)=>{r.current.resources.reverse()},
  (r:any)=>{r.current.resources.push('/../secret')},(r:any)=>{r.media[0].path='https://example.com/a.mp4'},
  (r:any)=>{r.media[0].sha256='invalid'},(r:any)=>{r.media[0].durationSeconds=121},(r:any)=>{r.media[0].id='other'},
  (r:any)=>{r.media[0].height=1921},(r:any)=>{r.media[0].guide=r.media[0].poster},
  (r:any)=>{r.media[1].id=r.media[0].id},(r:any)=>{r.current.resources=r.current.resources.filter((p:string)=>p!='/docs/tutorials/first-animation')},
 ])("rejects widened request authority", change => { expect(()=>parseExamplesRequest(mutate(request(),change))).toThrow() })
 test("terminal evidence requires all independently asserted observation families", () => { const req=request(); expect(parseExamplesPhase(terminal(req),2,req).closed).toBe(true) })
 test.each([
  (r:any)=>{r.cases.pop()},(r:any)=>{r.cases.reverse()},(r:any)=>{r.closed=false},(r:any)=>{r.negativeControls.pop()},
  (r:any)=>{r.observations[0].baselineObstructions=[{}]},(r:any)=>{r.observations[0].currentObstructions=[{}]},
  (r:any)=>{r.observations[76].current.writes[0]='different'},(r:any)=>{r.observations[76].current.timers[0].fired=2000},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).videos=0},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).shellPaired=false},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).navigation.defaultClosed=false},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).navigation.closedLinksHidden=false},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).navigation.articleBeforeFold=false},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('docs-no-js-')).navigation.javascript=true},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).navigation.keyboardToggle='synthetic'},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('first-animation')).navigation.currentHref='/docs'},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('parametric-design')).figures=4},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('parametric-design')).videos=1},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('/edit-video-')).figures=6},
  (r:any)=>{r.observations.find((o:any)=>o.name.includes('/edit-video-')).videos=6},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-no-js').media[0].time=0},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-docs-manual').media[0].controls=false},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-visible-auto').media[0].paused=true},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-offscreen-hidden').hiddenObserved=false},
  (r:any)=>{delete r.observations.find((o:any)=>o.name==='player-manual-pause').hiddenObserved},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-save-data').initialMediaRequests=1},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-reduced-motion').media[0].time=0},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-failed-media').failedRequests=2},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-failed-media').sourceError.count=0},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-failed-media').sourceError.count=2},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-failed-media').sourceError.owned=false},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-failed-media').sourceError.id='native-product'},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-failed-media').sourceError.source='https://example.com/video.mp4'},
  (r:any)=>{delete r.observations.find((o:any)=>o.name==='player-failed-media').sourceError},
  (r:any)=>{r.observations.find((o:any)=>o.name==='player-no-js').media[0].source='https://example.com/video.mp4'},
 ])("rejects false or incomplete success evidence", change => { const req=request();expect(()=>parseExamplesPhase(mutate(terminal(req),change),2,req)).toThrow() })
 test("failure accepts only exact completed prefix and cannot become success", () => {
  const req=request(), prefix=examplesCaseNames.slice(0,2)
  const failure=examplesCaseFailure(req,examplesCaseNames[2]!,"pair",prefix,new Error('failure'))
  expect(parseExamplesCaseFailure(failure,req).accepted).toBe(false)
  expect(()=>parseExamplesCaseFailure({...failure,comparedCases:[prefix[1],prefix[0]]},req)).toThrow()
  expect(()=>parseExamplesPhase(failure,2,req)).toThrow()
 })
 test("immutable baseline manifest binds exact source tree and artifact bytes",()=>{
  const snapshot={inputs:[{path:'src/index.html',bytes:1,sha256:hash}],artifacts:[{path:'index.html',bytes:1,sha256:hash}],files:new Map<string,Uint8Array>(),stylesheets:['/foundation.css','/final.css']}
  const manifest={schemaVersion:6,baselineProfile:examplesBaselineProfile,checkoutRevision:examplesBaselineRevision,sourceRevision:examplesBaselineRevision,sourceTree:examplesBaselineTree,inputs:snapshot.inputs,artifacts:snapshot.artifacts}
  expect(()=>assertExamplesBaselineManifest(manifest,snapshot)).not.toThrow()
  // The prior release's independently retained evidence cannot be relabeled
  // as this baseline, even when a synthetic fixture shares artifact bytes.
  const priorManifest={...manifest,baselineProfile:'before-workflow-examples-437a530-v1',checkoutRevision:'437a530ee81bd0816c911f216f4331c88770bf31',sourceRevision:'437a530ee81bd0816c911f216f4331c88770bf31',sourceTree:'4a453ddc4aecd6c68a2135dcf447dc323efa6c6d'}
  expect(()=>assertExamplesBaselineManifest(priorManifest,snapshot)).toThrow()
  for(const change of [(r:any)=>{r.sourceTree='a'.repeat(40)},(r:any)=>{r.checkoutRevision='b'.repeat(40)},(r:any)=>{r.artifacts[0].sha256='b'.repeat(64)},(r:any)=>{r.inputs.push({path:'hidden',bytes:1,sha256:hash})},(r:any)=>{r.schemaVersion=5}]) expect(()=>assertExamplesBaselineManifest(mutate(manifest,change),snapshot)).toThrow()
 })
})

describe("real local media transport", () => {
 test.each([
  ['bytes=0-',100,{start:0,end:99}],['bytes=10-20',100,{start:10,end:20}],['bytes=10-1000',100,{start:10,end:99}],
  ['bytes=-20',100,{start:80,end:99}],['bytes=-200',100,{start:0,end:99}],
 ])("admits a bounded single range %s", (header,size,expected)=>{expect(parseExampleByteRange(header,size,'/a.mp4')).toEqual(expected)})
 test.each(['bytes=','bytes=-','bytes=-0','bytes=100-','bytes=20-10','bytes=0-1,3-5','items=0-1','bytes=9007199254740992-','bytes= 0-1'])('rejects ambiguous range %s',header=>{expect(parseExampleByteRange(header,100,'/a.mp4')).toBeUndefined()})
 test("ranges never widen ordinary asset transport",()=>{expect(parseExampleByteRange('bytes=0-',100,'/a.css')).toBeUndefined()})
 test("sets real media, captions and documentation MIME types",()=>{
  expect(examplesContentType('/a.mp4')).toBe('video/mp4');expect(examplesContentType('/a.vtt')).toBe('text/vtt; charset=utf-8')
  expect(examplesContentType('/docs/tutorials/first-animation')).toBe('text/html; charset=utf-8')
  expect(()=>examplesContentType('/a.exe')).toThrow()
 })
})
const box=(key:string,y:number,height:number):ShellElement=>({key,rect:[0,y,100,height],styles:{},text:'',semantics:{}})
describe("examples hero texture transport", () => {
 const origins={current:'http://127.0.0.1:51954',baseline:'http://127.0.0.1:51955'}
 const image=(origin:string)=>`url("${origin}/graphs/site-foundation/assets/grain-DOupJfvn.svg"), url("${origin}/graphs/site-foundation/assets/cells-B8vUTEH9.svg"), radial-gradient(at 60% 110%, oklch(0.728013 0.11141 69.6489 / 0.22), rgba(0, 0, 0, 0) 68%)`
 test("pairs identical texture paint served by the exact two test origins",()=>{
  expect(compareExamplesHeroBackgroundImage(image(origins.current),image(origins.baseline),origins)).toBe(image(origins.baseline))
 })
 test("retains paired forced-color absence without admitting a missing texture",()=>{
  expect(compareExamplesHeroBackgroundImage('none','none',origins)).toBe('none')
  expect(()=>compareExamplesHeroBackgroundImage('none',image(origins.baseline),origins)).toThrow()
  expect(()=>compareExamplesHeroBackgroundImage(image(origins.current),'none',origins)).toThrow()
 })
 test.each([
  (value:string)=>value.replace('51954','51956'),
  (value:string)=>value.replace('127.0.0.1','localhost'),
  (value:string)=>value.replace('http://127.0.0.1:51954','https://example.com'),
  (value:string)=>value.replace('grain-DOupJfvn.svg','grain-changed.svg'),
  (value:string)=>value.replace('grain-DOupJfvn.svg','grain-DOupJfvn.svg?changed=1'),
  (value:string)=>value.replace('grain-DOupJfvn.svg','grain-DOupJfvn.svg#changed'),
  (value:string)=>value.replace('grain-DOupJfvn.svg','cells-B8vUTEH9.svg'),
  (value:string)=>value.replace(/url\([^)]*\), /u,''),
  (value:string)=>`${value}, url("https://example.com/extra.svg")`,
  (value:string)=>value.replace('0.22','0.23'),
  (value:string)=>value.replace('60% 110%','50% 110%'),
  (value:string)=>value.replace(/^(url\([^)]*\)), (url\([^)]*\))/u,'$2, $1'),
 ])("rejects changed origin, resource identity, layer order or gradient",change=>{
  expect(()=>compareExamplesHeroBackgroundImage(change(image(origins.current)),image(origins.baseline),origins)).toThrow()
  // The baseline must independently use its own exact server and assets.
  const changedBaseline=change(image(origins.current)).replaceAll(origins.current,origins.baseline)
  expect(()=>compareExamplesHeroBackgroundImage(image(origins.current),changedBaseline,origins)).toThrow()
 })
 test("requires two distinct exact loopback origins",()=>{
  for(const invalid of ['https://127.0.0.1:51954','http://localhost:51954','http://127.0.0.1:0','http://127.0.0.1:65536',origins.current+'/']) {
   expect(()=>compareExamplesHeroBackgroundImage('none','none',{...origins,current:invalid})).toThrow()
  }
  expect(()=>compareExamplesHeroBackgroundImage('none','none',{current:origins.current,baseline:origins.current})).toThrow()
 })
 test("requires both exact texture digests and sizes before native comparison",()=>{
  const snapshot={artifacts:examplesHeroTextures.map(asset=>({...asset}))}
  expect(()=>assertExamplesHeroTextures(snapshot)).not.toThrow()
  for(const change of [
   (value:any)=>{value.artifacts[0].sha256='a'.repeat(64)},
   (value:any)=>{value.artifacts[0].bytes++},
   (value:any)=>{value.artifacts[0].path+='?changed=1'},
   (value:any)=>{value.artifacts.pop()},
   (value:any)=>{value.artifacts.push({...value.artifacts[0]})},
  ]) {
   const changed=structuredClone(snapshot);change(changed)
   expect(()=>assertExamplesHeroTextures(changed)).toThrow()
  }
 })
})
describe("closed layout differences and historical invariants",()=>{
 test("only declared height changes translate later sections",()=>{
  const before=[box('.hraness-marketing-hero[0]',0,100),box('#install[0]',100,50)]
  expect(compareExamplesFlow([box('.hraness-marketing-hero[0]',0,120),box('#install[0]',120,50)],before)).toBe(20)
  expect(()=>compareExamplesFlow([box('.hraness-marketing-hero[0]',0,120),box('#install[0]',121,50)],before)).toThrow()
  expect(()=>compareExamplesFlow([box('.hraness-marketing-hero[0]',0,100),box('#install[0]',100,60)],before)).toThrow()
  expect(()=>compareExamplesFlow([box('.hraness-marketing-hero[0]',0,Infinity),box('#install[0]',100,50)],before)).toThrow()
 })
 test("old footer counts remain exact and the new profile requires four",()=>{
  const links=(n:number)=>Array.from({length:n},(_,i)=>box(`.hraness-site-footer__social-link[${i}]`,0,10))
  expect(()=>assertFooterKeyboardCoverage(links(5))).not.toThrow()
  expect(()=>assertFooterKeyboardCoverage(links(5),'marketing-refinement-v1')).not.toThrow()
  for(const profile of ['optional-support-v1','workflow-examples-v1'] as const){expect(()=>assertFooterKeyboardCoverage(links(4),profile)).not.toThrow();expect(()=>assertFooterKeyboardCoverage(links(5),profile)).toThrow()}
  expect(()=>assertFooterKeyboardCoverage(links(4),'unknown' as never)).toThrow()
 })
 test("shared source keeps native allowance and mandatory wrap exclusive to the new profile",async()=>{
  const source=await readFile(new URL('./site-shell-browser-contract.ts',import.meta.url),'utf8')
  expect(source).toContain('const nativeMedia = domProfile === "workflow-examples-v1" ? await page.locator("video[controls]").count() : 0')
  expect(source).toContain('const tabLimit = total + 2 + nativeMedia * 12')
  expect(source).toContain('if (domProfile === "workflow-examples-v1") assert.equal(wrapped, true')
  expect(source).toContain('if (domProfile === "optional-support-v1") {')
  expect(source).toContain('const homeSelectors = ["#page-title", ".hraness-marketing-hero", ".hraness-marketing-hero__summary", "#install", "#examples",\n  "#workflow", "#interfaces", "#design", "#questions", "#maker", "#closing", ".slopcamera-ask-ai", ".slopcamera-ask-ai *"]')
  expect(source).toContain('domProfile === "workflow-examples-v1" ? workflowExamplesHomeSelectors : homeSelectors')
 })
 test("current profile requires the exact existing baseline and current home targets",()=>{
  expect(workflowExamplesHomeSelectors).toEqual(["#page-title", ".hraness-marketing-hero", ".hraness-marketing-hero__summary", "#install", "#examples", "#workflow", "#interfaces", "#design", "#questions", "#closing", ".slopcamera-ask-ai", ".slopcamera-ask-ai *"])
 })
 test("fixed controls preserve viewport Y while their document coordinates follow observed scroll",()=>{
  const prior=[box('footer-link[0]',180,20)], current=[box('footer-link[0]',780,20)]
  const position=(scrollY:number,fixed=true)=>[{key:'footer-link[0]',scrollY,fixed}]
  expect(projectExamplesState(current,prior,position(700),position(100),()=>999)[0]!.rect[1]).toBe(180)
  expect(()=>projectExamplesState([box('footer-link[0]',782,20)],prior,position(700),position(100),()=>999)).toThrow()
  expect(()=>projectExamplesState(current,prior,position(700,false),position(100),()=>600)).toThrow()
 })
 test("ordinary controls admit only their declared section translation",()=>{
  const prior=[box('ask-ai[0]',180,20)], current=[box('ask-ai[0]',780,20)]
  const position=(scrollY:number)=>[{key:'ask-ai[0]',scrollY,fixed:false}]
  expect(projectExamplesState(current,prior,position(700),position(100),()=>600)[0]!.rect[1]).toBe(180)
  expect(()=>projectExamplesState(current,prior,position(700),position(100),()=>0)).toThrow()
  expect(()=>projectExamplesState(current,prior,[],position(100),()=>600)).toThrow()
 })
})


describe("mixed-ratio manual documentation geometry", () => {
 const admitted=examplesDirectedRatios.map(item=>({...media[0]!,...item,path:`/assets/examples/${item.id}-aaaaaaaaaaaa.mp4`}))
 const measured=()=>admitted.map(item=>({id:item.id,widthAttribute:item.width,heightAttribute:item.height,source:item.path,
  x:24,width:342,height:Math.min(342*item.height/item.width,648),objectFit:"contain"}))
 test("keeps the closed portrait, square and landscape dimensions inside a finite390px canvas",()=>{
  expect(()=>assertExamplesRatioGeometry(measured(),admitted,{width:390,height:900})).not.toThrow()
 })
 test.each([
  (items:any[])=>{items[1].widthAttribute=1280},(items:any[])=>{items[1].heightAttribute=720},
  (items:any[])=>{items[1].objectFit="cover"},(items:any[])=>{items[1].height=649},
  (items:any[])=>{items[1].width=391},(items:any[])=>{items[1].source=items[0].source},
  (items:any[])=>{items[1].width=NaN},(items:any[])=>{items.reverse()},
 ])("rejects changed aspect metadata, crop fitting, overflow or source",change=>{
  const values=measured();change(values);expect(()=>assertExamplesRatioGeometry(values,admitted,{width:390,height:900})).toThrow()
 })
 test("requires each ratio in the exact admitted registry",()=>{
  expect(()=>assertExamplesRatioGeometry(measured(),admitted.slice(0,3),{width:390,height:900})).toThrow()
  expect(()=>assertExamplesRatioGeometry(measured(),admitted.map((item,index)=>index===1?{...item,height:720}:item),{width:390,height:900})).toThrow()
 })
})
