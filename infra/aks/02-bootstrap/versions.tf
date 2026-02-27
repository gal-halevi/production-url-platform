terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.58"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.1"
    }
    kubectl = {
      source  = "gavinbunney/kubectl"
      version = "~> 1.19.0"
    }
  }
}

provider "azurerm" {
  features {
    key_vault {
      # Purge the vault on destroy so the name is freed immediately.
      # Safe for this project since environments are regularly recreated.
      purge_soft_delete_on_destroy = true
    }
  }
}
