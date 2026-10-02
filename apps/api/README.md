# @hraness/slopcamera-api

Hosted Slopcamera tool surface for agent platforms. Serves the canonical MCP tool registry over REST (`/v1/tools/{name}/call`) and a stateless MCP endpoint (`/v1/mcp`), with R2 artifact tickets and Credits-billed image generation.

```sh
bun run dev      # http://localhost:8787
bun test ./src   # focused tests
```

Configuration, tiers, file transport, and deployment are documented in [docs/hosted-api.md](../../docs/hosted-api.md).
