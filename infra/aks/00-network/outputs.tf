output "network_rg_id" {
  value = azurerm_resource_group.network.id
}

output "ingress_public_ip_address" {
  value = azurerm_public_ip.ingress.ip_address
}

output "ingress_public_ip_rg" {
  value = azurerm_resource_group.network.name
}

output "backup_storage_account_name" {
  value       = azurerm_storage_account.postgres_backup.name
  description = "Name of the storage account holding PostgreSQL backups."
}

output "backup_storage_container_name" {
  value       = azurerm_storage_container.postgres_backup.name
  description = "Name of the blob container holding PostgreSQL backups."
}
