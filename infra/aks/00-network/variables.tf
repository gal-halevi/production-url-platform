variable "location" {
  type        = string
  description = "Azure region for network resources (must match AKS region)."
}

variable "network_rg_name" {
  type        = string
  description = "Resource group for shared network resources (long-lived)."
}

variable "public_ip_name" {
  type        = string
  description = "Name for the ingress public IP."
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to resources."
}
