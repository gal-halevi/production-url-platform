variable "location" {
  type    = string
  default = "westeurope"
}

variable "project" {
  type    = string
  default = "production-url-platform"
}

variable "owner" {
  type    = string
  default = "gal-halevi"
}

variable "cluster_name" {
  type    = string
  default = "urlplat-aks"
}

variable "aks_resource_group_name" {
  type    = string
  default = "rg-urlplat-aks"
}

variable "kubernetes_version" {
  type        = string
  default     = null
  description = "Optional. If null, AKS uses the default for the region."
}

variable "node_vm_size" {
  type        = string
  default     = "Standard_B2s_v2"
  description = "Use a VM size allowed by your subscription/region."
}

variable "system_node_count" {
  type    = number
  default = 1
}

variable "state_resource_group" {
  type        = string
  description = "Resource group name for tfstate storage."
}

variable "state_container" {
  type        = string
  description = "Blob container name (e.g., tfstate)."
}

variable "state_storage_account" {
  type        = string
  description = "Storage account name that holds the tfstate container."
}

variable "network_state_key" {
  type        = string
  description = "Blob name/key of the 00-network state file (e.g., aks-network.tfstate)."
}
