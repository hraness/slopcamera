import assert from "node:assert/strict"
import { realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join } from "node:path"
import { pathToFileURL } from "node:url"
import { bounded, withPreviewCancellation } from "./preview-browser-contract"
import { assertShellNode, checkShellCase, ShellPairFailure, settleShellPair } from "./site-shell-browser-contract"
import { parsePortfolioRequest, parsePortfolioPhase, portfolioCaseNames, portfolioDeadlineMs, portfolioOrdinaryDeadlineMs,
  portfolioCaseFailure, observePortfolioDesign, portfolioDom, comparePortfolioSemantics, comparePortfolioCopy,
  checkPortfolioDocs, portfolioProbeRequest, portfolioNegativeControls, portfolioScope, portfolioBaselineRevision,
  parsePortfolioRenderReference, normalizePortfolioRender, assertPortfolioReference } from "./site-portfolio-browser-contract"
import { checkExamplesPlayer, examplesDocsCases, examplesDocsExtraCases, examplesPlayerCases } from "./site-examples-browser-contract"
import { refinementCopyProfile } from "./site-refinement-profile"
import { siteShellCases } from "./site-shell-browser-contract"
import { decodeProfiledWorkerJson, encodeProfiledWorkerJson, publishProfiledWorkerPhase, workerAttachmentMs, portfolioWorkerProtocolLimit } from "./preview-browser-protocol"
import { readPreviewFile } from "./preview-file"
import { assertOwnedPreviewEndpoint, closeOwnedPreviewBrowser } from "./preview-browser-shutdown"
import { checkCopyCase, siteCopyCases } from "./site-copy-browser-contract"
import { packPortfolioRender } from "./site-portfolio-reference-codec"

// This entry is bundled by the Bun parent, then executed by genuine pinned
// Node. The temporary bundle resolves dependencies only from the explicit app.
async function main() {
  const started = performance.now()
  const node = assertShellNode(process.versions)
  assert.equal(process.argv.length, 4)
  const appDirectory = process.argv[2], requestPath = process.argv[3]
  assert.ok(isAbsolute(appDirectory) && isAbsolute(requestPath))
  assert.equal(await realpath(appDirectory), appDirectory)
  const request = parsePortfolioRequest(decodeProfiledWorkerJson(await readPreviewFile(requestPath, portfolioWorkerProtocolLimit), portfolioScope))
  const selectedDeadline = portfolioDeadlineMs
  let reference
  try { reference = parsePortfolioRenderReference(JSON.parse(Buffer.from(await readPreviewFile(join(appDirectory, "scripts/portfolio-design-reference.json"))).toString("utf8"))) }
  catch (error) { if (error?.code !== "ENOENT") throw error }
  const preset = JSON.parse(Buffer.from(await readPreviewFile(join(appDirectory, "vendor/marketing-preset/provenance.json"), 64 * 1024)).toString("utf8"))
  const material = JSON.parse(Buffer.from(await readPreviewFile(join(appDirectory, "vendor/lantern-material/provenance.json"), 64 * 1024)).toString("utf8"))
  assert.match(preset.source.commit, /^[a-f0-9]{40}$/u)
  assert.equal(material.source.commit, preset.source.commit, "One immutable material and preset revision")
  if (reference) assert.equal(reference.designKitRevision, preset.source.commit)
  const captured = {}
  const record = (name, value) => {
    assert.ok(!Object.hasOwn(captured, name), "A render case may be captured only once")
    const normalized = normalizePortfolioRender(value, [request.current, request.baseline])
    if (reference) assertPortfolioReference(normalized, reference, name)
    captured[name] = normalized === null ? null : packPortfolioRender(normalized)
  }
  const parsePhase = parsePortfolioPhase
  assert.equal(request.appDirectory, appDirectory)
  const directory = join(dirname(requestPath), "worker-protocol")
  assert.equal(await realpath(directory), directory)
  const require = createRequire(join(appDirectory, "package.json"))
  const packagePath = await realpath(require.resolve("playwright-core/package.json"))
  const manifest = JSON.parse(Buffer.from(await readPreviewFile(packagePath, 64 * 1024)).toString())
  assert.equal(manifest.version, "1.62.0")
  const { chromium } = await import(pathToFileURL(join(dirname(packagePath), "index.mjs")).href)
  assert.equal(await realpath(chromium.executablePath()), request.chromeExecutable,
    "The explicit Chrome for Testing executable must be the revision selected by pinned Playwright")
  const browserManifest = JSON.parse(Buffer.from(await readPreviewFile(join(dirname(packagePath), "browsers.json"), 64 * 1024)).toString())
  const pinnedBrowser = browserManifest.browsers.filter(value => value.name === "chromium")
  assert.equal(pinnedBrowser.length, 1)
  const common = { schemaVersion: 1, token: request.token, scope: request.scope, baselineProfile: request.baselineProfile }, runtime = { node, playwright: "1.62.0" }
  let browser, connection, activePair, signal, matrixCompleted = false
  const result = await withPreviewCancellation(process, async cancellation => {
    signal = cancellation.signal
    await publishProfiledWorkerPhase(directory, 0, { ...common, ...runtime, sequence: 0, kind: "started" }, portfolioScope)
    browser = await cancellation.wait(() => {
      connection = chromium.connectOverCDP(request.endpoint, { timeout: workerAttachmentMs })
      return connection
    })
    await publishProfiledWorkerPhase(directory, 1, { ...common, sequence: 1, kind: "connected" }, portfolioScope)
    assert.equal(browser.version(), pinnedBrowser[0].browserVersion, "Connected browser version differs from pinned Chrome for Testing")
    const cases = [], observations = []
    const runCase = async (name, stage, operation) => {
      assert.equal(name, portfolioCaseNames[cases.length], "Case order changed")
      try {
        cancellation.signal.throwIfAborted()
        const elapsed = performance.now() - started
        const remaining = Math.min(selectedDeadline - elapsed, cases.length < siteShellCases.length ? portfolioOrdinaryDeadlineMs - elapsed : Infinity)
        assert.ok(remaining > 0, "Portfolio matrix exceeded its absolute deadline")
        activePair = operation()
        const observation = await cancellation.wait(() => bounded(activePair, name, Math.min(60_000, remaining)))
        observations.push(observation); cases.push(name)
      } catch (error) {
        if (error instanceof ShellPairFailure) stage = error.stage
        try {
          await bounded(writeFile(join(dirname(requestPath), "site-portfolio-case-failure.json"),
            encodeProfiledWorkerJson(portfolioCaseFailure(request, name, stage, cases, error), portfolioScope), { flag: "wx", mode: 0o600 }),
          "Partial portfolio failure evidence", 5_000)
        } catch (receiptError) { throw new AggregateError([error, receiptError], "Portfolio case failure and receipt publication failed") }
        throw error
      }
    }
    for (const scenario of siteShellCases) await runCase(scenario.name, "pair", async () => {
      const negative = scenario.width === 1440 && scenario.theme === "system" && scenario.system === "light"
      let currentDom, baselineDom, design, positions
      const [current, baseline] = await settleShellPair(
        () => checkShellCase(browser, request.current, scenario, "current", negative, async (page, samplePositions) => {
          positions = samplePositions
          currentDom = await portfolioDom(page, true, scenario.route === "/")
          design = await observePortfolioDesign(page, scenario, request.current, negative && scenario.route === "/")
        }, "workflow-examples-v1"),
        () => checkShellCase(browser, request.baseline, scenario, "current", false, async page => {
          baselineDom = await portfolioDom(page, false, scenario.route === "/")
        }, "workflow-examples-v1"))
      assert.ok(currentDom && baselineDom && design && positions)
      comparePortfolioSemantics(current, baseline, currentDom, baselineDom)
      record(scenario.name, { shell: current, dom: currentDom, design, positions })
      return { name: scenario.name, passed: true, currentObstructions: current.obstructions, baselineObstructions: baseline.obstructions }
    })
    for (const scenario of siteCopyCases) await runCase(scenario.name, "pair", async () => {
      const negative = scenario === siteCopyCases[0]
      const [current, baseline] = await settleShellPair(
        () => checkCopyCase(browser, request.current, scenario, negative, refinementCopyProfile),
        () => checkCopyCase(browser, request.baseline, scenario, false, refinementCopyProfile))
      const observation = comparePortfolioCopy(current, baseline, scenario, negative)
      record(scenario.name, { steps: current.steps, command: current.command, negativeControls: current.negativeControls })
      return observation
    })
    for (const scenario of [...examplesDocsCases, ...examplesDocsExtraCases])
      await runCase(scenario.name, "docs", () => checkPortfolioDocs(browser, request, scenario, design => record(scenario.name, design)))
    for (const name of examplesPlayerCases) await runCase(name, "player", async () => {
      const observation = await checkExamplesPlayer(browser, portfolioProbeRequest(request), name)
      record(name, null)
      return observation
    })
    assert.deepEqual(Object.keys(captured), portfolioCaseNames)

    matrixCompleted = true
    return { ...common, ...runtime, sequence: 2, kind: "result", browser: browser.version(),
      cases, negativeControls: portfolioNegativeControls, closed: true, observations }
  }, async () => {
    const failures = []
    const collect = async operation => { try { await operation() } catch (error) { failures.push(error) } }
    if (browser !== undefined) await collect(() => matrixCompleted ? closeOwnedPreviewBrowser({ signal,
      proveOwnership: async () => assertOwnedPreviewEndpoint(await readPreviewFile(join(dirname(requestPath), "DevToolsActivePort"), 1024), request.endpoint),
      createSession: () => browser.newBrowserCDPSession(), disconnect: () => browser.close(),
    }) : bounded(browser.close(), "Browser disconnect", 5_000))
    if (connection !== undefined && browser === undefined) await collect(async () => {
      const late = await bounded(connection.then(value => value, () => undefined), "Late browser attachment settlement", 10_000)
      if (late !== undefined) await bounded(late.close(), "Late browser disconnect", 5_000)
    })
    if (activePair !== undefined) await collect(() => bounded(Promise.allSettled([activePair]), "Both underlying case settlements", 5_000))
    if (failures.length > 0) throw new AggregateError(failures, "Shell browser protocol collection failed")
  })
  if (!reference) {
    const candidate = { schemaVersion: 1, scope: portfolioScope, baselineRevision: portfolioBaselineRevision,
      designKitRevision: preset.source.commit, reviewedBy: "UNREVIEWED", cases: captured }
    const text = JSON.stringify(candidate)
    assert.ok(Buffer.byteLength(text) <= 16 * 1024 * 1024, "Portfolio capture exceeds its bounded reference size")
    await bounded(writeFile(join(dirname(requestPath), "site-portfolio-UNREVIEWED-reference.json"), text, { flag: "wx", mode: 0o600 }),
      "Unreviewed portfolio design capture", 5_000)
    throw new Error("Design capture retained after positive collection; acceptance requires independent review and a canonical portfolio-design-reference.json")
  }
  parsePhase(result, 2, request)
  await publishProfiledWorkerPhase(directory, 2, result, portfolioScope)
}

await main()
