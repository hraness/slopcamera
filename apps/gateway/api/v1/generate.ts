import { createGatewayHandler } from "../../src/handler.js"

/** One paid image generation may take minutes; the SDK's own deadline is five. */
export const maxDuration = 300

const handler = createGatewayHandler({ environment: process.env })

export async function POST(request: Request): Promise<Response> {
  return await handler(request)
}

export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } })
}
