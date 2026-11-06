/** A client input error, safe to return without exposing server internals. */
export class RequestValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Bound the actual stream, not just Content-Length (which clients can omit). */
export async function readJsonObject(
  request: Request,
  maxBytes = 64 * 1024,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type");
  if (contentType && contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new RequestValidationError("Content-Type must be application/json", 415);
  }
  if (Number(request.headers.get("content-length")) > maxBytes) {
    throw new RequestValidationError("Request body is too large", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestValidationError("A JSON object is required");
  let text = "";
  let bytes = 0;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => undefined);
        throw new RequestValidationError("Request body is too large", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) throw new RequestValidationError("A JSON object is required");
    return value;
  } catch (error) {
    if (error instanceof RequestValidationError) throw error;
    throw new RequestValidationError("Invalid JSON body");
  } finally {
    reader.releaseLock();
  }
}

/** Only input errors become 4xx responses; programming errors must remain visible. */
export function validationResponse(error: unknown): Response {
  if (!(error instanceof RequestValidationError)) throw error;
  return Response.json({ error: error.message }, { status: error.status });
}

export function requiredString(value: unknown, name: string, maxLength = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new RequestValidationError(
      `${name} must be a non-empty string of at most ${maxLength} characters`,
    );
  }
  return value.trim();
}
