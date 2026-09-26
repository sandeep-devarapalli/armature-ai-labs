import { beforeAll, describe, expect, it, vi } from 'vitest';

let scan;
beforeAll(async () => {
  vi.stubGlobal('Deno', { env: { get: () => undefined } });
  scan = (await import('../../supabase/functions/_shared/onboarding-scanner')).scanOnboardingImage;
});
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const config = { url: 'https://scanner.example.test/scan', secret: 'synthetic-only-secret-of-32-characters' };
const good = () => new Response(png, { headers: { 'content-type': 'image/png' } });

describe('private onboarding scan boundary', () => {
  it('fails closed without configuration or unsafe transport', async () => {
    const fetcher = vi.fn();
    for (const value of [{}, { url: config.url }, { ...config, url: 'http://scanner.example.test/scan' }, { ...config, url: 'https://user:password@example.test/scan' }, { ...config, url: 'http://127.0.0.1/scan' }, { ...config, url: 'http://public.example.test/scan', local: true }]) {
      await expect(scan(png, 'image/png', value, fetcher)).rejects.toMatchObject({ status: 503 });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('allows only explicit local development transport', async () => {
    await expect(scan(png, 'image/png', { ...config, url: 'http://host.docker.internal:55580/scan', local: true }, vi.fn(async () => good()))).resolves.toEqual(png);
  });
  it('returns normalized bytes and prohibits redirects', async () => {
    const fetcher = vi.fn(async () => good());
    expect(await scan(png, 'image/png', config, fetcher)).toEqual(png);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'POST' });
  });
  it('rejects unsafe verdicts and unavailable scanners', async () => {
    for (const status of [401, 500, 503]) await expect(scan(png, 'image/png', config, vi.fn(async () => new Response('', { status })))).rejects.toMatchObject({ status: 503 });
    await expect(scan(png, 'image/png', config, vi.fn(async () => new Response('', { status: 422 })))).rejects.toMatchObject({ status: 422 });
  });
  it('rejects wrong content type, empty and fake image responses', async () => {
    for (const response of [new Response(png, { headers: { 'content-type': 'image/jpeg' } }), new Response('', { headers: { 'content-type': 'image/png' } }), new Response('bad', { headers: { 'content-type': 'image/png' } })]) {
      await expect(scan(png, 'image/png', config, vi.fn(async () => response))).rejects.toMatchObject({ status: 503 });
    }
  });
  it('bounds declared and streamed normalized bytes', async () => {
    for (const response of [new Response(png, { headers: { 'content-type': 'image/png', 'content-length': '5242881' } }), new Response(new Uint8Array(5242881), { headers: { 'content-type': 'image/png' } })]) {
      await expect(scan(png, 'image/png', config, vi.fn(async () => response))).rejects.toMatchObject({ status: 503 });
    }
  });
  it('aborts stalled requests after the deadline', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = async (_input, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      const result = expect(scan(png, 'image/png', config, fetcher)).rejects.toMatchObject({ status: 503 });
      await vi.advanceTimersByTimeAsync(60001);
      await result;
    } finally { vi.useRealTimers(); }
  });
});
