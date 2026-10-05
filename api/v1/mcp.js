// @ts-check
import {
  handleVercelRequest,
} from "../../.api-build/vercel.js"

/**
 * @param {import("../../apps/api/src/vercel.js").VercelRequestLike} req
 * @param {import("../../apps/api/src/vercel.js").VercelResponseLike} res
 */
export default (req, res) =>
  handleVercelRequest(req, res, "/v1/mcp")
