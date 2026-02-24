# 🚀 Production URL Platform

A production-grade URL shortener platform built to demonstrate **modern DevOps practices end-to-end** — from local development and CI, through containerized microservices, to GitOps-driven deployment on Azure Kubernetes Service.

This repository is intentionally designed as a **portfolio-quality project**, not a toy example. Every architectural decision reflects real-world production concerns.

---

## 🧩 What this repo demonstrates

- Containerized microservices (TypeScript, Go, Python) with Docker
- Local full-stack orchestration with Docker Compose
- Production Kubernetes deployment on **Azure AKS** via **Helm**
- **GitOps** delivery with **ArgoCD** and a dedicated gitops repository
- **Ordered deployments** using ArgoCD sync waves (postgres → config → migrations → app)
- **Database schema migrations** with Flyway Jobs, run as Kubernetes Jobs at sync wave 2
- **Per-service image publishing** to GHCR with immutable `sha-XXXXXXX` tags
- **Automated dev promotion** on merge to `main`; stg/prod promotion via PR workflow
- **Prometheus metrics** on all three services with cardinality-safe route normalization
- **Grafana dashboards** for RPS, p95 latency, and top routes per service
- **SLO-based alerting** with burn-rate rules (availability + latency) via PrometheusRules
- **CI hardening**: scoped unit tests, Docker Compose e2e, SQL drift checks, gitops smoke tests
- **Terraform** for AKS cluster, networking, namespaces, secrets, ingress-nginx, ArgoCD, cert-manager

---

## 🧱 Services

| Service | Language | Responsibility |
|---|---|---|
| **url-service** | TypeScript / Fastify | Creates and stores short URLs, resolves short codes |
| **redirect-service** | Go | Handles HTTP redirects, emits analytics events asynchronously |
| **analytics-service** | Python / FastAPI | Ingests redirect events, exposes aggregated stats |

All three services communicate over HTTP within the cluster. Each service owns its own PostgreSQL database — no shared schemas.

---

## 🗄️ Data layer

A single PostgreSQL instance hosts two isolated databases:

- `url_platform_urls` — owned exclusively by url-service
- `url_platform_analytics` — owned exclusively by analytics-service

Both databases are created via an init SQL script on fresh volumes. Schema migrations are managed by **Flyway** and run as Kubernetes Jobs at ArgoCD sync wave 2, before application Deployments start at wave 3.

SQL migration files are maintained in `services/<svc>/migrations/` (source of truth), with chart-side copies in `charts/url-platform/migrations/<svc>/` required by Helm's `.Files.Get`. A CI drift check enforces that these two copies stay in sync.

---

## 📦 Repository structure

```
.
├── charts/url-platform/        # Helm chart (all services, postgres, ingress, monitoring)
│   ├── templates/              # Kubernetes manifests (Deployments, Jobs, ConfigMaps, etc.)
│   ├── migrations/             # Chart-side SQL copies (loaded via .Files.Get)
│   └── values.yaml             # Shared defaults
│
├── services/
│   ├── url-service/            # TypeScript / Fastify
│   ├── redirect-service/       # Go
│   └── analytics-service/      # Python / FastAPI
│
├── infra/aks/
│   ├── 00-network/             # VNet, subnets
│   ├── 01-infra/               # AKS cluster, node pools
│   └── 02-bootstrap/           # Namespaces, ArgoCD, ingress-nginx, cert-manager, secrets
│
├── scripts/
│   ├── e2e-smoke.sh            # Docker Compose end-to-end smoke script
│   └── postgres/init-databases.sql  # Source-of-truth DB init script
│
├── k8s/                        # Raw Kubernetes manifests (historical — see k8s/README.md)
│
└── .github/workflows/          # GitHub Actions CI/CD
```

---

## ⚡ Quickstart (local — Docker Compose)

Bring up the full stack locally:

```bash
docker compose up --build
```

Health checks:

```bash
curl http://localhost:3000/health   # url-service
curl http://localhost:8080/health   # redirect-service
curl http://localhost:8000/health   # analytics-service
```

Create a short URL:

```bash
curl -X POST http://localhost:3000/urls \
  -H 'content-type: application/json' \
  -d '{"long_url":"https://example.com"}'
```

Follow the redirect:

```bash
curl -i http://localhost:8080/r/<code>
```

Teardown:

```bash
docker compose down -v
```

---

## ☸️ Kubernetes deployment

Production deployments are fully **GitOps-driven via ArgoCD**. Manual `helm` commands are not used in production.

Deployment configuration (image tags, host names, feature flags per environment) lives in the companion repository: [`production-url-platform-gitops`](https://github.com/gal-halevi/production-url-platform-gitops).

See [`charts/url-platform/README.md`](charts/url-platform/README.md) for details on the Helm chart, sync wave architecture, and migration pattern.

---

## 🔁 CI/CD overview

CI is implemented with **GitHub Actions** across two repos.

### On pull request (`pr-validate.yml`)
- Scoped unit tests per changed service
- Docker Compose e2e tests (if any service or compose files changed)
- `helm lint` validation (if chart or k8s files changed)
- SQL migration drift check (chart-side copies vs. service-side sources)

### On merge to `main` (`main-validate-publish.yml`)
- All of the above
- Build and publish Docker images to GHCR with immutable `sha-XXXXXXX` tags
- Auto-update `envs/dev/values.yaml` in the gitops repo with new image tags

### Promotion to staging (`promote-stg.yml`)
- Triggered manually via `workflow_dispatch`
- Copies current dev image tags into a PR against the gitops repo's stg values file
- Merge of that PR triggers ArgoCD sync on stg

### Promotion to production (`promote-prod.yml`)
- Triggered manually via `workflow_dispatch`
- Copies current stg image tags into a PR against the gitops repo's prod values file
- Merge of that PR triggers ArgoCD sync on prod

### Smoke tests (gitops repo)
- Triggered after ArgoCD syncs each environment
- Waits for rollout, verifies deployed version, runs create → redirect → analytics e2e flow

---

## 🏗️ Infrastructure

Provisioned with **Terraform** in three layers (each with independent state):

| Layer | What it provisions |
|---|---|
| `00-network` | VNet, subnets |
| `01-infra` | AKS cluster, node pools |
| `02-bootstrap` | Namespaces, ArgoCD, ingress-nginx, cert-manager, per-env secrets |

---

## 📊 Observability

All three services expose Prometheus metrics at `/metrics` (not publicly exposed via ingress). Metrics are scraped by Prometheus via `ServiceMonitor` resources.

- **Grafana dashboards** — RPS, p95 latency, and top routes for all three services
- **PrometheusRules** — availability alerting and latency SLO burn-rate rules (fast + slow burn, page + ticket severity)

---

## 📚 Further reading

- [Helm chart & sync wave architecture](charts/url-platform/README.md)
- [url-service](services/url-service/README.md)
- [redirect-service](services/redirect-service/README.md)
- [analytics-service](services/analytics-service/README.md)
- [Historical raw manifests](k8s/README.md)
