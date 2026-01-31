locals {
  environments = toset(["dev", "stg", "prod"])

  namespace_by_env = {
    dev  = "url-platform-dev"
    stg  = "url-platform-stg"
    prod = "url-platform-prod"
  }
}
