output "url" {
  description = "Open this in a browser; IAP asks for Google sign-in."
  value       = google_cloud_run_v2_service.dashboard.uri
}

output "service_account_email" {
  value = google_service_account.dashboard.email
}

output "iap_audience" {
  value = local.iap_audience
}

output "latest_revision" {
  value = google_cloud_run_v2_service.dashboard.latest_ready_revision
}

# Paste into yapa-service's infra/service/terraform.tfvars:
#   extra_env       = { YAPA_READER_PRINCIPALS = "<this>" }
#   invoker_members = [..., "serviceAccount:<service_account_email>"]
output "yapa_reader_principal" {
  value = "${google_service_account.dashboard.email}=svc-task-dashboard"
}
