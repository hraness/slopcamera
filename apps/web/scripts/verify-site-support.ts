import { previewFailureSummary } from "./verify-preview-layout"
import { verifySiteMarketing } from "./verify-site-marketing"
import { supportScope, supportCopyScope } from "./site-support-profile"

if (import.meta.main) {
  try {
    const args = process.argv.slice(2), copy = args[0] === "--copy"
    await verifySiteMarketing(copy ? args.slice(1) : args, copy ? supportCopyScope : supportScope)
  } catch (error) {
    process.exitCode = 1
    console.error(previewFailureSummary(error).replace("slopcamera-preview:", "slopcamera-support:"))
  }
}
