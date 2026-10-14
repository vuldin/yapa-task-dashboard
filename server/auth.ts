import type { FastifyReply, FastifyRequest } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import { AUTH_MODE, IAP_ALLOWED_HD, IAP_AUDIENCE } from './config';

// Who is viewing. On Cloud Run, IAP signs every request it lets through with
// x-goog-iap-jwt-assertion; we verify it ourselves too (Google's guidance), so
// a misconfigured ingress or a disabled IAP can't silently open the app.
// Locally (AUTH_MODE=local) there is no gate and the viewer is whoever the
// backend signs in to yapa-service as.

export interface Viewer {
  email: string;
  /** YAPA username: the email local part, same rule as yapa-service. */
  username: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    viewer?: Viewer;
  }
}

const IAP_ISSUER = 'https://cloud.google.com/iap';
const IAP_HEADER = 'x-goog-iap-jwt-assertion';
const KEYS_TTL_MS = 60 * 60_000;

const client = new OAuth2Client();
let keys: { pubkeys: Record<string, string>; until: number } | undefined;

async function iapKeys(): Promise<Record<string, string>> {
  if (keys && Date.now() < keys.until) return keys.pubkeys;
  const { pubkeys } = await client.getIapPublicKeysAsync();
  keys = { pubkeys: pubkeys as Record<string, string>, until: Date.now() + KEYS_TTL_MS };
  return keys.pubkeys;
}

/** Mirrors usernameFromEmail in yapa's packages/service/src/store.ts. */
export function usernameFromEmail(email: string): string {
  const local = email.toLowerCase().split('@')[0] ?? '';
  return local
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function verifyIapAssertion(assertion: string): Promise<Viewer> {
  const ticket = await client.verifySignedJwtWithCertsAsync(
    assertion,
    await iapKeys(),
    IAP_AUDIENCE,
    [IAP_ISSUER],
  );
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error('no email in IAP assertion');
  if (IAP_ALLOWED_HD && payload.hd?.toLowerCase() !== IAP_ALLOWED_HD) {
    throw new Error('IAP assertion is for another domain');
  }
  const email = payload.email.toLowerCase();
  return { email, username: usernameFromEmail(email) };
}

/**
 * One JSON line per rejected request; Cloud Run turns it into jsonPayload, and
 * a log-based metric counts event="auth_failure" (infra/monitoring.tf). The
 * assertion's unverified `aud`/`iss` are included because a wrong IAP_AUDIENCE
 * is the likely misconfiguration; the token itself is never logged.
 */
function logAuthFailure(reason: string, detail?: string, assertion?: string): void {
  let claims: { aud?: unknown; iss?: unknown } = {};
  try {
    claims = JSON.parse(Buffer.from(assertion?.split('.')[1] ?? '', 'base64url').toString('utf8'));
  } catch {
    // unparseable: leave claims empty
  }
  const line = {
    severity: 'WARNING',
    message: 'IAP assertion rejected',
    event: 'auth_failure',
    reason,
    detail: detail
      ?.replace(/[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]{10,}){1,2}/g, '<jwt>')
      .slice(0, 200),
    aud: typeof claims.aud === 'string' ? claims.aud.slice(0, 200) : undefined,
    iss: typeof claims.iss === 'string' ? claims.iss.slice(0, 200) : undefined,
  };
  process.stderr.write(`${JSON.stringify(line)}\n`);
}

/**
 * onRequest hook: every route except the liveness probe needs a viewer. The
 * local-mode viewer is supplied by `localViewer` (the backend's own identity).
 */
export function requireViewer(localViewer: () => Viewer | null) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url === '/healthz') return;
    if (AUTH_MODE === 'local') {
      req.viewer = localViewer() ?? undefined;
      return;
    }
    const assertion = req.headers[IAP_HEADER];
    if (typeof assertion !== 'string' || !assertion) {
      // IAP always sets it, so a request without one bypassed IAP.
      logAuthFailure('missing_assertion');
      return reply.code(401).send({ error: 'unauthenticated' });
    }
    try {
      req.viewer = await verifyIapAssertion(assertion);
    } catch (err) {
      // Library messages can embed the token; logAuthFailure redacts it.
      logAuthFailure('invalid_assertion', (err as Error).message, assertion);
      return reply.code(401).send({ error: 'unauthenticated' });
    }
  };
}
