variable "state_resource_group" {
  type        = string
  description = "RG that holds the tfstate Storage Account (remote backend)."
}

variable "state_storage_account" {
  type        = string
  description = "Storage account name that holds the tfstate container."
}

variable "state_container" {
  type        = string
  description = "Blob container name (e.g., tfstate)."
}

variable "infra_state_key" {
  type        = string
  description = "Blob name/key of the 01-infra state file (e.g., aks-infra.tfstate)."
}

# app-level secrets (you created per GitHub environment too, but for AKS we need K8s Secrets)
variable "postgres_user" {
  type      = string
  sensitive = true
}

variable "postgres_password" {
  type      = string
  sensitive = true
}

variable "chart_path" {
  type    = string
  default = "../../../charts/url-platform"
}

variable "values_dev" {
  type    = string
  default = "../../../charts/url-platform/values-dev.yaml"
}

variable "values_stg" {
  type    = string
  default = "../../../charts/url-platform/values-stg.yaml"
}

variable "values_prod" {
  type    = string
  default = "../../../charts/url-platform/values-prod.yaml"
}

variable "release_name" {
  type    = string
  default = "url-platform"
}
