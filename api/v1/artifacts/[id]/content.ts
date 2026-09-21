import {
  handleVercelRequest,
  queryValue,
  type VercelRequestLike,
  type VercelResponseLike,
} from "../../../../apps/api/src/vercel.js"

export default (req: VercelRequestLike, res: VercelResponseLike) =>
  handleVercelRequest(req, res, `/v1/artifacts/${queryValue(req.query?.id)}/content`)
