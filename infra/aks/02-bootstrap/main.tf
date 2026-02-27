data "terraform_remote_state" "infra" {
  backend = "azurerm"
  config = {
    resource_group_name  = var.state_resource_group
    storage_account_name = var.state_storage_account
    container_name       = var.state_container
    key                  = var.infra_state_key
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

provider "kubectl" {
  host                   = data.terraform_remote_state.infra.outputs.host
  client_certificate     = base64decode(data.terraform_remote_state.infra.outputs.client_certificate)
  client_key             = base64decode(data.terraform_remote_state.infra.outputs.client_key)
  cluster_ca_certificate = base64decode(data.terraform_remote_state.infra.outputs.cluster_ca_certificate)
  load_config_file       = false
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

# --------------------------------------------------------------------------
# Data sources
# --------------------------------------------------------------------------
data "azurerm_client_config" "current" {}

data "azurerm_resource_group" "aks" {
  name = data.terraform_remote_state.infra.outputs.resource_group_name
}

locals {
  kv_resource_group = var.key_vault_resource_group != "" ? var.key_vault_resource_group : data.azurerm_resource_group.aks.name
  kv_location       = data.azurerm_resource_group.aks.location
}

# --------------------------------------------------------------------------
# 2) Azure Key Vault
# --------------------------------------------------------------------------
resource "azurerm_key_vault" "this" {
  name                = var.key_vault_name
  location            = local.kv_location
  resource_group_name = local.kv_resource_group
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  # Purge protection is intentionally disabled so that terraform destroy
  # can fully clean up the vault and free the name for the next apply.
  # For a long-lived production vault this should be flipped to true.
  purge_protection_enabled = false

  # Allow the Terraform identity (CI/CD) to manage secrets during apply.
  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = ["Get", "List", "Set", "Delete", "Purge", "Recover"]
  }
}

# --------------------------------------------------------------------------
# 3) Store postgres credentials in Key Vault — one secret per env per field.
#    Naming convention: urlplat-<env>-postgres-user / urlplat-<env>-postgres-password
# --------------------------------------------------------------------------
resource "azurerm_key_vault_secret" "postgres_user" {
  for_each = local.environments

  name         = "urlplat-${each.key}-postgres-user"
  value        = var.postgres_user[each.key]
  key_vault_id = azurerm_key_vault.this.id
}

resource "azurerm_key_vault_secret" "postgres_password" {
  for_each = local.environments

  name         = "urlplat-${each.key}-postgres-password"
  value        = var.postgres_password[each.key]
  key_vault_id = azurerm_key_vault.this.id
}

# --------------------------------------------------------------------------
# 4) User Assigned Managed Identity for ESO
#    One identity cluster-wide — ESO runs once and serves all namespaces.
# --------------------------------------------------------------------------
resource "azurerm_user_assigned_identity" "eso" {
  name                = "urlplat-eso-identity"
  location            = local.kv_location
  resource_group_name = local.kv_resource_group
}

# Grant ESO identity read access to Key Vault secrets.
resource "azurerm_key_vault_access_policy" "eso" {
  key_vault_id = azurerm_key_vault.this.id
  tenant_id    = data.azurerm_client_config.current.tenant_id
  object_id    = azurerm_user_assigned_identity.eso.principal_id

  secret_permissions = ["Get", "List"]
}

# --------------------------------------------------------------------------
# 5) Workload Identity federation
#    Binds the managed identity to the ESO Kubernetes service account so the
#    ESO pod can authenticate to Azure AD without any stored credentials.
# --------------------------------------------------------------------------
resource "azurerm_federated_identity_credential" "eso" {
  name      = "urlplat-eso-federation"
  parent_id = azurerm_user_assigned_identity.eso.id

  # OIDC issuer from the AKS cluster (output from 01-infra).
  issuer = data.terraform_remote_state.infra.outputs.oidc_issuer_url

  # ESO uses this service account in the external-secrets namespace.
  subject = "system:serviceaccount:external-secrets:external-secrets"

  audience = ["api://AzureADTokenExchange"]
}

# --------------------------------------------------------------------------
# 6) Install External Secrets Operator via Helm
# --------------------------------------------------------------------------
resource "kubernetes_namespace_v1" "external_secrets" {
  metadata {
    name = "external-secrets"
  }
}

resource "helm_release" "external_secrets" {
  name       = "external-secrets"
  namespace  = kubernetes_namespace_v1.external_secrets.metadata[0].name
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  version    = "0.14.4"

  create_namespace = false

  # Annotate the ESO service account with the managed identity client ID.
  # This is what Workload Identity uses to bind the pod to the Azure identity.
  set = [
    {
      name  = "serviceAccount.annotations.azure\\.workload\\.identity/client-id"
      value = azurerm_user_assigned_identity.eso.client_id
      type  = "string"
    },
    {
      name  = "podLabels.azure\\.workload\\.identity/use"
      value = "true"
      type  = "string"
    }
  ]

  depends_on = [
    azurerm_federated_identity_credential.eso,
    azurerm_key_vault_access_policy.eso,
  ]
}

# --------------------------------------------------------------------------
# 7) ClusterSecretStore — cluster-scoped, so it can reference the ESO
#    service account in the external-secrets namespace from any namespace.
#    A namespaced SecretStore cannot cross namespace boundaries.
# --------------------------------------------------------------------------
resource "kubectl_manifest" "cluster_secret_store" {
  yaml_body = <<-YAML
    apiVersion: external-secrets.io/v1beta1
    kind: ClusterSecretStore
    metadata:
      name: azure-keyvault
    spec:
      provider:
        azurekv:
          authType: WorkloadIdentity
          vaultUrl: ${azurerm_key_vault.this.vault_uri}
          serviceAccountRef:
            name: external-secrets
            namespace: external-secrets
  YAML

  depends_on = [helm_release.external_secrets]
}

# --------------------------------------------------------------------------
# 8) ExternalSecret per namespace — declares which KV secrets to sync and
#    what Kubernetes Secret to produce (same name/keys as before so pods
#    require zero changes).
# --------------------------------------------------------------------------
resource "kubectl_manifest" "external_secret" {
  for_each = local.environments

  yaml_body = <<-YAML
    apiVersion: external-secrets.io/v1beta1
    kind: ExternalSecret
    metadata:
      name: postgres-secret
      namespace: ${local.namespace_by_env[each.key]}
    spec:
      refreshInterval: 5m
      secretStoreRef:
        name: azure-keyvault
        kind: ClusterSecretStore
      target:
        name: postgres-secret
        creationPolicy: Owner
        template:
          engineVersion: v2
          data:
            POSTGRES_USER: "{{ .postgres_user }}"
            POSTGRES_PASSWORD: "{{ .postgres_password }}"
            DATABASE_URL: "postgresql://{{ .postgres_user }}:{{ .postgres_password }}@postgres:5432/url_platform_urls"
            DATABASE_URL_ANALYTICS: "postgresql://{{ .postgres_user }}:{{ .postgres_password }}@postgres:5432/url_platform_analytics"
      data:
        - secretKey: postgres_user
          remoteRef:
            key: urlplat-${each.key}-postgres-user
        - secretKey: postgres_password
          remoteRef:
            key: urlplat-${each.key}-postgres-password
  YAML

  depends_on = [kubectl_manifest.cluster_secret_store]
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

          # Force Azure LB to use pre-created static IP
          loadBalancerIP = data.terraform_remote_state.network.outputs.ingress_public_ip_address

          annotations = {
            # IP lives in a separate RG, so Azure needs to know where to find it
            "service.beta.kubernetes.io/azure-load-balancer-resource-group" = data.terraform_remote_state.network.outputs.ingress_public_ip_rg

            # (Optional but recommended on Azure)
            "service.beta.kubernetes.io/azure-load-balancer-health-probe-request-path" = "/healthz"
          }
        }
      }
    })
  ]
}

resource "kubernetes_namespace_v1" "argocd" {
  metadata {
    name = "argocd"
  }
}

resource "helm_release" "argocd" {
  name       = "argocd"
  namespace  = kubernetes_namespace_v1.argocd.metadata[0].name
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  version    = "9.3.7" # pin a version; upgrade intentionally later

  create_namespace = false

  # Keep it simple first: ClusterIP, port-forward when needed.
  values = [yamlencode({
    server = {
      service = {
        type = "ClusterIP"
      }
    }
  })]
}

resource "kubectl_manifest" "argocd_bootstrap" {
  yaml_body = <<-YAML
    apiVersion: argoproj.io/v1alpha1
    kind: Application
    metadata:
      name: argocd-apps
      namespace: ${kubernetes_namespace_v1.argocd.metadata[0].name}
    spec:
      project: default
      source:
        repoURL: https://github.com/gal-halevi/production-url-platform-gitops
        targetRevision: main
        path: argocd
        directory:
          recurse: true
      destination:
        server: https://kubernetes.default.svc
        namespace: ${kubernetes_namespace_v1.argocd.metadata[0].name}
  YAML

  depends_on = [helm_release.argocd]
}

data "kubernetes_service_v1" "ingress_nginx_controller" {
  metadata {
    name      = "ingress-nginx-controller"
    namespace = kubernetes_namespace_v1.ingress.metadata[0].name
  }

  depends_on = [helm_release.ingress_nginx]
}

# cert-manager namespace
resource "kubernetes_namespace_v1" "cert_manager" {
  metadata {
    name = "cert-manager"
  }
}

# Install cert-manager (cluster-wide)
resource "helm_release" "cert_manager" {
  name      = "cert-manager"
  namespace = kubernetes_namespace_v1.cert_manager.metadata[0].name

  repository = "https://charts.jetstack.io"
  chart      = "cert-manager"
  version    = "v1.19.3" # pinned intentionally

  create_namespace = false

  values = [
    yamlencode({
      installCRDs = true
    })
  ]
}

resource "kubectl_manifest" "clusterissuer_letsencrypt_prod" {
  yaml_body = <<-YAML
    apiVersion: cert-manager.io/v1
    kind: ClusterIssuer
    metadata:
      name: letsencrypt-prod
    spec:
      acme:
        email: ${var.acme_email}
        server: https://acme-v02.api.letsencrypt.org/directory
        privateKeySecretRef:
          name: letsencrypt-prod-account-key
        solvers:
          - http01:
              ingress:
                class: nginx
  YAML

  depends_on = [helm_release.cert_manager]
}
