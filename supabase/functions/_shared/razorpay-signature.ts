export class RazorpayRequestError extends Error {
  constructor(public status: number, public code: string, public providerHttpStatus?: number) { super(code); }
}

export async function bodyBytes(request: Request, limit = 65536): Promise<Uint8Array> {
  if (!request.body) throw new RazorpayRequestError(400, "invalid_payload");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0, expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel(); }, 5000);
  try {
    for (;;) {
      const next = await reader.read();
      if (expired) throw new RazorpayRequestError(400, "body_timeout");
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) throw new RazorpayRequestError(413, "body_too_large");
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  } finally { clearTimeout(timer); void reader.cancel(); }
}

export async function hmacHex(secret: string, bytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes as BufferSource)), b => b.toString(16).padStart(2, "0")).join("");
}
export async function validHmac(secret: string, bytes: Uint8Array, signature: unknown): Promise<boolean> {
  if (typeof signature !== "string" || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const supplied = Uint8Array.from(signature.match(/../g)!, part => parseInt(part, 16));
  return crypto.subtle.verify("HMAC", key, supplied, bytes as BufferSource);
}
