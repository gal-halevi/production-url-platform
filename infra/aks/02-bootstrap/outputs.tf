output "environments" {
  description = "Enabled environments."
  value       = sort(tolist(local.environments))
}

output "namespaces" {
  description = "Environment namespaces created by bootstrap."
  value       = local.namespace_by_env
}

output "ingress_namespace" {
  description = "Namespace where ingress-nginx is installed."
  value       = kubernetes_namespace_v1.ingress.metadata[0].name
}

output "argocd_namespace" {
  description = "Namespace where ArgoCD is installed."
  value       = kubernetes_namespace_v1.argocd.metadata[0].name
}

output "argocd_release" {
  description = "ArgoCD Helm release metadata."
  value = {
    name      = helm_release.argocd.name
    namespace = helm_release.argocd.namespace
    version   = helm_release.argocd.version
    status    = helm_release.argocd.status
  }
}

output "ingress_nginx_release" {
  description = "ingress-nginx Helm release metadata."
  value = {
    name      = helm_release.ingress_nginx.name
    namespace = helm_release.ingress_nginx.namespace
    version   = helm_release.ingress_nginx.version
    status    = helm_release.ingress_nginx.status
  }
}

output "gitops_bootstrap" {
  description = "GitOps bootstrap configuration tracked by ArgoCD root Application."
  value = {
    app_name        = var.argocd_bootstrap_app_name
    repo_url        = var.gitops_repo_url
    repo_revision   = var.gitops_repo_revision
    repo_path       = var.gitops_repo_path
    destination_ns  = kubernetes_namespace_v1.argocd.metadata[0].name
    destination_api = "https://kubernetes.default.svc"
  }
}

output "ingress_external_ip" {
  description = "External IP of the ingress-nginx controller Service (if provisioned)."
  value       = try(data.kubernetes_service_v1.ingress_nginx_controller.status[0].load_balancer[0].ingress[0].ip, null)
}
