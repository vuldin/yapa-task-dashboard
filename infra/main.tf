locals {
  services = [
    "run.googleapis.com",
    "iap.googleapis.com",
    "cloudbuild.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ]

  # `aud` of the IAP-signed header for a Cloud Run service with IAP enabled.
  iap_audience = "/projects/${data.google_project.this.number}/locations/${var.region}/services/${var.service_name}"

  app_env = merge(var.extra_env, {
    YAPA_SYNC_SERVICE_URL       = var.yapa_service_url
    YAPA_SYNC_ID_TOKEN_AUDIENCE = var.yapa_token_audience
    AUTH_MODE                   = "iap"
    IAP_AUDIENCE                = local.iap_audience
    IAP_ALLOWED_HD              = var.allowed_hd
    POLL_INTERVAL_MS            = tostring(var.poll_interval_ms)
  })
}

data "google_project" "this" {
  project_id = var.project_id
}

resource "google_project_service" "apis" {
  for_each           = toset(local.services)
  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------------------
# Identities
# ---------------------------------------------------------------------------

# Runtime identity. It reads yapa-service as a read-only reader principal:
# list it in yapa-service's YAPA_READER_PRINCIPALS and invoker_members
# (output yapa_reader_principal). It needs no project roles.
resource "google_service_account" "dashboard" {
  account_id   = var.service_name
  display_name = "YAPA task dashboard runtime"
  description  = "Cloud Run runtime for ${var.service_name}; read-only reader of yapa-service."
}

# IAP's service agent calls the Cloud Run service after a viewer signs in, so
# it is the only invoker (Cloud Run's IAM check stays on).
resource "google_project_service_identity" "iap" {
  provider = google-beta
  service  = "iap.googleapis.com"

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------------------
# Cloud Run v2: IAP in front, a single always-on instance
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "dashboard" {
  name                = var.service_name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.deletion_protection

  iap_enabled          = true
  invoker_iam_disabled = false

  labels = {
    app = "yapa-task-dashboard"
  }

  template {
    service_account                  = google_service_account.dashboard.email
    timeout                          = var.request_timeout
    max_instance_request_concurrency = var.concurrency

    # Exactly one instance: it owns the in-memory snapshot, the poller and
    # every SSE connection.
    scaling {
      min_instance_count = 1
      max_instance_count = 1
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = false # the poller runs between requests
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = local.app_env
        content {
          name  = env.key
          value = env.value
        }
      }

      # Probes reach the container directly (no IAP); /healthz is the only
      # unauthenticated route.
      startup_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        period_seconds    = 3
        timeout_seconds   = 2
        failure_threshold = 20
      }

      liveness_probe {
        http_get {
          path = "/healthz"
          port = 8080
        }
        period_seconds    = 30
        timeout_seconds   = 5
        failure_threshold = 3
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_run_v2_service_iam_member" "iap_invoker" {
  project  = google_cloud_run_v2_service.dashboard.project
  location = google_cloud_run_v2_service.dashboard.location
  name     = google_cloud_run_v2_service.dashboard.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_project_service_identity.iap.email}"
}

# Who may sign in through IAP.
resource "google_iap_web_cloud_run_service_iam_member" "access" {
  for_each               = toset(var.iap_access_members)
  project                = google_cloud_run_v2_service.dashboard.project
  location               = google_cloud_run_v2_service.dashboard.location
  cloud_run_service_name = google_cloud_run_v2_service.dashboard.name
  role                   = "roles/iap.httpsResourceAccessor"
  member                 = each.value
}
