import assert from "node:assert/strict"
import type { Page } from "playwright-core"
import { parseMarketingRequest, marketingScope, marketingBaselineProfile, marketingCaseFailure, headingSize,
  marketingHeadingIds, marketingSectionIds, needsLanternTransparency, assertMarketingFlow } from "./site-marketing-browser-contract"
import { assertShellNode, compareShellElements, compareShellEvidence, compareShellFocusedSkip, measure, resolvedShellTheme,
  settle, shellAppearanceSteps, shellRecord, siteShellCases, siteShellDeadlineMs, type ShellCase, type ShellElement,
  type ShellEvidence, type ShellPayload } from "./site-shell-browser-contract"
import { assertCopyPorts, copyElementKeys, copyNegativeControls, copySteps, siteCopyCases, siteCopyDeadlineMs, type CopyEvidence } from "./site-copy-browser-contract"
import { normalizeLanternPaintValue, withLanternTransparency } from "./site-lantern-browser-contract"
import { refinementIslands } from "./site-refinement-fixtures"
import { refinementBaselineProfile, refinementScope, refinementCopyScope, refinementCopyElementKeys, refinementInstallCommand,
  refinementDiagramSession, refinementInterfaceExamples, refinementAlternateCommand } from "./site-refinement-profile"

export interface RefinementRequest extends Omit<ReturnType<typeof parseMarketingRequest>, "scope" | "baselineProfile"> {
  readonly scope: typeof refinementScope | typeof refinementCopyScope
  readonly baselineProfile: typeof refinementBaselineProfile
}
const keys = (item: Record<string, unknown>, expected: readonly string[]) => assert.deepEqual(Object.keys(item).sort(), [...expected].sort())
export const refinementCases = (scope: RefinementRequest["scope"]) => scope === refinementScope ? siteShellCases : siteCopyCases
export const refinementDeadline = (scope: RefinementRequest["scope"]) => scope === refinementScope ? siteShellDeadlineMs : siteCopyDeadlineMs
export function parseRefinementRequest(value: unknown): RefinementRequest {
  const item = shellRecord(value)
  assert.ok(item.scope === refinementScope || item.scope === refinementCopyScope)
  assert.equal(item.baselineProfile, refinementBaselineProfile)
  // Reuse the unchanged closed payload/path/endpoint/resource parser. Wire
  // identity is checked above and is never serialized as the historical scope.
  parseMarketingRequest({ ...item, scope: marketingScope, baselineProfile: marketingBaselineProfile })
  return item as unknown as RefinementRequest
}
export function parseRefinementPhase(value: unknown, sequence: 0 | 1 | 2, request: RefinementRequest): Record<string, unknown> {
  const item = shellRecord(value), copy = request.scope === refinementCopyScope
  const common = ["schemaVersion", "token", "scope", "baselineProfile", "sequence", "kind"]
  keys(item, sequence === 1 ? common : sequence === 0 ? [...common, "node", "playwright"] : [...common, "node", "playwright", "browser", "cases", "comparison", "closed", "negativeControls", "observations"])
  assert.equal(item.schemaVersion, 1); assert.equal(item.token, request.token); assert.equal(item.scope, request.scope)
  assert.equal(item.baselineProfile, refinementBaselineProfile); assert.equal(item.sequence, sequence); assert.equal(item.kind, ["started", "connected", "result"][sequence])
  if (sequence !== 1) { assertShellNode({ node: String(item.node) }); assert.equal(item.playwright, "1.62.0") }
  if (sequence === 2) {
    assert.match(String(item.browser), /^\d+\.\d+\.\d+\.\d+$/u)
    assert.deepEqual(item.cases, refinementCases(request.scope).map(scenario => scenario.name)); assert.equal(item.closed, true)
    assert.equal(item.comparison, copy ? "refined-copy-with-original-state-machine" : "unchanged-shell-with-closed-refinement-islands")
    assert.deepEqual(item.negativeControls, copy ? copyNegativeControls : ["/-final-css", "/-foundation-css", "/404.html-final-css"])
    assert.ok(Array.isArray(item.observations) && item.observations.length === refinementCases(request.scope).length)
    item.observations.forEach((value, index) => {
      const observation = shellRecord(value), scenario = refinementCases(request.scope)[index]!
      if (copy) {
        keys(observation, ["name", "command", "baselineCommand", "steps", "elementsPerSample", "baselineElementsPerSample", "current", "baseline"])
        assert.equal(observation.command, refinementInstallCommand); assert.equal(observation.baselineCommand, oldCopyCommand)
        assert.deepEqual(observation.steps, copySteps); assert.equal(observation.elementsPerSample, refinementCopyElementKeys.length)
        assert.equal(observation.baselineElementsPerSample, copyElementKeys.length)
        assertCopyPorts(observation.current as CopyEvidence["ports"], refinementInstallCommand)
        assertCopyPorts(observation.baseline as CopyEvidence["ports"], oldCopyCommand)
      } else {
        keys(observation, ["name", "islands", "codeBlocks", "interfaceRows", "sourceDisclosure", "material", "foundationRestored", "transparencyRestored"])
        const home = scenario.route === "/"
        assert.equal(observation.islands, home ? 9 : 0); assert.equal(observation.codeBlocks, home ? 6 : 0)
        assert.equal(observation.interfaceRows, home ? 4 : 0); assert.equal(observation.sourceDisclosure, home)
        assert.equal(observation.material, home); assert.equal(observation.foundationRestored, home && scenario.width === 1440 && scenario.theme === "system" && scenario.system === "light")
        assert.equal(observation.transparencyRestored, needsLanternTransparency(scenario))
      }
      assert.equal(observation.name, scenario.name)
    })
  }
  return item
}
export function parseRefinementCaseFailure(value: unknown, request: RefinementRequest): Record<string, unknown> {
  const item = shellRecord(value)
  keys(item, ["schemaVersion", "scope", "token", "accepted", "completed", "scenario", "stage", "comparedCases", "error"])
  assert.equal(item.scope, request.scope); assert.equal(item.schemaVersion, 1); assert.equal(item.token, request.token)
  assert.equal(item.accepted, false); assert.equal(item.completed, false)
  assert.ok(["current", "baseline", "pair", "comparison"].includes(String(item.stage)))
  const cases = refinementCases(request.scope)
  assert.ok(Array.isArray(item.comparedCases) && item.comparedCases.length < cases.length)
  assert.deepEqual(item.comparedCases, cases.slice(0, item.comparedCases.length).map(item => item.name))
  assert.equal(item.scenario, cases[item.comparedCases.length]!.name)
  assert.ok(typeof item.error === "string" && item.error.length > 0 && item.error.length <= 2048 && !/[\x00-\x1f]/u.test(item.error))
  return item
}
export function refinementCaseFailure(request: RefinementRequest, scenario: string, stage: string, comparedCases: readonly string[], error: unknown) {
  // Reuse bounded aggregate formatting without confusing profile identities.
  const formatted = marketingCaseFailure({ ...request, scope: marketingScope, baselineProfile: marketingBaselineProfile },
    siteShellCases[0]!.name, stage, [], error)
  return parseRefinementCaseFailure({ ...formatted, scope: request.scope, scenario, comparedCases }, request)
}
const near = (actual: string | number, expected: number, label: string, tolerance = .5) =>
  assert.ok(Math.abs(Number.parseFloat(String(actual)) - expected) <= tolerance, `${label}: ${actual} != ${expected}`)

/** The only DOM substitutions are six literal reviewed islands. Their complete
 * current serialized HTML is first checked against a separately stored fixture.
 * The remaining body, including every compiled shell class, stays byte-exact. */
export async function refinementDom(page: Page, current: boolean, scenario: ShellCase): Promise<string> {
  return page.evaluate(({ current, home, islands }) => {
    const root = document.body.cloneNode(true) as HTMLElement
    for (const script of root.querySelectorAll("script")) script.remove()
    const normalizeInstall = (root: Element, fixture: boolean) => {
      const liveIdleClass = root.querySelector("[data-copy-command-button]")?.getAttribute("class")
      const hooks: [string, number][] = [[".install-note",1],[".panel-label",1],[".panel-note",2],[".panel-note a",2],
        ["[data-copy-command]",1],["[data-copy-command-value]",1],["[data-copy-command-button]",1],
        [".copy-command__note",1],[".copy-command__note > code",1],["[data-copy-command-status]",1],["template textarea",0]]
      for (const [selector,count] of hooks) {
        const elements = [...root.querySelectorAll(selector)]
        if(elements.length !== count) throw Error(`Refinement compiler owner count ${selector}`)
        for(const element of elements) {
          const atoms=[...element.classList].filter(value=>/^x[a-zA-Z0-9]+$/u.test(value))
          if(atoms.length===0 || (fixture && atoms.join()!=="xfixture")) throw Error(`Missing exact compiler transport ${selector}`)
          for(const atom of atoms) element.classList.remove(atom)
          if(element.className==="") element.removeAttribute("class")
        }
      }
      const button=root.querySelector("[data-copy-command-button]")!
      const states=["idle","copied","failed"].map(state=>{
        const name=`data-copy-${state}-class`, value=button.getAttribute(name)
        if(value===null || !/^copy-command__button(?: x[a-zA-Z0-9]+)+$/u.test(value)) throw Error("Invalid finite copy state transport")
        button.removeAttribute(name);return value
      })
      if(!fixture && (new Set(states).size!==3 || liveIdleClass!==states[0])) throw Error("Copy states collapsed or live idle transport changed")
      if(fixture) button.removeAttribute("hidden")
      const templates=root.querySelectorAll("template[data-copy-command-fallback]")
      if(templates.length!==1) throw Error("Fallback template count")
      const template=templates[0] as HTMLTemplateElement, children=template.content.querySelectorAll("*")
      if(children.length!==1 || children[0]!.tagName!=="TEXTAREA" || children[0]!.getAttribute("readonly")!=="" || !/^x[a-zA-Z0-9]+(?: x[a-zA-Z0-9]+)*$/u.test(children[0]!.className)) throw Error("Fallback template inventory")
      children[0]!.removeAttribute("class")
    }
    if(home) for(const [selector,html] of Object.entries(islands)) {
      const matches=root.querySelectorAll(selector)
      if(matches.length!==1) throw Error(`Exact refinement island ${selector}`)
      const actual=matches[0]!
      if(current) {
        const template=document.createElement("template");template.innerHTML=html
        if(template.content.childElementCount!==1) throw Error(`Fixture root ${selector}`)
        const expected=template.content.firstElementChild!
        if(selector==="#install") {normalizeInstall(actual,false);normalizeInstall(expected,true)}
        if(actual.outerHTML!==expected.outerHTML) throw Error(`Authored refinement island differs: ${selector}`)
      }
      actual.replaceWith(document.createComment(`reviewed-refinement:${selector}`))
    }
    return root.outerHTML
  }, { current, home: scenario.route === "/", islands: refinementIslands })
}

export interface RefinementPaint { readonly [selector: string]: Readonly<Record<string, string>> }
/** Pinned 0.8 paint formulas: literal palette and asset inputs, never target
 * custom properties or stylesheet text used as an oracle. */
export async function refinementPaint(page: Page, scenario: ShellCase, assets: readonly [string,string], reduced=false): Promise<RefinementPaint> {
  return page.evaluate(({ dark, forced, assets, reduced, width }) => {
    const ink=forced?"CanvasText":dark?"#f5f2ed":"#1c1917", plane=forced?"Canvas":dark?"#1d1a18":"#fffefa", paper=forced?"Canvas":dark?"#12100f":"#f8f7f4"
    const seam=forced?"CanvasText":`color-mix(in oklch, ${ink} 7%, ${plane})`, edge="color-mix(in oklch, white 18%, transparent)"
    const lift=`inset 0 1px 0 ${edge}, -3px -3px 10px color-mix(in oklch, white 4%, transparent), 2px 4px 8px color-mix(in oklch, black 7%, transparent), 8px 18px 40px color-mix(in oklch, black 9%, transparent)`
    const result: Record<string,Record<string,string>>={}
    const sample=(key:string,declarations:Record<string,string>)=>{
      const node=document.createElement("div");node.style.position="fixed";node.style.top="-10000px"
      for(const [key,value] of Object.entries(declarations))node.style.setProperty(key,value)
      document.documentElement.append(node)
      try {const style=getComputedStyle(node);result[key]=Object.fromEntries(Object.keys(declarations).map(key=>[key,style.getPropertyValue(key)]))}finally{node.remove()}
    }
    sample(".topbar",{"border-bottom-color":seam,"box-shadow":forced?"none":`inset 0 1px 0 ${edge}, 0 4px 12px color-mix(in oklch, black 4%, transparent)`,"background-color":forced||reduced?plane:`color-mix(in oklch, ${plane} 90%, transparent)`,"backdrop-filter":forced||reduced?"none":"blur(20px) saturate(1.1)"})
    sample(".hraness-marketing-hero",{"background-color":paper,"background-image":forced||reduced?"none":`url("${new URL(assets[0]!,location.origin).href}"), url("${new URL(assets[1]!,location.origin).href}"), radial-gradient(ellipse at 60% 110%, color-mix(in oklch, #d49a54 22%, transparent), transparent 68%), linear-gradient(110deg, color-mix(in oklch, #8d9fc5 14%, transparent), transparent 38%, color-mix(in oklch, white 4%, transparent) 65%, transparent)`,"background-size":`64px 64px, ${width<=760?576:768}px ${width<=760?576:768}px, 100% 100%, 100% 100%`,"background-position":"0px 0px, center top, center top, center top"})
    sample(".hraness-marketing-proof-frame",{"background-color":plane,color:ink,"border-top-color":seam,"border-right-color":seam,"border-bottom-color":seam,"border-left-color":seam,"border-radius":"14px","box-shadow":forced?"none":lift})
    sample(".hraness-marketing-proof-frame__chrome",{"background-image":forced?"none":dark?"linear-gradient(#393b36, #292b27)":"linear-gradient(#f8f7f3, #e7e6e0)","box-shadow":forced?"none":`inset 0 1px 0 ${edge}, 0 1px 3px color-mix(in oklch, black 8%, transparent)`})
    sample("#install",{"border-radius":"14px"})
    sample("section-line",{"border-top-color":forced?"CanvasText":`color-mix(in oklch, ${ink} 7%, transparent)`})
    sample("syntax", {color:ink,"background-color":plane})
    sample("warm",{"background-color":forced?"Highlight":`color-mix(in oklch, #d49a54 12%, ${plane})`,color:forced?"HighlightText":ink})
    return result
  }, {dark:resolvedShellTheme(scenario.theme,scenario.system)==="dark",forced:scenario.forced==="active",assets,reduced,width:scenario.width})
}
export function projectRefinementPaint(item: ShellElement, baseline: ShellElement, paint: RefinementPaint): ShellElement {
  const selector=item.key.replace(/\[0\]$/u,""), expected=paint[selector], styles={...item.styles}
  if(expected!==undefined)for(const [property,value]of Object.entries(expected)) {
    assert.equal(normalizeLanternPaintValue(styles[property]!),normalizeLanternPaintValue(value),`${item.key} exact 0.8 ${property}`)
    styles[property]=baseline.styles[property]!
  }
  if(marketingSectionIds.some(id=>selector===`#${id}`))for(const side of selector==="#install"?["top","right","bottom","left"]:["top"]) {
    const property=`border-${side}-color`
    assert.equal(normalizeLanternPaintValue(styles[property]!),normalizeLanternPaintValue(paint["section-line"]!["border-top-color"]!),`${selector} exact editorial seam`)
    styles[property]=baseline.styles[property]!
  }
  return {...item,styles}
}
function siblingProjection(items: readonly ShellElement[], owner: ShellEvidence): ShellElement[] {
  return items.map(item=>{
    const key=item.key.startsWith(".slopcamera-ask-ai")?".slopcamera-ask-ai[0]":item.key.startsWith(".hraness-site-footer")||item.key.startsWith("#hraness-site-footer")?"#hraness-site-footer[0]":undefined
    if(key===undefined)return item
    const anchor=owner.elements.find(item=>item.key===key);assert.ok(anchor)
    return {...item,rect:item.rect.map((value,axis)=>axis===1?value-anchor.rect[1]!:value)}
  })
}
/** The unchanged hero centers its copy beside the intentionally taller terminal.
 * Prove the complete row placement on each side before comparing the two
 * retained text anchors relative to their own copy column. */
const refinementHeroCopySelector=".slopcamera-product-hero > .hraness-marketing-hero__copy"
export interface RefinementHero {readonly copyTop:number;readonly boundaryLines:number;readonly boundaryLineHeight:number;readonly nameComputedInsets:Readonly<Record<string,string>>;readonly elements:readonly ShellElement[]}
export async function observeRefinementHero(page:Page,scenario:ShellCase):Promise<RefinementHero|undefined> {
  if(scenario.route!=="/")return undefined
  const observation=await page.evaluate(({width})=>{
    const one=(selector:string)=>{const nodes=document.querySelectorAll<HTMLElement>(selector);if(nodes.length!==1)throw Error(`Exact hero owner ${selector}`);return nodes[0]!}
    const hero=one(".slopcamera-product-hero"),copy=one(".slopcamera-product-hero > .hraness-marketing-hero__copy"),frame=one(".slopcamera-product-hero > .hraness-marketing-hero__frame"),facts=one(".slopcamera-product-hero > .hraness-marketing-facts")
    const hs=getComputedStyle(hero),cs=getComputedStyle(copy),fs=getComputedStyle(frame),ds=getComputedStyle(facts)
    if(hero.children.length!==3||hs.display!=="grid"||hs.alignItems!=="center"||cs.display!=="grid"||ds.display!=="grid")throw Error("Exact centered hero grid")
    const columns=hs.gridTemplateColumns.split(" ").map(Number.parseFloat),count=width>=992?2:1
    if(columns.length!==count||columns.some(value=>!Number.isFinite(value)||value<=0))throw Error("Exact 62rem hero columns")
    const close=(actual:number,expected:number,label:string,tolerance=.5)=>{if(!Number.isFinite(actual)||!Number.isFinite(expected)||Math.abs(actual-expected)>tolerance)throw Error(`Hero ${label}: ${actual} != ${expected}`)}
    const box=(element:HTMLElement)=>{const r=element.getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,right:r.right,bottom:r.bottom+scrollY}}
    const h=box(hero),c=box(copy),f=box(frame),d=box(facts),px=(name:string)=>Number.parseFloat(hs.getPropertyValue(name))
    const top=h.y+px("border-top-width")+px("padding-top"),left=h.x+px("border-left-width")+px("padding-left"),right=h.right-px("border-right-width")-px("padding-right"),gap=px("row-gap")
    for(const [owner,style]of [[c,cs],[f,fs],[d,ds]] as const){if(owner.width<=0||owner.height<=0)throw Error("Visible hero row owner");for(const side of ["top","right","bottom","left"])close(Number.parseFloat(style.getPropertyValue(`margin-${side}`)),0,"child margin")}
    close(gap,Math.min(56,Math.max(32,width*.04)),"row gap");close(px("column-gap"),gap,"column gap")
    close(c.width,columns[0]!,"copy width")
    if(count===2){
      close(columns[0]!/columns[1]!,.9/1.1,"column ratio",.005)
      close(f.width,columns[1]!,"frame width")
      const row=Math.max(c.height,f.height)
      close(c.y,top+(row-c.height)/2,"copy vertical center");close(f.y,top+(row-f.height)/2,"frame vertical center")
      close(d.y,top+row+gap,"facts follow shared row")
      if(hs.direction==="rtl"){close(c.right,right,"RTL copy edge");close(f.x,left,"RTL frame edge");close(c.x-f.right,gap,"RTL column separation")}
      else{close(c.x,left,"copy edge");close(f.right,right,"frame edge");close(f.x-c.right,gap,"column separation")}
    }else{
      close(c.x,left,"stacked copy edge");close(f.x,left,"stacked frame edge");close(f.width,columns[0]!,"stacked frame width")
      close(c.y,top,"stacked copy top");close(f.y,c.bottom+gap,"frame follows copy");close(d.y,f.bottom+gap,"facts follow frame")
    }
    close(d.x,left,"facts edge");close(d.right,right,"facts width");close(h.bottom,d.bottom+px("padding-bottom")+px("border-bottom-width"),"complete hero height")
    for(const selector of ["#page-title",".hraness-marketing-hero__summary"]){const t=box(one(selector));if(t.x<c.x-.5||t.right>c.right+.5||t.y<c.y-.5||t.bottom>c.bottom+.5)throw Error(`Hero text owner ${selector}`)}
    const boundary=one(".slopcamera-product-hero > .hraness-marketing-hero__copy > .hraness-marketing-hero__boundary")
    if(copy.children.length!==5||copy.lastElementChild!==boundary||boundary.childNodes.length!==1||boundary.firstChild?.nodeType!==Node.TEXT_NODE)throw Error("Closed hero copy and boundary inventory")
    const name=one(".slopcamera-product-hero > .hraness-marketing-hero__copy > .hraness-marketing-hero__name")
    if(copy.firstElementChild!==name)throw Error("Exact first hidden hero name")
    const computed=name.computedStyleMap(),nameComputedInsets:Record<string,string>={}
    for(const property of ["top","right","bottom","left"]){const value=computed.get(property);if(!(value instanceof CSSKeywordValue)||value.value!=="auto")throw Error(`Hero name computed ${property} must remain auto`);nameComputedInsets[property]=value.value}
    const range=document.createRange();range.selectNodeContents(boundary)
    const fragments=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0),lines:number[]=[]
    for(const rect of fragments){if(!lines.some(y=>Math.abs(y-rect.y)<=.5))lines.push(rect.y);const owner=boundary.getBoundingClientRect();if(rect.x<owner.x-.5||rect.right>owner.right+.5)throw Error("Contained literal hero boundary")}
    const lineHeight=Number.parseFloat(getComputedStyle(boundary).lineHeight)
    if(lines.length<1||lines.length>16||!Number.isFinite(lineHeight)||lineHeight<=0)throw Error("Finite hero boundary lines")
    close(boundary.getBoundingClientRect().height,lines.length*lineHeight,"natural boundary line height")
    return {copyTop:c.y,boundaryLines:lines.length,boundaryLineHeight:lineHeight,nameComputedInsets}
  },{width:scenario.width})
  return {...observation,elements:await measure(page,[refinementHeroCopySelector,`${refinementHeroCopySelector} > *`],["top","right","bottom","left","align-self","clip","clip-path"])}
}
/** Only literal boundary wrapping may change copy height. Every other measured
 * container/child style, dimension and relative position remains paired. */
export function compareRefinementHeroCopies(current:RefinementHero,baseline:RefinementHero):void {
  const inventory=[`${refinementHeroCopySelector}[0]`,...Array.from({length:5},(_,i)=>`${refinementHeroCopySelector} > *[${i}]`)]
  for(const side of [current,baseline]){
    assert.deepEqual(side.elements.map(item=>item.key),inventory)
    assert.ok(Number.isFinite(side.copyTop)&&Number.isInteger(side.boundaryLines)&&side.boundaryLines>=1&&side.boundaryLines<=16&&Number.isFinite(side.boundaryLineHeight)&&side.boundaryLineHeight>0)
    assert.deepEqual(side.nameComputedInsets,{top:"auto",right:"auto",bottom:"auto",left:"auto"})
    const name=side.elements[1]!
    assert.equal(name.text,"Slopcamera");assert.equal(name.rect[2],1);assert.equal(name.rect[3],1)
    for(const [property,value]of Object.entries({position:"absolute",width:"1px",height:"1px",clip:"rect(0px, 0px, 0px, 0px)","clip-path":"inset(50%)","white-space":"nowrap","overflow-x":"hidden","overflow-y":"hidden",...Object.fromEntries(["top","right","bottom","left"].flatMap(edge=>[[`margin-${edge}`,"0px"],[`padding-${edge}`,"0px"],[`border-${edge}-width`,"0px"]]))}))assert.equal(name.styles[property],value,`Exact hidden hero name ${property}`)
    near(side.elements[0]!.rect[1]!,side.copyTop,"Measured hero copy top")
    near(side.elements[5]!.rect[3]!,side.boundaryLines*side.boundaryLineHeight,"Exact natural boundary height")
  }
  near(current.elements[0]!.rect[3]!-baseline.elements[0]!.rect[3]!,current.elements[5]!.rect[3]!-baseline.elements[5]!.rect[3]!,"Copy height delta comes only from literal boundary wrapping")
  const relative=(side:RefinementHero)=>side.elements.map(item=>({...item,rect:item.rect.map((value,axis)=>axis===1&&item.styles.display!=="none"?value-side.copyTop:value)}))
  const a=relative(current),b=relative(baseline)
  // Only this proven absolute, clipped name has auto computed insets whose
  // CSSOM resolved strings contain used pixels from the moving static position.
  // Its actual copy-relative rectangle and every other measured style stay exact.
  compareShellElements(a.map((item,index)=>index===1?{...item,styles:{...item.styles,...Object.fromEntries(["top","right","bottom","left"].map(property=>[property,b[index]!.styles[property]!]))}}:index===0||index===5?{...item,text:b[index]!.text,styles:{...item.styles,height:b[index]!.styles.height!},rect:item.rect.map((value,axis)=>axis===3?b[index]!.rect[3]!:value)}:item),b,"Exact retained hero copy styles and geometry")
}
export function projectRefinementHeroPosition(item:ShellElement,currentCopyTop:number,baselineCopyTop:number):ShellElement {
  assert.ok(Number.isFinite(currentCopyTop)&&Number.isFinite(baselineCopyTop))
  if(item.key!=="#page-title[0]"&&item.key!==".hraness-marketing-hero__summary[0]")return item
  return {...item,rect:item.rect.map((value,axis)=>axis===1?value-currentCopyTop+baselineCopyTop:value)}
}
/** Explicit flow changes: only these ancestors contain redesigned content.
 * Everything else keeps exact geometry relative to its unchanged section. */
export function compareRefinementEvidence(actual:ShellEvidence,baseline:ShellEvidence,scenario:ShellCase,paint?:RefinementPaint,hero?:{current:RefinementHero|undefined;baseline:RefinementHero|undefined}):void {
  if(scenario.route==="/404.html"){compareShellEvidence(actual,baseline,scenario.name);return}
  assert.ok(paint);assert.ok(hero?.current!==undefined&&hero.baseline!==undefined);compareRefinementHeroCopies(hero.current,hero.baseline);const currentCopyTop=hero.current.copyTop,baselineCopyTop=hero.baseline.copyTop;assert.equal(actual.dom,baseline.dom,"Exact DOM outside six positively admitted islands")
  assert.equal(actual.direction,baseline.direction);assert.equal(actual.recovery,baseline.recovery)
  assertMarketingFlow(actual.elements,baseline.elements)
  const landmark = (items: readonly ShellElement[], key: string) => { const item=items.find(item=>item.key===`${key}[0]`); assert.ok(item); return item }
  const anchors=[".hraness-marketing-hero",...marketingSectionIds.map(id=>`#${id}`)]
  for(let index=1;index<anchors.length;index++) {
    const a=landmark(actual.elements,anchors[index]!),previous=landmark(actual.elements,anchors[index-1]!)
    const b=landmark(baseline.elements,anchors[index]!),oldPrevious=landmark(baseline.elements,anchors[index-1]!)
    near(a.rect[1]!-previous.rect[1]!-previous.rect[3]!,b.rect[1]!-oldPrevious.rect[1]!-oldPrevious.rect[3]!,`${scenario.name} exact section flow gap ${anchors[index]}`)
  }
  const heights=new Set(["body[0]","#main[0]",".hraness-marketing-hero[0]","#install[0]","#interfaces[0]"])
  const texts=new Set([...heights,"#questions[0]","#closing[0]"])
  const a=siblingProjection(actual.elements,actual),b=siblingProjection(baseline.elements,baseline)
  assert.deepEqual(a.map(item=>item.key),b.map(item=>item.key))
  const projected=a.map((value,index)=>{
    const old=b[index]!,item=projectRefinementPaint(value,old,paint),styles={...item.styles},rect=[...item.rect]
    if(heights.has(item.key)){assert.ok(rect[3]!>0);styles.height=old.styles.height!;rect[3]=old.rect[3]!}
    if(marketingSectionIds.some(id=>item.key===`#${id}[0]`))rect[1]=old.rect[1]!
    return projectRefinementHeroPosition({...item,styles,rect,text:texts.has(item.key)?old.text:item.text},currentCopyTop,baselineCopyTop)
  })
  compareShellElements(projected,b,`${scenario.name} finite refinement geometry/paint`)
  compareShellFocusedSkip(actual.skip,baseline.skip,`${scenario.name} focused skip`)
  for(const state of ["focus","hover"] as const) {
    const a=siblingProjection(actual[state],actual),b=siblingProjection(baseline[state],baseline)
    compareShellElements(a.map((item,index)=>projectRefinementPaint(item,b[index]!,paint)),b,`${scenario.name} ${state}`)
  }
  assert.deepEqual(actual.appearance.map(item=>[item.step,item.active]),shellAppearanceSteps.map(item=>[item.name,item.active]))
  assert.deepEqual(actual.appearance.map(item=>[item.step,item.active]),baseline.appearance.map(item=>[item.step,item.active]))
  actual.appearance.forEach((item,index)=>compareShellElements(item.elements,baseline.appearance[index]!.elements,`${scenario.name} appearance ${item.step}`))
}

const designSelectors=["#main","#page-title",...marketingHeadingIds.map(id=>`#${id}`),".topbar",".hraness-marketing-hero",".hraness-marketing-proof-frame",".hraness-marketing-proof-frame__chrome",".hraness-marketing-interface-grid",".hraness-marketing-interface",".interface-copy",".hraness-material-code","[data-copy-command-value]",".source-install > summary",".hraness-marketing-hero__actions a",".hraness-marketing-cta__actions a",...marketingSectionIds.map(id=>`#${id}`)]
export async function observeRefinementDesign(page:Page,scenario:ShellCase,payload:ShellPayload,assets:readonly [string,string],negative:boolean) {
  if(scenario.route==="/404.html") {
    assert.equal(await page.locator('[data-hraness-marketing-preset],[data-hraness-material],[class*="hraness-material-"]').count(),0)
    return {observation:{name:scenario.name,islands:0,codeBlocks:0,interfaceRows:0,sourceDisclosure:false,material:false,foundationRestored:false,transparencyRestored:false}}
  }
  assert.equal(await page.locator('html[data-hraness-material="lantern"] #main[data-hraness-marketing-preset="editorial"]').count(),1)
  assert.equal(await page.locator(".hraness-material-wall").count(),1);assert.equal(await page.locator(".hraness-material-pane").count(),1)
  const original=await measure(page,designSelectors),paint=await refinementPaint(page,scenario,assets)
  for(const item of original)projectRefinementPaint(item,item,paint)
  for(const id of ["page-title",...marketingHeadingIds]) {
    const heading=original.find(item=>item.key===`#${id}[0]`)!,size=headingSize(scenario.width,id==="page-title"?1:2)
    near(heading.styles["font-size"]!,size,id,.1);assert.match(heading.styles["font-family"]!,/Instrument Serif/u)
    assert.equal(heading.styles["font-weight"],"400");assert.equal(heading.styles.visibility,"visible");assert.equal(heading.styles.opacity,"1")
    assert.ok(heading.rect[0]!>=-.5&&heading.rect[0]!+heading.rect[2]!<=scenario.width+.5)
  }
  for(const action of original.filter(item=>item.key.startsWith(".hraness-marketing-hero__actions a[")||item.key.startsWith(".hraness-marketing-cta__actions a["))) {
    near(action.styles["border-radius"]!,8,"Canonical 0.8 marketing action radius",.1)
    assert.ok(action.rect[2]!>0&&action.rect[3]!>=(scenario.coarse?48:42)-.5,"Native marketing action target")
    assert.equal(action.styles.visibility,"visible");assert.equal(action.styles.opacity,"1")
  }
  await page.evaluate(()=>{
    const selectors=[".hraness-marketing-proof-frame__caption",".install-note","#install-title",".interface-copy"]
    for(const selector of selectors)for(const element of document.querySelectorAll<HTMLElement>(selector)) {
      const owner=element.getBoundingClientRect()
      if(owner.width<=0||owner.height<=0||element.scrollWidth>element.clientWidth+1||element.scrollHeight>element.clientHeight+1)throw Error(`Readable contained prose ${selector}`)
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT)
      for(let node=walker.nextNode();node!==null;node=walker.nextNode()) {
        if(!node.textContent?.trim())continue
        const style=getComputedStyle(node.parentElement!)
        if(style.visibility!=="visible"||style.opacity!=="1"||style.display==="none")throw Error(`Visible prose ${selector}`)
        const range=document.createRange();range.selectNodeContents(node)
        const fragments=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0)
        if(fragments.length===0||fragments.some(rect=>rect.x<owner.x-.5||rect.right>owner.right+.5||rect.y<owner.y-.5||rect.bottom>owner.bottom+.5))throw Error(`Prose text fragment containment ${selector}`)
      }
    }
  })
  const lines=await page.evaluate(({expected,width})=>{
    const owners=[document.querySelector(".transcript"),document.querySelector("[data-copy-command-value]"),...document.querySelectorAll(".hraness-marketing-interface pre")]
    if(owners.length!==6||owners.some(item=>item===null))throw Error("Six exact code owners")
    return owners.map((owner,index)=>{
      const element=owner as HTMLElement,style=getComputedStyle(element),box=element.getBoundingClientRect()
      if(element.textContent!==expected[index]||element.getAttribute("tabindex")!=="0")throw Error("Exact code text and keyboard scroll ownership")
      if(style.whiteSpace!=="pre"||style.overflowWrap!=="normal"||style.wordBreak!=="normal"||style.overflowX!=="auto")throw Error("Source lines must remain intact and scrollable")
      if(box.x<-.5||box.right>width+.5||box.width<=0||box.height<=0||element.scrollHeight>element.clientHeight+1)throw Error("Code containment")
      const container=element.closest(".hraness-marketing-proof-frame,.hraness-marketing-interface,[data-copy-command]")
      if(container===null)throw Error("Code lost its frame or row owner")
      const parent=container.getBoundingClientRect()
      if(box.x<parent.x-.5||box.right>parent.right+.5||box.y<parent.y-.5||box.bottom>parent.bottom+.5)throw Error("Code escaped its frame or row")
      const nodes=[...element.querySelectorAll("*")]
      for(const node of nodes)if(node.tagName!=="CODE"&&node.tagName!=="SPAN"||node.hasAttribute("style")||node.getAttributeNames().some(name=>name!=="class"&&name!=="data-language"))throw Error("Class-only syntax inventory")
      const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT),textNodes:Text[]=[]
      for(let node=walker.nextNode();node!==null;node=walker.nextNode())textNodes.push(node as Text)
      const positions:number[][]=[];let consumed=0
      for(const line of expected[index]!.split("\n")) {
        if(line.length) {
          let offset=0,start:Text|undefined,end:Text|undefined,startAt=0,endAt=0
          for(const node of textNodes){const next=offset+node.length;if(start===undefined&&consumed<next){start=node;startAt=consumed-offset}if(consumed+line.length<=next&&start!==undefined){end=node;endAt=consumed+line.length-offset;break}offset=next}
          if(start===undefined||end===undefined)throw Error("Exact source line range")
          const range=document.createRange();range.setStart(start,startAt);range.setEnd(end,endAt)
          const rects=[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0)
          if(rects.length===0||rects.some(rect=>Math.abs(rect.y-rects[0]!.y)>.5))throw Error("Wrapped or invisible source line")
          positions.push([rects[0]!.y,Math.max(...rects.map(rect=>rect.bottom))])
        }
        consumed+=line.length+1
      }
      if(positions.some((item,at)=>at>0&&item[0]!<=positions[at-1]![0]!))throw Error("Overlapping source lines")
      return {lines:positions.length,scroll:element.scrollWidth>element.clientWidth}
    })
  },{expected:[refinementDiagramSession,refinementInstallCommand,...refinementInterfaceExamples],width:scenario.width})
  assert.equal(lines.length,6)
  await assertRefinementSyntax(page,scenario)
  const grid=original.find(item=>item.key===".hraness-marketing-interface-grid[0]")!,rows=original.filter(item=>item.key.startsWith(".hraness-marketing-interface["))
  assert.equal(rows.length,4)
  for(const [index,row]of rows.entries()) {
    near(row.rect[0]!,grid.rect[0]!,"Full-width row start");near(row.rect[2]!,grid.rect[2]!,"Full-width row measure")
    assert.equal(row.styles.display,"grid");assert.equal(row.styles["background-color"],"rgba(0, 0, 0, 0)");assert.equal(row.styles["box-shadow"],"none")
    const cols=row.styles["grid-template-columns"]!.split(" ").map(Number.parseFloat)
    assert.equal(cols.length,scenario.width<=768?1:2)
    if(cols.length===2)near(cols[0]!/cols[1]!, .85/1.15,"Interface column proportion",.005)
    if(index>0)near(row.rect[1]!,rows[index-1]!.rect[1]!+rows[index-1]!.rect[3]!,"Unbroken interface rows")
  }
  // Native keyboard scrolling is observed and exactly restored for every code
  // owner; RTL uses its native negative scrollLeft convention.
  for(const selector of [".transcript","[data-copy-command-value]",...refinementInterfaceExamples.map((_,i)=>`.hraness-marketing-interface:nth-child(${i+1}) pre`)]) {
    const element=page.locator(selector),before=await element.evaluate(node=>({left:node.scrollLeft,top:node.scrollTop,overflow:node.scrollWidth>node.clientWidth}))
    await element.focus();await page.keyboard.press("Tab");await page.keyboard.press("Shift+Tab")
    assert.equal(await element.evaluate(node=>node===document.activeElement&&node.matches(":focus-visible")&&getComputedStyle(node).outlineStyle!=="none"&&parseFloat(getComputedStyle(node).outlineWidth)>0),true)
    if(before.overflow){await page.keyboard.press(scenario.direction==="rtl"?"ArrowLeft":"ArrowRight");await settle(page,scenario.direction);assert.notEqual(await element.evaluate(node=>node.scrollLeft),before.left)}
    await element.evaluate((node,position)=>{node.scrollLeft=position.left;node.scrollTop=position.top},before)
    assert.deepEqual(await element.evaluate(node=>({left:node.scrollLeft,top:node.scrollTop})),{left:before.left,top:before.top})
  }
  await page.locator(".wordmark").focus();await page.evaluate(()=>scrollTo({top:0,behavior:"instant"}));await settle(page,scenario.direction)
  await observeRefinementDisclosures(page,scenario,paint)
  if(negative) {
    const before=await measure(page,designSelectors),shell=await measure(page,[".topbar",".wordmark"])
    const handle=await page.evaluateHandle(path=>{const sheets=[...document.styleSheets].filter(sheet=>sheet.href===`${location.origin}${path}`);if(sheets.length!==1||sheets[0]!.disabled)throw Error("Exact foundation sheet");return sheets[0]!},payload.stylesheets[0]!)
    try {
      await handle.evaluate(async sheet=>{sheet.disabled=true;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));if(!sheet.disabled)throw Error("Lost disabled foundation")})
      const disabled=await measure(page,["#page-title"])
      assert.notEqual(disabled[0]!.styles["font-family"],before.find(item=>item.key==="#page-title[0]")!.styles["font-family"])
    }finally{await handle.evaluate(sheet=>{if(![...document.styleSheets].includes(sheet))throw Error("Lost foundation identity");sheet.disabled=false});await handle.dispose()}
    await settle(page,scenario.direction);compareShellElements(await measure(page,designSelectors),before,"Exact refinement foundation restoration")
    compareShellElements(await measure(page,[".topbar",".wordmark"]),shell,"Exact shell restoration")
  }
  if(needsLanternTransparency(scenario)) {
    const before=await measure(page,designSelectors)
    await withLanternTransparency(page,async()=>{await settle(page,scenario.direction);const reference=await refinementPaint(page,scenario,assets,true);for(const item of await measure(page,[".topbar",".hraness-marketing-hero"]))projectRefinementPaint(item,item,reference)})
    await settle(page,scenario.direction);compareShellElements(await measure(page,designSelectors),before,"Exact reduced transparency restoration")
  }
  return {paint,observation:{name:scenario.name,islands:6,codeBlocks:6,interfaceRows:4,sourceDisclosure:true,material:true,foundationRestored:negative,transparencyRestored:needsLanternTransparency(scenario)}}
}
async function assertRefinementSyntax(page:Page,scenario:ShellCase) {
  const dark=resolvedShellTheme(scenario.theme,scenario.system)==="dark",forced=scenario.forced==="active"
  const result=await page.evaluate(({dark,forced})=>{
    const roles={comment:dark?"#aaa29a":"#6c665f",keyword:dark?"#efae55":"#975600",string:dark?"#5fc98b":"#227445",name:dark?"#8fb0ff":"#1e5ae1",ink:dark?"#f5f2ed":"#1c1917",number:dark?"#ef8c82":"#b23c34"}
    const sample=(color:string)=>{const span=document.createElement("span");span.style.color=forced?"CanvasText":color;document.body.append(span);try{return getComputedStyle(span).color}finally{span.remove()}}
    const expected=Object.fromEntries(Object.entries(roles).map(([key,value])=>[key,sample(value)])),seen=new Set<string>()
    const wrappers=[...document.querySelectorAll(".syntax-code .sh__line")]
    if(wrappers.length!==1 || wrappers[0]!.tagName!=="SPAN" || wrappers[0]!.className!=="sh__line"
      || wrappers[0]!.getAttributeNames().join()!=="class" || !wrappers[0]!.parentElement?.matches(".syntax-code.language-typescript[data-language=typescript]"))
      throw Error("Exact single TypeScript line wrapper")
    const tokens=[...document.querySelectorAll(".syntax-code span:not(.sh__line)")];if(tokens.length<30||tokens.length>256)throw Error("Closed bounded syntax tokens")
    for(const token of tokens) {
      const kind=[...token.classList].find(value=>value.startsWith("syntax-token--")||value.startsWith("sh__token--"))
      if(kind===undefined)throw Error("Missing syntax kind")
      const name=kind.replace(/^(syntax-token--|sh__token--)/u,"")
      const role=["comment","flag","operator","sign"].includes(name)?"comment":["keyword","marker"].includes(name)?"keyword":["string","inline","jsxliterals"].includes(name)?"string":["command","heading","variable","class","property"].includes(name)?"name":name==="entity"?"number":["identifier","space"].includes(name)?"ink":undefined
      if(role===undefined)throw Error(`Unreviewed token role ${name}`)
      if(getComputedStyle(token).color!==expected[role])throw Error(`Exact themed syntax paint ${name}`)
      seen.add(role)
    }
    return [...seen].sort()
  },{dark,forced})
  for(const role of ["comment","keyword","name","string"])assert.ok(result.includes(role),`Present ${role} syntax`)
}
async function observeRefinementDisclosures(page:Page,scenario:ShellCase,paint:RefinementPaint) {
  assert.equal(await page.locator(".hraness-material-disclosure").count(),10)
  assert.equal(await page.locator(".hraness-material-disclosure[open]").count(),0)
  const summaries=".hraness-material-disclosure > summary",before=await measure(page,[summaries]),scroll=await page.evaluate(()=>({x:scrollX,y:scrollY}))
  try {
    for(const selector of [".source-install > summary","#questions details:first-child > summary"]) {
      const summary=page.locator(selector);await summary.focus();await page.keyboard.press("Enter");await settle(page,scenario.direction)
      assert.equal(await page.locator(".hraness-material-disclosure[open]").count(),1)
      await page.keyboard.press("Tab");await page.keyboard.press("Shift+Tab");await settle(page,scenario.direction)
      assert.equal(await summary.evaluate(node=>node===document.activeElement&&node.matches(":focus-visible")),true)
      const item=(await measure(page,[selector]))[0]!
      for(const [property,value]of Object.entries(paint.warm!))assert.equal(item.styles[property],value,`Disclosure positive ${property}`)
      assert.equal(item.styles["outline-style"],"solid");assert.equal(item.styles["outline-width"],"2px");assert.equal(item.styles["outline-offset"],"2px")
      if(selector.startsWith(".source")) {
        const link=page.locator(".source-install a");assert.equal(await link.getAttribute("href"),"https://github.com/hraness/slopcamera/blob/main/docs/how-to/use-current-source.md")
        assert.equal(await link.isVisible(),true)
      }
      await page.keyboard.press("Enter");await settle(page,scenario.direction)
      assert.equal(await page.locator(".hraness-material-disclosure[open]").count(),0)
    }
  }finally{
    await page.evaluate(()=>{for(const node of document.querySelectorAll<HTMLDetailsElement>(".hraness-material-disclosure[open]"))node.open=false})
    await page.locator(".wordmark").focus();await page.evaluate(({x,y})=>scrollTo({left:x,top:y,behavior:"instant"}),scroll);await settle(page,scenario.direction)
    compareShellElements(await measure(page,[summaries]),before,"Exact disclosure restoration")
  }
}

const oldCopyCommand="bun apps/desktop/dist/cli/main.js skill install --target agents"
const retainedCopyKeys=["[data-copy-command-button][0]",".copy-command__note[0]",".copy-command__note > code[0]","[data-copy-command-status][0]"]
export function compareRefinementCopy(current:CopyEvidence,baseline:CopyEvidence,scenario:ShellCase,negative:boolean) {
  assert.equal(current.command,refinementInstallCommand);assert.equal(baseline.command,oldCopyCommand)
  assert.deepEqual(current.negativeControls,negative?copyNegativeControls:[]);assert.deepEqual(baseline.negativeControls,[])
  for(const [side,inventory]of [[current,refinementCopyElementKeys],[baseline,copyElementKeys]] as const){assert.deepEqual(side.steps.map(item=>item.name),copySteps);for(const step of side.steps)assert.deepEqual(step.elements.map(item=>item.key),inventory);assertCopyPorts(side.ports,side.command)}
  for(const [index,step]of current.steps.entries()) {
    const old=baseline.steps[index]!
    for(const key of retainedCopyKeys) {
      const a=step.elements.find(item=>item.key===key)!,b=old.elements.find(item=>item.key===key)!
      assert.deepEqual(a.semantics,{...b.semantics,...(key.includes("button")?{"aria-label":"Copy install commands"}:{})})
      assert.equal(a.text,key===".copy-command__note > code[0]"?refinementAlternateCommand:key===".copy-command__note[0]"?`For Claude Code: ${refinementAlternateCommand}`:b.text)
      // These retained controls preserve typography, reset declarations,
      // visible focus and physical phone border, despite changed line lengths.
      const differences=new Set(["color","background-color","border-top-color","border-right-color","border-bottom-color","border-left-color","width","height","grid-template-columns"])
      for(const [property,value]of Object.entries(a.styles)) {
        if(differences.has(property))continue
        if(["text-decoration-color","outline-color"].includes(property) && value===a.styles.color && b.styles[property]===b.styles.color)continue
        assert.equal(value,b.styles[property],`${scenario.name} ${step.name} ${key} retained ${property}`)
      }
    }
    assertRefinementCopyPaint(step.elements,scenario,step.name)
  }
  return {name:scenario.name,command:current.command,baselineCommand:baseline.command,steps:copySteps,elementsPerSample:refinementCopyElementKeys.length,baselineElementsPerSample:copyElementKeys.length,current:current.ports,baseline:baseline.ports}
}
/** Theme-dependent copy values are positively checked, never substituted from
 * the baseline or merely required to differ. Geometry retains physical edges. */
export function assertRefinementCopyPaint(elements:readonly ShellElement[],scenario:ShellCase,state:string) {
  const get=(key:string)=>{const item=elements.find(item=>item.key===`${key}[0]`);assert.ok(item);return item}
  const button=get("[data-copy-command-button]"),value=get("[data-copy-command-value]"),panel=get("[data-copy-command]"),dark=resolvedShellTheme(scenario.theme,scenario.system)==="dark"
  assert.equal(value.text,refinementInstallCommand.replace(/\s+/gu," "))
  assert.equal(value.styles["white-space"],"pre");assert.equal(value.styles["overflow-wrap"],"normal");assert.equal(value.styles["overflow-x"],"auto")
  assert.equal(button.styles["border-top-width"],scenario.width<=544?"1px":"0px");assert.equal(button.styles["border-left-width"],scenario.width<=544?"0px":"1px")
  assert.ok(button.rect[2]!>=70.4-.5&&button.rect[3]!>=44-.5)
  const ink=dark?"rgb(232, 234, 229)":"rgb(38, 41, 35)",muted=dark?"rgb(191, 198, 182)":"rgb(89, 96, 82)",command=dark?"rgb(196, 217, 185)":"rgb(54, 84, 61)"
  if(scenario.forced==="none") {
    assert.equal(panel.styles["background-color"],dark?"rgb(32, 33, 31)":"rgb(243, 242, 238)")
    assert.equal(button.styles.color,["fallback-failed","failed-hover","fallback-throw"].includes(state)?command:state==="idle-focus"?muted:ink)
    assert.equal(get(".copy-command__note").styles.color,muted);assert.equal(get(".copy-command__note > code").styles.color,ink)
  } else {
    assert.equal(panel.styles["background-image"],"none")
    // System colors are resolved and checked by observeRefinementCopyPaint
    // on a separate native probe in this same owned context.
  }
}

export async function observeRefinementCopyPaint(page: Page, scenario: ShellCase, state: string, elements: readonly ShellElement[]): Promise<void> {
  const expected = await page.evaluate(({ dark, forced, state }) => {
    const plane = forced ? "Canvas" : dark ? "#20211f" : "#f3f2ee", ink = forced ? "CanvasText" : dark ? "#e8eae5" : "#262923"
    const muted = forced ? "CanvasText" : dark ? "#bfc6b6" : "#596052", command = forced ? "LinkText" : dark ? "#c4d9b9" : "#36543d"
    const active = !["idle-focus", "fallback-failed"].includes(state), failed = ["fallback-failed", "failed-hover", "fallback-throw"].includes(state)
    const probe = (tag: string, declarations: Record<string, string>) => {
      const node = document.createElement(tag); node.style.position = "fixed"; node.style.top = "-10000px"
      for (const [key, value] of Object.entries(declarations)) node.style.setProperty(key, value)
      document.body.append(node)
      try { const style = getComputedStyle(node); return Object.fromEntries(Object.keys(declarations).map(key => [key, style.getPropertyValue(key)])) }
      finally { node.remove() }
    }
    return {
      panel: probe("div", { "background-color": plane }),
      button: probe("button", { color: failed ? command : active ? ink : muted,
        "background-color": active ? `color-mix(in srgb, ${command} 14%, transparent)` : "transparent" }),
      note: probe("p", { color: muted }), code: probe("code", { color: ink }),
    }
  }, { dark: resolvedShellTheme(scenario.theme, scenario.system) === "dark", forced: scenario.forced === "active", state })
  for (const [selector, reference] of [["[data-copy-command]", expected.panel], ["[data-copy-command-button]", expected.button],
    [".copy-command__note", expected.note], [".copy-command__note > code", expected.code]] as const) {
    const item = elements.find(item => item.key === `${selector}[0]`); assert.ok(item)
    for (const [property, value] of Object.entries(reference)) assert.equal(item.styles[property], value, `${scenario.name} ${state} native themed ${selector} ${property}`)
  }
  const panel=elements.find(item=>item.key==="[data-copy-command][0]")!,value=elements.find(item=>item.key==="[data-copy-command-value][0]")!,button=elements.find(item=>item.key==="[data-copy-command-button][0]")!,note=elements.find(item=>item.key===".copy-command__note[0]")!
  for(const item of [value,button,note]) {
    assert.ok(item.rect[0]!>=panel.rect[0]!-.5&&item.rect[0]!+item.rect[2]!<=panel.rect[0]!+panel.rect[2]!+.5)
    assert.ok(item.rect[1]!>=panel.rect[1]!-.5&&item.rect[1]!+item.rect[3]!<=panel.rect[1]!+panel.rect[3]!+.5)
    assert.equal(item.styles.visibility,"visible");assert.equal(item.styles.opacity,"1")
  }
  near(note.rect[2]!,panel.rect[2]!-2,"Copy note spans both columns")
  if(scenario.width<=544)near(button.rect[1]!,value.rect[1]!+value.rect[3]!,"Phone copy button follows intact source lines")
  else near(button.rect[1]!,value.rect[1]!,"Desktop copy button shares command row")
}
