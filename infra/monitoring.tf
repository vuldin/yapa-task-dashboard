# Alerts mirroring yapa-service's (infra/service/monitoring.tf in vuldin/yapa).

locals {
  run_filter = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${var.service_name}\""
  # 0.02 * 100 is 1.999... in floating point; print it rounded.
  error_rate_pct = format("%.4g%%", var.error_rate_threshold * 100)
}

resource "google_monitoring_alert_policy" "error_rate" {
  display_name = "${var.service_name}: 5xx rate > ${local.error_rate_pct}"
  combiner     = "OR"

  conditions {
    display_name = "5xx share of requests"
    condition_threshold {
      filter     = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      comparison = "COMPARISON_GT"
      duration   = var.error_rate_duration

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      denominator_filter = "${local.run_filter} AND metric.type = \"run.googleapis.com/request_count\""

      denominator_aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
      }

      threshold_value = var.error_rate_threshold

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "More than ${local.error_rate_pct} of ${var.service_name} requests returned 5xx for ${var.error_rate_duration}. Check the Cloud Run logs."
    mime_type = "text/markdown"
  }

  depends_on = [google_project_service.apis]
}

# Counts the app's structured lines, e.g.
#   {"severity":"WARNING","event":"auth_failure","reason":"invalid_assertion","aud":"..."}
# Behind IAP these should be rare; a burst means IAP was bypassed or
# IAP_AUDIENCE is wrong (compare the logged aud).
resource "google_logging_metric" "auth_failures" {
  name        = "${var.service_name}/auth_failures"
  description = "IAP assertions rejected by ${var.service_name}."
  filter      = "${local.run_filter} AND jsonPayload.event = \"auth_failure\""

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"

    labels {
      key         = "reason"
      value_type  = "STRING"
      description = "missing_assertion or invalid_assertion."
    }
  }

  label_extractors = {
    reason = "EXTRACT(jsonPayload.reason)"
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_alert_policy" "auth_failures" {
  display_name = "${var.service_name}: auth failure spike"
  combiner     = "OR"

  conditions {
    display_name = "Auth failures > ${var.auth_failure_threshold} per ${var.auth_failure_window}"
    condition_threshold {
      filter     = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.auth_failures.name}\""
      comparison = "COMPARISON_GT"
      duration   = "0s"

      aggregations {
        alignment_period     = var.auth_failure_window
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }

      threshold_value = var.auth_failure_threshold

      trigger {
        count = 1
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "Rejected IAP assertions on ${var.service_name}. missing_assertion: a request reached the container without IAP. invalid_assertion: compare the logged aud with IAP_AUDIENCE."
    mime_type = "text/markdown"
  }
}
