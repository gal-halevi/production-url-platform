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

variable "network_state_key" {
  type        = string
  description = "Blob name/key of the 00-network state file (e.g., aks-network.tfstate)."
}

# app-level secrets — one credential pair per environment
variable "postgres_user" {
  type        = map(string)
  sensitive   = true
  description = "Postgres username per environment. Keys: dev, stg, prod."

  validation {
    condition     = alltrue([for k in ["dev", "stg", "prod"] : contains(keys(var.postgres_user), k)])
    error_message = "postgres_user must contain keys: dev, stg, prod."
  }
}

variable "postgres_password" {
  type        = map(string)
  sensitive   = true
  description = "Postgres password per environment. Keys: dev, stg, prod."

  validation {
    condition     = alltrue([for k in ["dev", "stg", "prod"] : contains(keys(var.postgres_password), k)])
    error_message = "postgres_password must contain keys: dev, stg, prod."
  }
}

variable "gitops_repo_url" {
  description = "GitOps repository URL tracked by the ArgoCD bootstrap Application."
  type        = string
}

variable "gitops_repo_revision" {
  description = "GitOps repository revision (branch/tag/sha)."
  type        = string
  default     = "main"
}

variable "gitops_repo_path" {
  description = "Path in the GitOps repo containing ArgoCD projects/apps."
  type        = string
  default     = "argocd"
}

variable "argocd_bootstrap_app_name" {
  description = "Name of the ArgoCD bootstrap Application."
  type        = string
  default     = "argocd-apps"
}

variable "acme_email" {
  description = "Email for ACME (Let's Encrypt) account registration."
  type        = string
}

variable "key_vault_name" {
  description = "Globally unique name for the Azure Key Vault (3-24 chars, alphanumeric and hyphens)."
  type        = string
}

variable "key_vault_resource_group" {
  description = "Resource group to create the Key Vault in. Defaults to the AKS resource group if empty."
  type        = string
  default     = ""
}
