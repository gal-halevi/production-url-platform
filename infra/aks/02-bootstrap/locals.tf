locals {
  # environments = toset(["dev", "stg", "prod"])
  environments = toset(["dev", "stg"])

  namespace_by_env = {
    dev = "url-platform-dev"
    stg = "url-platform-stg"
    # prod = "url-platform-prod"
  }

  values_by_env = {
    dev = var.values_dev
    stg = var.values_stg
    # prod = var.values_prod
  }
}
