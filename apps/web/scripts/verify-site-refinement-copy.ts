import { previewFailureSummary } from "./verify-preview-layout"
import { verifySiteMarketing } from "./verify-site-marketing"
import { refinementCopyScope } from "./site-refinement-profile"

if (import.meta.main) {
  try { await verifySiteMarketing(process.argv.slice(2), refinementCopyScope) } catch (error) {
    process.exitCode = 1
    console.error(previewFailureSummary(error).replace("slopcamera-preview:", "slopcamera-refinement:"))
  }
}
