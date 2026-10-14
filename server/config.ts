import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The plugin's configured sync service URL (~/.claude/settings.json), if any. */
function pluginServiceUrl(): string | undefined {
  try {
    const settings = JSON.parse(readFileSync(join(homedir(), '.claude', 'settings.json'), 'utf8'));
    return settings?.pluginConfigs?.['yapa@yapa']?.options?.sync_service_url || undefined;
  } catch {
    return undefined;
  }
}

const serviceUrl = process.env.YAPA_SYNC_SERVICE_URL ?? pluginServiceUrl();
if (!serviceUrl) {
  throw new Error(
    'No YAPA sync service URL: set YAPA_SYNC_SERVICE_URL or the yapa plugin option sync_service_url',
  );
}
export const SERVICE_URL = serviceUrl.replace(/\/+$/, '');
/**
 * `aud` for metadata-server tokens. yapa-service's app check accepts its
 * deterministic URL (https://<service>-<project number>.<region>.run.app),
 * which may differ from the URL in SERVICE_URL; Cloud Run IAM accepts both.
 */
export const ID_TOKEN_AUDIENCE = (process.env.YAPA_SYNC_ID_TOKEN_AUDIENCE ?? SERVICE_URL).replace(
  /\/+$/,
  '',
);
/** K_SERVICE is set by Cloud Run on every revision. */
const ON_CLOUD_RUN = Boolean(process.env.K_SERVICE);

/**
 * Where the backend's yapa-service token comes from: `command` (your gcloud
 * login, for local dev) or `metadata` (the runtime service account, on GCP).
 */
export const ID_TOKEN_SOURCE = (process.env.YAPA_SYNC_ID_TOKEN_SOURCE ??
  (ON_CLOUD_RUN ? 'metadata' : 'command')) as 'command' | 'metadata';
if (ID_TOKEN_SOURCE !== 'command' && ID_TOKEN_SOURCE !== 'metadata') {
  throw new Error('YAPA_SYNC_ID_TOKEN_SOURCE must be "command" or "metadata"');
}
/** Command that prints a Google ID token (same default as the YAPA plugin). */
export const ID_TOKEN_CMD =
  process.env.YAPA_SYNC_ID_TOKEN_CMD ?? 'gcloud auth print-identity-token';

/**
 * `iap`: viewers are identified by the IAP-signed header (Cloud Run behind
 * IAP). `local`: no sign-in gate, for running on your own machine only.
 */
export const AUTH_MODE = (process.env.AUTH_MODE ?? (ON_CLOUD_RUN ? 'iap' : 'local')) as
  | 'iap'
  | 'local';
if (AUTH_MODE !== 'iap' && AUTH_MODE !== 'local') {
  throw new Error('AUTH_MODE must be "iap" or "local"');
}
if (AUTH_MODE === 'local' && ON_CLOUD_RUN) {
  throw new Error('AUTH_MODE=local is refused on Cloud Run (K_SERVICE is set)');
}
/** Expected `aud` of the IAP assertion: /projects/<number>/locations/<region>/services/<name>. */
export const IAP_AUDIENCE = process.env.IAP_AUDIENCE ?? '';
if (AUTH_MODE === 'iap' && !IAP_AUDIENCE) throw new Error('AUTH_MODE=iap needs IAP_AUDIENCE');
/** Optional extra check on the viewer's Workspace domain (IAP's access policy is the main gate). */
export const IAP_ALLOWED_HD = (process.env.IAP_ALLOWED_HD ?? '').trim().toLowerCase();
/** Device id sent as X-Yapa-Device. The dashboard never writes, so it only labels requests. */
export const DEVICE_ID = process.env.YAPA_DEVICE_ID ?? 'task-dashboard';
export const PORT = Number(process.env.PORT ?? 8787);
/** Built SPA served by the API server (same origin as /api); unset or missing = API only. */
export const STATIC_DIR = process.env.STATIC_DIR ?? 'web/dist';
/** 127.0.0.1 locally; a container must listen on 0.0.0.0. */
export const HOST = process.env.HOST ?? (ON_CLOUD_RUN ? '0.0.0.0' : '127.0.0.1');
// Each poll costs one request per collection (~50 today) against a per-user
// rate limit (20/s, burst 100) that the YAPA plugin shares, so keep this slow.
export const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 15_000);
/** Re-read this much history every poll, so rows committed late are not missed. */
export const PULL_OVERLAP_SECONDS = Number(process.env.PULL_OVERLAP_SECONDS ?? 120);
export const PULL_CONCURRENCY = Number(process.env.PULL_CONCURRENCY ?? 6);
