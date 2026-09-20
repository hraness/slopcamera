import { resolve } from "node:path"
import { workflowExamples } from "../src/example-registry"
import { verifyExampleSources } from "./example-sources"

const repository = resolve(import.meta.dir, "../../..")
const count = await verifyExampleSources(repository, workflowExamples)
console.log(`Verified ${count} retained source files for ${workflowExamples.length} published examples`)
