import { exec } from 'node:child_process';
import { DEVICE_ID, ID_TOKEN_AUDIENCE, ID_TOKEN_CMD, ID_TOKEN_SOURCE, SERVICE_URL } from './config';

// READ-ONLY client for the YAPA sync service (API v1). Only GET endpoints are
// used, so the dashboard can never mutate YAPA's data. Auth is the caller's
// Google ID token (your gcloud login locally, the runtime service account on
// GCP), sent the same way the YAPA plugin sends it:
//   Authorization: Bearer <token>   checked by Cloud Run IAM
//   X-Yapa-Id-Token: <token>        verified by the app

export interface RemoteDocument {
  id: string;
  collection: string;
  content: string;
  metadata: Record<string, unknown>;
  origin_user: string;
  last_editor: string | null;
  created_at: number;
  updated_at: number;
  synced_at: number;
}

export interface PullPage {
  documents: RemoteDocument[];
  deletions: { id: string; deleted_by: string; deleted_at: number }[];
  next_cursor: string;
  has_more: boolean;
}

/** Refresh this long before the token's `exp`. */
const REFRESH_MARGIN_MS = 5 * 60_000;

let token: string | undefined;
let validUntil = 0;
let inFlight: Promise<string> | undefined;

/**
 * The runtime service account's ID token from the metadata server, with
 * aud = ID_TOKEN_AUDIENCE. format=full is required: without it the token has no
 * `email` claim and yapa-service can't match it to YAPA_READER_PRINCIPALS.
 */
async function metadataToken(): Promise<string> {
  const q = new URLSearchParams({ audience: ID_TOKEN_AUDIENCE, format: 'full' });
  const res = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?${q}`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`metadata server ID token request failed: ${res.status}`);
  return (await res.text()).trim();
}

function mintToken(): Promise<string> {
  if (ID_TOKEN_SOURCE === 'metadata') return metadataToken();
  return new Promise((resolve, reject) => {
    exec(ID_TOKEN_CMD, { timeout: 20_000, maxBuffer: 64 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message)
          .trim()
          .split('\n')
          .slice(-1)[0];
        reject(
          new Error(
            `could not get a Google ID token (${ID_TOKEN_CMD}): ${detail}. Run \`gcloud auth login\`.`,
          ),
        );
        return;
      }
      resolve(String(stdout).trim());
    });
  });
}

function tokenExpiryMs(t: string): number {
  try {
    const payload = JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString('utf8'));
    if (Number.isFinite(payload.exp)) return payload.exp * 1000;
  } catch {
    // opaque token: fall through
  }
  return Date.now() + 2 * REFRESH_MARGIN_MS;
}

async function getToken(): Promise<string> {
  if (token && Date.now() < validUntil) return token;
  inFlight ??= mintToken()
    .then((t) => {
      token = t;
      validUntil = tokenExpiryMs(t) - REFRESH_MARGIN_MS;
      return t;
    })
    .finally(() => {
      inFlight = undefined;
    });
  return inFlight;
}

async function serviceGet<T>(path: string, retried = false): Promise<T> {
  const t = await getToken();
  const res = await fetch(`${SERVICE_URL}${path}`, {
    headers: { Authorization: `Bearer ${t}`, 'X-Yapa-Id-Token': t, 'X-Yapa-Device': DEVICE_ID },
  });
  if (res.status === 401 && !retried) {
    token = undefined;
    validUntil = 0;
    return serviceGet(path, true);
  }
  if (!res.ok) {
    // One line: Cloud Run's own rejections are HTML pages.
    const body = (await res.text())
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
    throw new Error(`GET ${path.split('?')[0]} failed: ${res.status} ${body}`);
  }
  return (await res.json()) as T;
}

/** Signed-in identity, or the error that prevents signing in. */
export async function whoami(): Promise<{ username: string; email: string }> {
  return serviceGet('/v1/me');
}

/** Verify the service (and its database) is reachable. */
export async function serviceHealthy(): Promise<boolean> {
  try {
    await serviceGet('/v1/health');
    return true;
  } catch {
    return false;
  }
}

/** Every shared collection with its document count. */
export async function listCollections(): Promise<{ name: string; count: number }[]> {
  const data = await serviceGet<{ collections: { name: string; count: number }[] }>(
    '/v1/collections',
  );
  return data.collections;
}

/**
 * One page of a collection's change feed: documents synced after `since`
 * (Unix seconds) or after `cursor`, plus deletions. `include_own_device`
 * disables echo suppression, so rows are returned regardless of who wrote them.
 */
export async function pullPage(
  collection: string,
  pos: { since: number } | { cursor: string },
): Promise<PullPage> {
  const q = new URLSearchParams({ embeddings: 'false', include_own_device: 'true', limit: '1000' });
  if ('cursor' in pos) q.set('cursor', pos.cursor);
  else q.set('since', String(pos.since));
  return serviceGet(`/v1/collections/${encodeURIComponent(collection)}/documents?${q}`);
}
