/** Independent current-design acceptance. Historical profiles are unchanged. */
export const examplesScope = "workflow-examples-v1"
export const examplesBaselineProfile = "before-workflow-examples-437a530-v1"
export const examplesBaselineRevision = "437a530ee81bd0816c911f216f4331c88770bf31"
export const examplesBaselineTree = "4a453ddc4aecd6c68a2135dcf447dc323efa6c6d"
export const examplesDeadlineMs = 720_000
export interface ExamplesIsland { readonly selector: string; readonly baseline: string; readonly current: string }
/** Deliberately empty until final authored islands receive independent review.
 * Empty fixtures compare every body byte; they cannot admit an unreviewed change. */
export const examplesIslands: readonly ExamplesIsland[] = []
export const examplesHomeIds = ["native-product", "editorial", "island-pulse", "education-luma", "source-to-film", "crescent-pavilion"] as const
export const examplesFlowSections = [".hraness-marketing-hero", "#install", "#examples", "#workflow", "#interfaces", "#design", "#questions", "#closing"] as const
/** Final content review selects only the sections whose authored height changes. */
export const examplesHeightOwners: readonly string[] = [".hraness-marketing-hero", "#examples", "#workflow"]
