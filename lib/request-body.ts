// Count actual streamed bytes, including requests without Content-Length.
export class BodyError extends Error {
  constructor(public status: number) { super("Invalid request body"); }
}

export async function readLimitedBody(req: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new BodyError(413);
  }
  const reader = req.body?.getReader();
  if (!reader) throw new BodyError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 10000);
  const deadline = Date.now() + 10000;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (Date.now() >= deadline) throw new BodyError(408);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new BodyError(413);
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function readLimitedJson(req: Request, maxBytes = 65536): Promise<unknown> {
  const bytes = await readLimitedBody(req, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new BodyError(400); }
}

export function bodyErrorResponse(error: unknown): Response {
  const status = error instanceof BodyError ? error.status : 400;
  return Response.json({ error: status === 413 ? "送信データが大きすぎます。" : "リクエストの形式が不正です。", code: "INVALID_REQUEST" }, { status });
}
