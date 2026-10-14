import { createSign, generateKeyPairSync } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Config is read at import time, so set the IAP environment first.
const AUD = '/projects/123/locations/us-central1/services/task-dashboard';
vi.stubEnv('AUTH_MODE', 'iap');
vi.stubEnv('IAP_AUDIENCE', AUD);
vi.stubEnv('IAP_ALLOWED_HD', 'example.com');
vi.stubEnv('YAPA_SYNC_SERVICE_URL', 'https://yapa.example');

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

// Stub only Google's key fetch; signature, aud, iss and exp checks are the real library.
vi.spyOn(OAuth2Client.prototype, 'getIapPublicKeysAsync').mockResolvedValue({
  pubkeys: { k1: PEM },
  res: null,
} as never);

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');

function mint(claims: Record<string, unknown> = {}, kid = 'k1'): string {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', typ: 'JWT', kid });
  const body = b64({
    iss: 'https://cloud.google.com/iap',
    aud: AUD,
    iat: now,
    exp: now + 600,
    sub: 'accounts.google.com:1',
    email: 'Alice.Smith@Example.com',
    hd: 'example.com',
    ...claims,
  });
  const sig = createSign('SHA256')
    .update(`${head}.${body}`)
    .sign({ key: privateKey, dsaEncoding: 'ieee-p1363' })
    .toString('base64url');
  return `${head}.${body}.${sig}`;
}

let auth: typeof import('./auth');
beforeAll(async () => {
  auth = await import('./auth');
});

describe('verifyIapAssertion', () => {
  it('accepts a valid assertion and derives the YAPA username', async () => {
    expect(await auth.verifyIapAssertion(mint())).toEqual({
      email: 'alice.smith@example.com',
      username: 'alice-smith',
    });
  });

  const bad: [string, () => string][] = [
    ['wrong audience', () => mint({ aud: '/projects/123/locations/us-central1/services/other' })],
    ['wrong issuer', () => mint({ iss: 'https://accounts.google.com' })],
    ['expired', () => mint({ iat: 1_700_000_000, exp: 1_700_000_600 })],
    ['other domain', () => mint({ hd: 'other.example' })],
    ['no hd (personal account)', () => mint({ hd: undefined })],
    ['no email', () => mint({ email: undefined })],
    ['unknown key id', () => mint({}, 'k2')],
    [
      'tampered payload',
      () => {
        const [h, , s] = mint().split('.');
        return `${h}.${b64({ email: 'mallory@example.com', aud: AUD })}.${s}`;
      },
    ],
    ['garbage', () => 'not-a-jwt'],
  ];
  for (const [name, token] of bad) {
    it(`rejects ${name}`, async () => {
      await expect(auth.verifyIapAssertion(token())).rejects.toThrow();
    });
  }
});

describe('requireViewer (iap mode)', () => {
  function call(url: string, headers: Record<string, string> = {}) {
    const req = { url, headers } as unknown as Parameters<ReturnType<typeof auth.requireViewer>>[0];
    const reply = {
      statusCode: 200,
      code(c: number) {
        this.statusCode = c;
        return this;
      },
      send() {
        return this;
      },
    };
    const hook = auth.requireViewer(() => ({ email: 'local@example.com', username: 'local' }));
    return hook(req, reply as never).then(() => ({ req, reply }));
  }

  it('401 without the IAP header, and never falls back to the local viewer', async () => {
    const { req, reply } = await call('/api/tasks');
    expect(reply.statusCode).toBe(401);
    expect(req.viewer).toBeUndefined();
  });

  it('401 for an invalid assertion, without logging it', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((s) => {
      writes.push(String(s));
      return true;
    });
    const forged = mint({ aud: 'nope' });
    const { reply } = await call('/api/stream', { 'x-goog-iap-jwt-assertion': forged });
    spy.mockRestore();
    expect(reply.statusCode).toBe(401);
    expect(writes.join('')).not.toContain(forged.split('.')[1]);
    expect(JSON.parse(writes.join(''))).toMatchObject({
      severity: 'WARNING',
      event: 'auth_failure',
      reason: 'invalid_assertion',
      aud: 'nope',
    });
  });

  it('sets the viewer for a valid assertion', async () => {
    const { req, reply } = await call('/api/me', { 'x-goog-iap-jwt-assertion': mint() });
    expect(reply.statusCode).toBe(200);
    expect(req.viewer).toEqual({ email: 'alice.smith@example.com', username: 'alice-smith' });
  });

  it('leaves the liveness probe open', async () => {
    const { reply } = await call('/healthz');
    expect(reply.statusCode).toBe(200);
  });
});
