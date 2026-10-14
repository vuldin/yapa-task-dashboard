# infra: Cloud Run + IAP for the task dashboard

Terraform for running the dashboard as a shared, company-only web page. Its state lives in the
same bucket as YAPA's service infra, under prefix `yapa/dashboard`, and the image goes in
YAPA's existing Artifact Registry repo (`yapa`).

| File | What |
|------|------|
| `main.tf` | APIs, runtime service account, IAP service agent, Cloud Run v2 service with IAP, IAM |
| `monitoring.tf` | 5xx-rate alert, auth-failure log metric + alert |
| `variables.tf` / `terraform.tfvars.example` | inputs; copy the example to `terraform.tfvars` (gitignored) |
| `deploy.sh` | Cloud Build -> push -> `terraform plan -out` -> confirm -> apply that plan |
| `cloudbuild.yaml` | Cloud Build config used by `deploy.sh` (builds the repo-root `Dockerfile`) |

## What gets created

- `run`, `iap`, `cloudbuild`, `monitoring` and `logging` APIs (never disabled on destroy).
- Service account `yapa-task-dashboard@<project>`. It has no project roles; it only reads
  yapa-service, as a read-only reader principal (see below).
- Cloud Run v2 service `yapa-task-dashboard`:
  - **IAP enabled on the service** (`iap_enabled = true`). Viewers sign in with Google;
    `roles/iap.httpsResourceAccessor` is granted to each `iap_access_members` entry
    (e.g. `domain:<company>`). Cloud Run's invoker check stays on, and the only invoker is
    IAP's service agent.
  - The app verifies IAP's signed header on every request too (`AUTH_MODE=iap`,
    `IAP_AUDIENCE=/projects/<number>/locations/<region>/services/<name>`,
    `IAP_ALLOWED_HD`). Without a valid assertion everything is 401 except `/healthz`.
  - **Exactly one instance, CPU always allocated.** One process holds the task snapshot,
    runs the poller and keeps every SSE connection; more instances would each poll.
    Concurrency 500 (each open tab holds one request), 60-minute request timeout (SSE
    reconnects and reseeds when it's reached).
  - Probes on `/healthz` (they reach the container directly, not through IAP).
- Alerts: 5xx share > 2% for 10 min; > 20 rejected IAP assertions per 5 min. Behind IAP,
  rejections should be rare: `missing_assertion` means a request bypassed IAP, and
  `invalid_assertion` logs the token's `aud` for comparing with `IAP_AUDIENCE`.

## Deploy

```bash
cp infra/terraform.tfvars.example infra/terraform.tfvars   # then fill it in
STATE_BUCKET=<state bucket> infra/deploy.sh
```

`deploy.sh` saves the plan and applies only that plan, after a `[y/N]` prompt. With no
terminal (CI, a backgrounded shell) it stops after the plan and prints the
`terraform apply <plan>` command. `PLAN_ONLY=1` always stops there (use it from a
non-interactive shell such as Claude Code's `!`); `AUTO_APPROVE=1` skips the prompt.

## yapa-service side (once, after the first deploy)

The dashboard reads yapa-service as its own service account, which yapa-service (1.0.1+)
must allow as a read-only reader. In YAPA's `infra/service/terraform.tfvars`:

```hcl
extra_env       = { YAPA_READER_PRINCIPALS = "<output yapa_reader_principal>" }
invoker_members = ["domain:<company>", "serviceAccount:<output service_account_email>"]
```

Then redeploy yapa-service. Until then the dashboard page loads but shows a poll error
(yapa-service returns 403).

`yapa_token_audience` must be a value in yapa-service's `YAPA_AUDIENCES` (its
deterministic URL, `https://yapa-service-<project number>.<region>.run.app`; yapa's
terraform output `app_audiences`). That can differ from `yapa_service_url`, and a token
for the other URL passes Cloud Run IAM but fails the app's audience check.
