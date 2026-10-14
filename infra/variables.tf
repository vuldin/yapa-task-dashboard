variable "project_id" {
  description = "GCP project that hosts the dashboard (and the yapa Artifact Registry repo)."
  type        = string
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "service_name" {
  description = "Cloud Run service name; also the runtime service account id."
  type        = string
  default     = "yapa-task-dashboard"
}

variable "repository_id" {
  description = "Existing Artifact Registry Docker repo (created by yapa's infra/service)."
  type        = string
  default     = "yapa"
}

variable "image" {
  description = "Image reference, pinned by digest. Passed by deploy.sh; do not set it in tfvars."
  type        = string
}

variable "yapa_service_url" {
  description = "YAPA sync service base URL the dashboard reads from."
  type        = string
}

variable "yapa_token_audience" {
  description = "aud for the dashboard's ID tokens: a value in yapa-service's YAPA_AUDIENCES (its deterministic https://<service>-<project number>.<region>.run.app URL)."
  type        = string
}

variable "allowed_hd" {
  description = "Company Google Workspace domain; viewers' IAP assertions must carry it."
  type        = string
}

variable "iap_access_members" {
  description = "Who may open the dashboard through IAP (roles/iap.httpsResourceAccessor), e.g. [\"domain:example.com\"]."
  type        = list(string)

  validation {
    condition     = length(var.iap_access_members) > 0 && !contains(var.iap_access_members, "allUsers") && !contains(var.iap_access_members, "allAuthenticatedUsers")
    error_message = "List at least one member, and never allUsers/allAuthenticatedUsers."
  }
}

variable "poll_interval_ms" {
  description = "How often the dashboard pulls yapa-service (one request per collection each time)."
  type        = number
  default     = 15000
}

variable "extra_env" {
  description = "Additional environment variables for the container."
  type        = map(string)
  default     = {}
}

# One instance holds the task snapshot in memory, runs the poller and keeps
# the SSE connections; more instances would each poll and disagree briefly.
variable "concurrency" {
  description = "Requests per instance; every open dashboard tab holds one (SSE)."
  type        = number
  default     = 500
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "request_timeout" {
  description = "Max request duration; SSE streams reconnect (and reseed) when it is reached."
  type        = string
  default     = "3600s"
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "notification_channels" {
  type    = list(string)
  default = []
}

variable "error_rate_threshold" {
  type    = number
  default = 0.02
}

variable "error_rate_duration" {
  type    = string
  default = "600s"
}

variable "auth_failure_threshold" {
  type    = number
  default = 20
}

variable "auth_failure_window" {
  type    = string
  default = "300s"
}
