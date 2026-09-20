import assert from "node:assert/strict"
import { realpath, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, isAbsolute, join } from "node:path"
import { pathToFileURL } from "node:url"
import { bounded, withPreviewCancellation } from "./preview-browser-contract"
import { assertShellNode, checkShellCase, ShellPairFailure, settleShellPair } from "./site-shell-browser-contract"
import { parseExamplesRequest, parseExamplesPhase, examplesCaseNames, examplesDeadlineMs, examplesCaseFailure,
  observeExamplesDesign, examplesDom, compareExamplesEvidence, compareExamplesCopy, checkExamplesDocs, checkExamplesPlayer,
  examplesDocsCases, examplesDocsExtraCases, examplesPlayerCases, examplesNegativeControls, examplesScope } from "./site-examples-browser-contract"
import { observeRefinementHero } from "./site-refinement-browser-contract"
import { examplesFlowSections } from "./site-examples-profile"
import { refinementCopyProfile } from "./site-refinement-profile"
import { measure, siteShellCases } from "./site-shell-browser-contract"
import { decodeProfiledWorkerJson, encodeProfiledWorkerJson, publishProfiledWorkerPhase, workerAttachmentMs, examplesWorkerProtocolLimit } from "./preview-browser-protocol"
import { readPreviewFile } from "./preview-file"
import { assertOwnedPreviewEndpoint, closeOwnedPreviewBrowser } from "./preview-browser-shutdown"
import { checkCopyCase, siteCopyCases } from "./site-copy-browser-contract"

// This entry is bundled by the Bun parent, then executed by genuine pinned
// Node. The temporary bundle resolves dependencies only from the explicit app.
async function main() {
  const started = performance.now()
  const node = assertShellNode(process.versions)
  assert.equal(process.argv.length, 4)
  const appDirectory = process.argv[2], requestPath = process.argv[3]
  assert.ok(isAbsolute(appDirectory) && isAbsolute(requestPath))
  assert.equal(await realpath(appDirectory), appDirectory)
  const request = parseExamplesRequest(decodeProfiledWorkerJson(await readPreviewFile(requestPath, examplesWorkerProtocolLimit), examplesScope))
  const selectedDeadline = examplesDeadlineMs
  const parsePhase = parseExamplesPhase
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
    await publishProfiledWorkerPhase(directory, 0, { ...common, ...runtime, sequence: 0, kind: "started" }, examplesScope)
    browser = await cancellation.wait(() => {
      connection = chromium.connectOverCDP(request.endpoint, { timeout: workerAttachmentMs })
      return connection
    })
    await publishProfiledWorkerPhase(directory, 1, { ...common, sequence: 1, kind: "connected" }, examplesScope)
    assert.equal(browser.version(), pinnedBrowser[0].browserVersion, "Connected browser version differs from pinned Chrome for Testing")
    const cases = [], observations = []
    const runCase = async (name, stage, operation) => {
      assert.equal(name, examplesCaseNames[cases.length], "Case order changed")
      try {
        cancellation.signal.throwIfAborted()
        const remaining = selectedDeadline - (performance.now() - started)
        assert.ok(remaining > 0, "Examples matrix exceeded its absolute deadline")
        activePair = operation()
        const observation = await cancellation.wait(() => bounded(activePair, name, Math.min(60_000, remaining)))
        observations.push(observation); cases.push(name)
      } catch (error) {
        if (error instanceof ShellPairFailure) stage = error.stage
        try {
          await bounded(writeFile(join(dirname(requestPath), "site-examples-case-failure.json"),
            encodeProfiledWorkerJson(examplesCaseFailure(request, name, stage, cases, error), examplesScope), { flag: "wx", mode: 0o600 }),
          "Partial examples failure evidence", 5_000)
        } catch (receiptError) { throw new AggregateError([error, receiptError], "Examples case failure and receipt publication failed") }
        throw error
      }
    }
    for (const scenario of siteShellCases) await runCase(scenario.name, "pair", async () => {
      const negative = scenario.width === 1440 && scenario.theme === "system" && scenario.system === "light"
      let currentDom, baselineDom, design, baselineDesign, currentPositions, baselinePositions
      const [current, baseline] = await settleShellPair(
        () => checkShellCase(browser, request.current, scenario, "current", negative, async (page, positions) => {
          currentPositions = positions;
          currentDom = await examplesDom(page, true, scenario)
          design = await observeExamplesDesign(page, scenario, request.current, negative && scenario.route === "/")
        }, "workflow-examples-v1"),
        () => checkShellCase(browser, request.baseline, scenario, "current", false, async (page, positions) => {
          baselinePositions = positions;
          baselineDom = await examplesDom(page, false, scenario)
          baselineDesign = { flow: scenario.route === "/" ? await measure(page, examplesFlowSections) : [], hero: await observeRefinementHero(page, scenario) }
        }, "workflow-examples-v1"))
      // The raw observer records obstruction evidence only. This new oracle
      // requires zero on both trees and uses no historical support allowance.
      assert.ok(currentDom && baselineDom && design && baselineDesign && currentPositions && baselinePositions)
      compareExamplesEvidence(current, baseline, scenario, design, baselineDesign, currentDom, baselineDom, currentPositions, baselinePositions,
        { current: request.current.origin, baseline: request.baseline.origin })
      return { name: scenario.name, passed: true, currentObstructions: current.obstructions, baselineObstructions: baseline.obstructions }
    })
    for (const scenario of siteCopyCases) await runCase(scenario.name, "pair", async () => {
      const negative = scenario === siteCopyCases[0]
      const [current, baseline] = await settleShellPair(
        () => checkCopyCase(browser, request.current, scenario, negative, refinementCopyProfile),
        () => checkCopyCase(browser, request.baseline, scenario, false, refinementCopyProfile))
      return compareExamplesCopy(current, baseline, scenario, negative)
    })
    for (const scenario of [...examplesDocsCases, ...examplesDocsExtraCases])
      await runCase(scenario.name, "docs", () => checkExamplesDocs(browser, request, scenario))
    for (const name of examplesPlayerCases)
      await runCase(name, "player", () => checkExamplesPlayer(browser, request, name))

    matrixCompleted = true
    return { ...common, ...runtime, sequence: 2, kind: "result", browser: browser.version(),
      cases, negativeControls: examplesNegativeControls, closed: true, observations }
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
  parsePhase(result, 2, request)
  await publishProfiledWorkerPhase(directory, 2, result, examplesScope)
}

await main()
