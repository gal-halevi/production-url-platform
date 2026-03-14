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

# --------------------------------------------------------------------------
# PostgreSQL backup storage — lives here because this layer is never destroyed,
# ensuring backups survive cluster destroy/apply cycles.
# --------------------------------------------------------------------------
resource "azurerm_storage_account" "postgres_backup" {
  name                     = var.backup_storage_account_name
  resource_group_name      = azurerm_resource_group.network.name
  location                 = azurerm_resource_group.network.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  # Cool tier: lower storage cost for infrequently accessed backup data.
  access_tier = "Cool"

  # Backups must survive terraform destroy — this is the entire point of
  # placing this resource in the 00-network layer.
  lifecycle {
    prevent_destroy = true
  }

  tags = var.tags
}

resource "azurerm_storage_container" "postgres_backup" {
  name                  = "postgres-backups"
  storage_account_id    = azurerm_storage_account.postgres_backup.id
  container_access_type = "private"
}

# Automatically delete backups older than 7 days.
resource "azurerm_storage_management_policy" "postgres_backup_retention" {
  storage_account_id = azurerm_storage_account.postgres_backup.id

  rule {
    name    = "delete-old-backups"
    enabled = true

    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["postgres-backups/"]
    }

    actions {
      base_blob {
        delete_after_days_since_modification_greater_than = 7
      }
    }
  }
}

# --------------------------------------------------------------------------
# Observability storage — holds Tempo trace data (and Loki in future).
# Separated from backup storage to keep lifecycle and access concerns distinct.
# Lives in 00-network (never destroyed) so trace data survives cluster cycles.
# --------------------------------------------------------------------------
resource "azurerm_storage_account" "observability" {
  name                     = var.observability_storage_account_name
  resource_group_name      = azurerm_resource_group.network.name
  location                 = azurerm_resource_group.network.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  access_tier              = "Hot"

  lifecycle {
    prevent_destroy = true
  }

  tags = var.tags
}

resource "azurerm_storage_container" "tempo_traces" {
  name                  = "tempo-traces"
  storage_account_id    = azurerm_storage_account.observability.id
  container_access_type = "private"
}
