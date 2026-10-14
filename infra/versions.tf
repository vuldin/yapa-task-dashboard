terraform {
  required_version = ">= 1.6.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.6"
    }
  }

  # Supply the bucket at init time (deploy.sh does this):
  #   terraform init -backend-config="bucket=<STATE_BUCKET>"
  backend "gcs" {
    prefix = "yapa/dashboard"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Only for the IAP service agent (google_project_service_identity).
provider "google-beta" {
  project = var.project_id
  region  = var.region
}
