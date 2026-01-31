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
