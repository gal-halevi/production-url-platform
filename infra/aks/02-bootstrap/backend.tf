terraform {
  backend "azurerm" {
    resource_group_name  = "rg-urlplat-tfstate"
    storage_account_name = "urlplatstate2bb03255"
    container_name       = "tfstate"
    key                  = "aks/02-bootstrap.tfstate"
  }
}
