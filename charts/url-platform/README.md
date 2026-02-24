# 🚢 URL Platform — Helm Chart

This directory contains the **Helm chart** for the URL Platform. It packages all application-level Kubernetes resources for all three services, PostgreSQL, ingress, and monitoring.

Deployments are fully **GitOps-driven via ArgoCD**. The chart is never applied manually with `helm` in production — ArgoCD renders it against environment-specific values files stored in the [gitops repo](https://github.com/gal-halevi/production-url-platform-gitops).

---

## 📦 What this chart deploys

- **PostgreSQL** — single instance with PVC, init SQL via ConfigMap
- **url-service** — TypeScript/Fastify, short URL creation and resolution
- **redirect-service** — Go, HTTP redirect handler with async analytics emit
- **analytics-service** — Python/FastAPI, event ingestion and stats
- **Flyway migration Jobs** — schema migrations for url-service and analytics-service
- **Ingress** — ingress-nginx routing for all three services
- **ServiceMonitors** — Prometheus scrape config for all three services
- **PrometheusRules** — availability alerting and latency SLO burn-rate rules

---

## 🌊 ArgoCD sync wave architecture

Resources are deployed in strict order using ArgoCD sync waves. Each wave completes before the next begins.

| Wave | Resources | Purpose |
|---|---|---|
| 0 | PostgreSQL Deployment + Service + PVC | Database must be running before anything else |
| 1 | ConfigMaps | Config available before Jobs or Deployments start |
| 2 | Flyway migration Jobs | Schema migrations run before app Deployments |
| 3 | url-service, redirect-service, analytics-service Deployments | Apps start only after migrations complete |

This eliminates race conditions between application startup and schema readiness without any application-level retry logic.

---

## 🗄️ Database migration pattern

Schema migrations are managed by **Flyway**, running as Kubernetes Jobs at wave 2. Each service that owns a database has a dedicated migration Job and ConfigMap.

SQL migration files follow a dual-file pattern:
- `services/<svc>/migrations/` — developer-owned source of truth
- `charts/url-platform/migrations/<svc>/` — chart-side copies, loaded via `.Files.Get`

A CI drift check enforces that these two copies remain in sync on every PR. This keeps migration files co-located with their service code while satisfying Helm's file loading constraints.

---

## 🌍 Environments

The chart itself contains no environment-specific logic. All environment behavior is controlled entirely by values files.

| Environment | Values location | Managed by |
|---|---|---|
| dev | `envs/dev/values.yaml` in gitops repo | Auto-updated by CI on merge to `main` |
| stg | `envs/stg/values.yaml` in gitops repo | PR-based promotion from dev |
| prod | `envs/prod/values.yaml` in gitops repo | PR-based promotion from stg |

ArgoCD uses [multi-source Applications](https://argo-cd.readthedocs.io/en/stable/user-guide/multiple_sources/) to combine the chart from this repo with the values file from the gitops repo.

---

## 🏷️ Image versioning

Images are published by CI to GHCR with immutable `sha-XXXXXXX` tags (first 7 chars of the commit SHA). The `main` tag is also published but is never used for deployments.

Each service has an independent image tag in the values file, allowing per-service independent promotion:

```yaml
images:
  urlService:
    tag: sha-8eefcfe
  redirectService:
    tag: sha-cb47b20
  analyticsService:
    tag: sha-3ec2b0a
```

---

## 📊 Monitoring

ServiceMonitors and PrometheusRules are driven by a single list in `values.yaml`:

```yaml
monitoring:
  services:
    - url-service
    - redirect-service
    - analytics-service
```

Adding a new service to this list is the only template change required to onboard it for monitoring. The templates loop over this list to generate all scrape configs and alert rules.

PrometheusRules cover:
- **Availability** — alerts when Prometheus cannot scrape the service (`up == 0`) for more than 2 minutes
- **Latency SLO** — multi-window burn-rate rules (fast burn: page-severity, slow burn: ticket-severity)

---

## 🧪 Local Helm lint

To validate the chart locally without a cluster:

```bash
helm lint charts/url-platform
```

This is also run in CI on every PR that touches chart or k8s files.

---

## 🧠 Design principles

- No hard-coded environment logic in templates — all behavior driven by values
- No `helm upgrade` commands in production — ArgoCD owns all applies
- Migration Jobs are idempotent — Flyway's checksum validation means re-running is safe
- Monitoring onboarding requires only a list entry, not template changes
