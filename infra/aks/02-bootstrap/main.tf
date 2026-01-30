data "terraform_remote_state" "infra" {
  backend = "azurerm"
  config = {
    resource_group_name  = var.state_resource_group
    storage_account_name = var.state_storage_account
    container_name       = var.state_container
    key                  = var.infra_state_key
  }
}

provider "kubernetes" {
  host                   = data.terraform_remote_state.infra.outputs.host
  client_certificate     = base64decode(data.terraform_remote_state.infra.outputs.client_certificate)
  client_key             = base64decode(data.terraform_remote_state.infra.outputs.client_key)
  cluster_ca_certificate = base64decode(data.terraform_remote_state.infra.outputs.cluster_ca_certificate)
}

provider "helm" {
  kubernetes = {
    host                   = data.terraform_remote_state.infra.outputs.host
    client_certificate     = base64decode(data.terraform_remote_state.infra.outputs.client_certificate)
    client_key             = base64decode(data.terraform_remote_state.infra.outputs.client_key)
    cluster_ca_certificate = base64decode(data.terraform_remote_state.infra.outputs.cluster_ca_certificate)
  }
}

# 1) Create namespaces
resource "kubernetes_namespace_v1" "env" {
  for_each = local.environments

  metadata {
    name = local.namespace_by_env[each.key]
    labels = {
      "app.kubernetes.io/name" = "url-platform"
      "urlplat.env"            = each.key
    }
  }
}

# 2) Create postgres secret per namespace
resource "kubernetes_secret_v1" "postgres" {
  for_each = local.environments

  metadata {
    name      = "postgres-secret"
    namespace = kubernetes_namespace_v1.env[each.key].metadata[0].name
  }

  type = "Opaque"

  data = {
    POSTGRES_USER     = var.postgres_user
    POSTGRES_PASSWORD = var.postgres_password
    DATABASE_URL      = "postgresql://${var.postgres_user}:${var.postgres_password}@postgres:5432/url_platform"
  }
}

# 3) Install ingress-nginx once (cluster-wide), in its own namespace
resource "kubernetes_namespace_v1" "ingress" {
  metadata {
    name = "ingress-nginx"
  }
}

resource "helm_release" "ingress_nginx" {
  name      = "ingress-nginx"
  namespace = kubernetes_namespace_v1.ingress.metadata[0].name

  repository = "https://kubernetes.github.io/ingress-nginx"
  chart      = "ingress-nginx"
  version    = "4.10.1"

  values = [
  yamlencode({
    controller = {
      service = {
        externalTrafficPolicy = "Local"
      }
    }
  })
]
}

# 4) Deploy your platform chart into each env namespace using env values
resource "helm_release" "url_platform" {
  for_each = local.environments

  name      = "${var.release_name}-${each.key}"
  namespace = kubernetes_namespace_v1.env[each.key].metadata[0].name

  chart = var.chart_path

  values = [
    file(local.values_by_env[each.key])
  ]

  depends_on = [
    helm_release.ingress_nginx,
    kubernetes_secret_v1.postgres
  ]
}
