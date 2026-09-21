import { hostedTools } from "./tools.js"
import { SLOPCAMERA_VERSION } from "../../../src/version.js"

/**
 * The OpenAPI contract published at /v1/openapi.json. This is the document
 * connector submissions (Muse "Raw API" onboarding and peers) point at.
 */
export function openApiDocument(baseUrl: string): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Slopcamera hosted tools",
      version: SLOPCAMERA_VERSION,
      description:
        "Bounded Slopcamera tool surface for agent platforms. Authoring, validation, planning and audit tools run free with rate limits; image generation is billed through Hraness Credits. Binary artifacts return as ticketed URLs backed by short-lived object storage, never inline.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/v1/health": {
        get: {
          operationId: "health",
          summary: "Service health and configured capabilities.",
          responses: { "200": { description: "Service status." } },
        },
      },
      "/v1/tools": {
        get: {
          operationId: "listTools",
          summary: "List hosted tools, tiers, and input schemas.",
          responses: { "200": { description: "Hosted tool registry." } },
        },
      },
      "/v1/tools/{name}/call": {
        post: {
          operationId: "callTool",
          summary: "Invoke one hosted tool.",
          description:
            "Supply tool arguments plus an optional files map of root-relative inputs ({path: {text|base64|upload}}). Outputs that write files return as artifact tickets.",
          parameters: [
            {
              name: "name",
              in: "path",
              required: true,
              schema: { type: "string", enum: hostedTools.map((t) => t.name) },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["arguments"],
                  properties: {
                    arguments: { type: "object" },
                    files: {
                      type: "object",
                      additionalProperties: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                          base64: { type: "string" },
                          upload: { type: "string", format: "uuid" },
                        },
                      },
                    },
                    idempotencyKey: { type: "string", maxLength: 96 },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Tool result plus artifact tickets." },
            "400": { description: "Invalid request." },
            "401": { description: "Paid tool without a device token." },
            "402": {
              description:
                "Insufficient credits; body carries a topup.url the caller's human can pay.",
            },
            "404": { description: "Unknown tool." },
            "429": { description: "Rate limited." },
          },
        },
      },
      "/v1/uploads": {
        post: {
          operationId: "createUpload",
          summary: "Create a presigned upload for one inbound file.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["contentType", "bytes"],
                  properties: {
                    contentType: { type: "string" },
                    bytes: { type: "integer", minimum: 1 },
                    sha256: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description:
                "Upload ticket with a presigned PUT URL and required headers.",
            },
          },
        },
      },
      "/v1/artifacts/{id}": {
        get: {
          operationId: "getArtifact",
          summary: "Artifact ticket metadata.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "200": { description: "Artifact record and content URL." },
            "404": { description: "Unknown or expired artifact." },
          },
        },
      },
      "/v1/artifacts/{id}/content": {
        get: {
          operationId: "getArtifactContent",
          summary: "Redirect to a short-lived download URL for the bytes.",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: {
            "302": { description: "Redirect to the presigned object URL." },
            "404": { description: "Unknown or expired artifact." },
          },
        },
      },
      "/v1/mcp": {
        post: {
          operationId: "mcp",
          summary:
            "Stateless MCP endpoint (JSON-RPC 2.0, protocol 2025-11-25) over the same tool registry.",
          responses: { "200": { description: "JSON-RPC response." } },
        },
      },
    },
    components: {
      securitySchemes: {
        creditsDeviceToken: {
          type: "http",
          scheme: "bearer",
          description:
            "Hraness Credits device token (cr_dev_…), required only for paid tools.",
        },
      },
    },
  }
}
