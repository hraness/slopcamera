#!/usr/bin/env bun
import { verifySiteExamples } from "./verify-site-examples"
import { releaseCopyScope } from "./site-release-copy-profile"
import { previewFailureSummary } from "./verify-preview-layout"

if (import.meta.main) {
  try { await verifySiteExamples(process.argv.slice(2), releaseCopyScope) } catch (error) {
    process.exitCode = 1
    console.error(previewFailureSummary(error).replace("slopcamera-preview:", "slopcamera-release-copy:"))
  }
}
