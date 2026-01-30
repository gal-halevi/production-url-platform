output "namespaces" {
  value = local.namespace_by_env
}

output "releases" {
  value = { for k in local.environments : k => helm_release.url_platform[k].name }
}
