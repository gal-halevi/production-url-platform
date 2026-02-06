locals {
  tags = {
    project = var.project
    owner   = var.owner
  }
}

data "terraform_remote_state" "network" {
  backend = "azurerm"
  config = {
    resource_group_name  = var.state_resource_group
    storage_account_name = var.state_storage_account
    container_name       = var.state_container
    key                  = var.network_state_key
  }
}

resource "azurerm_role_assignment" "aks_network_contributor" {
  scope                = data.terraform_remote_state.network.outputs.network_rg_id
  role_definition_name = "Network Contributor"
  principal_id         = azurerm_kubernetes_cluster.this.identity[0].principal_id

  depends_on = [azurerm_kubernetes_cluster.this]
}

resource "azurerm_resource_group" "aks" {
  name     = var.aks_resource_group_name
  location = var.location
  tags     = local.tags
}

resource "azurerm_kubernetes_cluster" "this" {
  name                = var.cluster_name
  location            = azurerm_resource_group.aks.location
  resource_group_name = azurerm_resource_group.aks.name
  dns_prefix          = replace(var.cluster_name, "-", "")

  kubernetes_version = var.kubernetes_version

  # "Free" SKU tier is fine for learning (paid tier exists for uptime SLA etc.)
  sku_tier = "Free"

  identity {
    type = "SystemAssigned"
  }

  default_node_pool {
    name    = "system"
    vm_size = var.node_vm_size

    os_disk_type    = "Managed"
    os_disk_size_gb = 30
    type            = "VirtualMachineScaleSets"

    auto_scaling_enabled = true
    min_count            = 1
    max_count            = 3
  }

  network_profile {
    network_plugin    = "azure"
    load_balancer_sku = "standard"
  }

  role_based_access_control_enabled = true

  tags = local.tags
}

resource "azurerm_kubernetes_cluster_node_pool" "apps" {
  name                  = "apps"
  kubernetes_cluster_id = azurerm_kubernetes_cluster.this.id
  vm_size               = var.node_vm_size
  mode                  = "User"

  os_disk_type    = "Managed"
  os_disk_size_gb = 30

  auto_scaling_enabled = true
  min_count            = 1
  max_count            = 3
}
