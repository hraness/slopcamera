import { readApiConfig } from "./config.ts"
import { createApiHandler } from "./handler.ts"

const config = readApiConfig(process.env)
const handler = createApiHandler({ config, env: process.env })
const port = Number(process.env.PORT ?? 8787)

const server = Bun.serve({
  port,
  hostname: process.env.HOST ?? "0.0.0.0",
  fetch: handler,
})

console.log(
  `slopcamera-api listening on ${server.url} (storage=${config.r2 !== undefined}, billing=${config.credits !== undefined}, models=${Object.keys(config.modelCostsMicroUsd).length})`,
)
