# 🚀 Production URL Platform

A production-style URL platform built to demonstrate **modern DevOps practices end-to-end**:
from local development, through CI, to Kubernetes deployments with Helm and ingress.

This repository is intentionally designed as a **portfolio-quality project** rather than a toy example.

---

## 🧩 What this repo demonstrates

- Containerized microservices with Docker
- Local orchestration with Docker Compose
- Kubernetes deployment using kind (local clusters)
- Helm charts with environment-driven values
- Ingress-based routing using ingress-nginx
- CI/CD with GitHub Actions:
  - scoped unit tests per service
  - Docker Compose end-to-end tests
  - kind + Helm + ingress end-to-end tests
- Secrets and configuration via Kubernetes Secrets and ConfigMaps
- Production-oriented CI hardening (readiness checks, retries, diagnostics)

---

## 🧱 Services

This project consists of three services:

- **url-service**  
  Creates and stores short URLs (Node.js / TypeScript)

- **redirect-service**  
  Handles redirects and emits access events (Go)

- **analytics-service**  
  Aggregates redirect statistics (Python / FastAPI)

All services communicate over HTTP and share a PostgreSQL database.

---

## ⚡ Quickstart (local – Docker Compose)

Bring up the full stack locally:

```bash
docker compose up --build
```

Smoke checks:

```bash
curl http://localhost:3000/health
curl http://localhost:8080/health
curl http://localhost:8000/health
```

Create a short URL:

```bash
curl -X POST http://localhost:3000/urls   -H 'content-type: application/json'   -d '{"long_url":"https://example.com"}'
```

Follow the redirect:

```bash
curl -i http://localhost:8080/r/<code>
```

Stop everything:

```bash
docker compose down
```

---

## ☸️ Kubernetes & Helm (local)

The project can also be deployed into a local Kubernetes cluster using **kind**, **Helm**, and **ingress-nginx**.

This path mirrors how the system is validated in CI.

See:
- [k8s/README.md](/k8s/README.md) – local Kubernetes setup with kind
- [charts/url-platform](/charts/url-platform/) – Helm chart for the platform

---

## 🔁 CI overview

CI is implemented with **GitHub Actions** and is layered for speed and confidence:

1. **Unit tests**
   - Executed per service, scoped by changed paths
2. **Docker Compose E2E**
   - Validates the full stack locally
3. **kind + Helm E2E**
   - Spins up a real Kubernetes cluster
   - Deploys via Helm
   - Routes traffic through ingress-nginx
   - Performs end-to-end smoke tests via ingress

The pipeline is hardened against flakiness using readiness checks, retries, and detailed diagnostics on failure.

---

## 📚 Project documentation

- Architecture overview: [docs/PROJECT_ARCHITECTURE.md](/docs/PROJECT_ARCHITECTURE.md)
- Milestones & progression: [docs/MILESTONE_TRACKER.md](/docs/MILESTONE_TRACKER.md)
- Kubernetes (kind): [k8s/README.md](/k8s/README.md)
- Helm chart: [charts/url-platform](/charts/url-platform/)

---

## 🏗️ Status

Work in progress.

The project is developed milestone-by-milestone with small, reviewable PRs and documented decisions, intentionally mirroring real-world DevOps workflows.
