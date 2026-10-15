function equal(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let i = 0; i < left.length; i++) difference |= left.charCodeAt(i) ^ (right.charCodeAt(i) || 0);
  return difference === 0;
}

export async function authorizeMarketWakeup(request: Request, prefix: string, keyVariable: string, jobVariable: string): Promise<boolean> {
  const stamp = request.headers.get('x-armature-wakeup-time') ?? '';
  const signature = request.headers.get('x-armature-wakeup-signature') ?? '';
  let authorized = false;
  if (stamp || signature) {
    const key = Deno.env.get(keyVariable) ?? '';
    if (!/^\d{10}$/.test(stamp) || !/^[a-f0-9]{64}$/.test(signature) || Math.abs(Date.now() / 1000 - Number(stamp)) > 30 || key.length < 32 || key.length > 256) return false;
    const signingKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const bytes = await crypto.subtle.sign('HMAC', signingKey, new TextEncoder().encode(`${prefix}:${stamp}`));
    authorized = equal([...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''), signature);
  } else {
    const key = Deno.env.get(jobVariable) ?? '';
    const supplied = request.headers.get('x-armature-job-secret') ?? '';
    authorized = key.length >= 32 && key.length <= 256 && supplied.length <= 256 && equal(key, supplied);
  }
  if (!authorized) return false;
  if (Number(request.headers.get('content-length') ?? 0) > 64) return false;
  const reader = request.body?.getReader();
  if (!reader) return true;
  let size = 0; let content = ''; const decoder = new TextDecoder(); let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('body_timeout')), 1000); });
  try {
    for (;;) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.length; if (size > 64) return false;
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    return content.trim() === '' || content.trim() === '{}';
  } catch { return false; }
  finally { clearTimeout(timer); void reader.cancel().catch(() => {}); }
}
