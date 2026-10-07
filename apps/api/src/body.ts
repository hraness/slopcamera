import { ApiError } from "./errors.js"

/**
 * Read a request body as UTF-8 text without buffering more than `maximumBytes`.
 * The declared content-length is checked first, then the stream is counted so
 * a chunked or understated body cannot exceed the limit.
 */
export async function readBoundedText(
  request: Request,
  maximumBytes: number,
): Promise<string> {
  const tooLarge = (): ApiError =>
    new ApiError(413, "too_large", "Request body exceeds the service limit.")
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > maximumBytes) throw tooLarge()
  if (request.body === null) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maximumBytes) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}
