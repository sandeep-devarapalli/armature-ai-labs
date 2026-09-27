import { beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, verify, webcrypto } from 'node:crypto';
let scannerIdentityToken, scanOnboardingImage;

const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
const credentials = JSON.stringify({ type: 'service_account', client_email: 'scanner-invoker@synthetic-project.iam.gserviceaccount.com', private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }) });
const endpoint = name => new URL(`https://${name}.run.app/scan`);
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const idToken = (url, overrides = {}) => `${encode({ alg: 'RS256' })}.${encode({ aud: url.origin, iss: 'https://accounts.google.com', exp: Math.floor(Date.now() / 1000) + 3600, ...overrides })}.synthetic-google-response`;
const reply = token => new Response(JSON.stringify({ id_token: token }));

beforeAll(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Deno', { env: { get: () => undefined } });
  ({ scannerIdentityToken } = await import('../../supabase/functions/_shared/scanner-identity'));
  ({ scanOnboardingImage } = await import('../../supabase/functions/_shared/onboarding-scanner'));
});
describe('independent scanner identity', () => {
  it('signs a scanner-only assertion, pins OAuth endpoint and reuses unexpired tokens', async () => {
    const url = new URL('https://scanner-q62r7pjccq-el.a.run.app/scan');
    const token = idToken(url);
    const fetcher = vi.fn(async () => reply(token));
    expect(await scannerIdentityToken(credentials, url, fetcher)).toBe(token);
    expect(await scannerIdentityToken(credentials, url, fetcher)).toBe(token);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [destination, options] = fetcher.mock.calls[0];
    expect(destination).toBe('https://oauth2.googleapis.com/token');
    expect(options.redirect).toBe('error');
    const parts = options.body.get('assertion').split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
    expect(claims).toMatchObject({ iss: 'scanner-invoker@synthetic-project.iam.gserviceaccount.com', target_audience: url.origin, aud: destination });
    expect(claims).not.toHaveProperty('sub');
    expect(claims).not.toHaveProperty('scope');
    expect(verify('RSA-SHA256', Buffer.from(parts.slice(0, 2).join('.')), pair.publicKey, Buffer.from(parts[2], 'base64url'))).toBe(true);
  });
  it('refreshes near expiry and separates audiences and rotated credentials', async () => {
    vi.useFakeTimers();
    try {
      const url = endpoint('scanner-refresh');
      const fetcher = vi.fn(async () => reply(idToken(url)));
      await scannerIdentityToken(credentials, url, fetcher);
      vi.setSystemTime(Date.now() + 3541000);
      await scannerIdentityToken(credentials, url, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(2);
      const rotated = JSON.stringify({ ...JSON.parse(credentials), private_key_id: 'rotated-identity' });
      await scannerIdentityToken(rotated, url, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(3);
      const other = endpoint('scanner-other-audience');
      const otherFetcher = vi.fn(async () => reply(idToken(other)));
      await scannerIdentityToken(credentials, other, otherFetcher);
      expect(otherFetcher).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('rejects unsafe audiences and attacker-selected token endpoints before network use', async () => {
    const fetcher = vi.fn();
    for (const url of [new URL('https://example.test/scan'), new URL('http://scanner.run.app/scan'), new URL('https://scanner.run.app:8443/scan')]) {
      await expect(scannerIdentityToken(credentials, url, fetcher)).rejects.toThrow();
    }
    await expect(scannerIdentityToken(JSON.stringify({ ...JSON.parse(credentials), token_uri: 'https://attacker.test' }), endpoint('scanner-unsafe'), fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects wrong audience, issuer, expiry, missing and oversized token responses', async () => {
    let index = 0;
    for (const overrides of [{ aud: 'https://other.run.app' }, { iss: 'attacker' }, { exp: 1 }, { exp: 999999999999 }]) {
      const url = endpoint(`scanner-invalid-${index++}`);
      await expect(scannerIdentityToken(credentials, url, async () => reply(idToken(url, overrides)))).rejects.toThrow();
    }
    for (const response of [new Response('{}'), new Response('x'.repeat(16385)), new Response('credential details', { status: 401 })]) {
      await expect(scannerIdentityToken(credentials, endpoint(`scanner-invalid-${index++}`), async () => response)).rejects.toThrow();
    }
  });
  it('fails closed on network errors and a stalled OAuth request', async () => {
    await expect(scannerIdentityToken(credentials, endpoint('scanner-network'), async () => { throw new Error('network'); })).rejects.toThrow();
    vi.useFakeTimers();
    try {
      let entered;
      const started = new Promise(resolve => { entered = resolve; });
      const pending = scannerIdentityToken(credentials, endpoint('scanner-timeout'), async (_url, options) => {
        entered();
        return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('abort'))));
      });
      const check = expect(pending).rejects.toThrow();
      await started;
      await vi.advanceTimersByTimeAsync(10001);
      await check;
    } finally { vi.useRealTimers(); }
  });
  it('sends both independent authorizations and never scans after IAM exchange failure', async () => {
    const url = endpoint('scanner-dual');
    const token = idToken(url);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fetcher = vi.fn(async destination => String(destination).includes('oauth2') ? reply(token) : new Response(png, { headers: { 'content-type': 'image/png' } }));
    const config = { url: url.href, secret: 'synthetic-app-secret-at-least-32-characters', googleCredentials: credentials };
    await expect(scanOnboardingImage(png, 'image/png', config, fetcher)).resolves.toEqual(png);
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({ Authorization: `Bearer ${config.secret}`, 'X-Serverless-Authorization': `Bearer ${token}` });
    const failed = vi.fn(async () => new Response('no', { status: 403 }));
    await expect(scanOnboardingImage(png, 'image/png', { ...config, url: endpoint('scanner-denied').href }, failed)).rejects.toMatchObject({ status: 503 });
    expect(failed).toHaveBeenCalledTimes(1);
  });
});
