#!/usr/bin/env bash
# Build the dashboard image, push it to Artifact Registry and roll it out with
# Terraform, pinned by digest.
#
# Usage (from anywhere):
#   STATE_BUCKET=<bucket> infra/deploy.sh
#
# Env:
#   STATE_BUCKET  GCS bucket for Terraform state (required)
#   PROJECT_ID    defaults to project_id in terraform.tfvars
#   REGION        defaults to us-central1
#   TAG           image tag; defaults to the short git commit (+ -dirty), or a timestamp outside git
#   AUTO_APPROVE  set to 1 to apply the saved plan without asking
#   PLAN_ONLY     set to 1 to stop after the plan (prints the apply command)
#
# The plan is saved to a file and only that plan is applied, so it can be
# reviewed first. Without a terminal (CI, a backgrounded shell) and without
# AUTO_APPROVE=1 it stops after printing the plan and the command to apply it.
#
# Requires: gcloud (authenticated), terraform >= 1.6.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
cd "$HERE"

: "${STATE_BUCKET:?set STATE_BUCKET to the Terraform state bucket}"
REGION="${REGION:-us-central1}"

if [[ -z "${PROJECT_ID:-}" ]]; then
  PROJECT_ID="$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' terraform.tfvars 2>/dev/null | head -n1)"
fi
: "${PROJECT_ID:?set PROJECT_ID or project_id in terraform.tfvars}"
SERVICE="$(sed -n 's/^[[:space:]]*service_name[[:space:]]*=[[:space:]]*"\(.*\)".*/\1/p' terraform.tfvars 2>/dev/null | head -n1)"
SERVICE="${SERVICE:-yapa-task-dashboard}"

if [[ -z "${TAG:-}" ]]; then
  if git -C "$ROOT" rev-parse --short HEAD >/dev/null 2>&1; then
    TAG="$(git -C "$ROOT" rev-parse --short HEAD)"
    git -C "$ROOT" diff --quiet HEAD -- || TAG="${TAG}-dirty"
  else
    TAG="$(date -u +%Y%m%d-%H%M%S)"
  fi
fi

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/yapa/${SERVICE}"
PLAN="$HERE/deploy.tfplan"

echo "==> terraform init"
terraform init -input=false -backend-config="bucket=${STATE_BUCKET}" >/dev/null

echo "==> build ${IMAGE}:${TAG} with Cloud Build"
gcloud builds submit "$ROOT" --project "$PROJECT_ID" --region "$REGION" \
  --config "$HERE/cloudbuild.yaml" --substitutions "_IMAGE=${IMAGE}:${TAG}"

DIGEST="$(gcloud artifacts docker images describe "${IMAGE}:${TAG}" --project "$PROJECT_ID" \
  --format='value(image_summary.digest)')"
[[ "$DIGEST" == sha256:* ]] || { echo "could not resolve digest for ${IMAGE}:${TAG}" >&2; exit 1; }

echo "==> terraform plan image=${IMAGE}@${DIGEST}"
terraform plan -input=false -out="$PLAN" -var "image=${IMAGE}@${DIGEST}"

print_apply() {
  echo "==> review the plan above, then apply exactly that plan with:"
  echo "    terraform -chdir=$HERE apply -input=false $PLAN"
}

if [[ "${PLAN_ONLY:-0}" == "1" ]]; then
  print_apply
  exit 0
fi

if [[ "${AUTO_APPROVE:-0}" != "1" ]]; then
  if [[ -t 0 ]]; then
    tty_in=/dev/stdin
  elif (: </dev/tty) 2>/dev/null; then
    tty_in=/dev/tty
  else
    echo "==> no terminal to confirm on"
    print_apply
    exit 0
  fi
  read -r -p "Apply this plan? [y/N] " answer <"$tty_in"
  [[ "$answer" == "y" || "$answer" == "Y" ]] || { echo "not applied; plan kept at $PLAN"; exit 0; }
fi

echo "==> terraform apply (saved plan)"
terraform apply -input=false "$PLAN"
rm -f "$PLAN"

# IAP blocks unauthenticated probes from here, so check the revision instead.
echo "==> latest revision status"
gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" \
  --format='value(status.latestReadyRevisionName,status.conditions[0].type,status.conditions[0].status)'
echo "==> open $(terraform output -raw url)"
