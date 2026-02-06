output "network_rg_id" {
  value = azurerm_resource_group.network.id
}

output "ingress_public_ip_address" {
  value = azurerm_public_ip.ingress.ip_address
}

output "ingress_public_ip_rg" {
  value = azurerm_resource_group.network.name
}
