resource "azurerm_resource_group" "network" {
  name     = var.network_rg_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_public_ip" "ingress" {
  name                = var.public_ip_name
  location            = azurerm_resource_group.network.location
  resource_group_name = azurerm_resource_group.network.name

  allocation_method = "Static"
  sku               = "Standard"

  lifecycle {
    prevent_destroy = true
  }

  tags = var.tags
}
