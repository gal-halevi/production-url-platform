# 🚢 URL Platform – Helm Deployment

This directory contains the **Helm chart** for deploying the URL Platform.

All application-level concerns live here:
- Services (url, redirect, analytics, postgres)
- Runtime configuration
- Environment separation (dev / stg / prod)
- Ingress routing

---

## 🧰 Prerequisites

- Kubernetes cluster (local kind or cloud)
- ingress-nginx installed in the cluster
- Helm v3+

---

## 🌍 Environments

This chart supports three environments via values files:

| Environment | Purpose |
|------------|--------|
| dev | Local development (kind, local images, NodePort ingress) |
| stg | Staging (GHCR images, scaled replicas, cloud-like setup) |
| prod | Production (versioned images, higher scale, stricter ingress) |

Environment behavior is controlled **only by values files**, not by templates.

---

## ⚙️ Values files

- `values.yaml` – shared defaults
- `values-dev.yaml` – local development
- `values-stg.yaml` – staging
- `values-prod.yaml` – production

Helm applies them in order:
```bash
helm upgrade --install \
  url-platform \
  charts/url-platform \
  -n url-platform \
  -f values.yaml \
  -f values-dev.yaml
```

Later files override earlier ones.

---

## 🧪 Local deployment (dev)

```bash
kubectl create namespace url-platform
kubectl apply -f k8s/manifests/05-secrets.yaml

helm upgrade --install \
  url-platform \
  charts/url-platform \
  -n url-platform \
  -f charts/url-platform/values-dev.yaml
```

Ingress is exposed via NodePort **30000**.

---

## 🧪 Staging deployment

```bash
helm upgrade --install \
  url-platform \
  charts/url-platform \
  -n url-platform \
  -f charts/url-platform/values-stg.yaml
```

Notes:
- Uses images from GHCR
- No NodePort assumptions
- Intended for real clusters, not kind

---

## 🏭 Production deployment

```bash
helm upgrade --install \
  url-platform \
  charts/url-platform \
  -n url-platform \
  -f charts/url-platform/values-prod.yaml
```

Notes:
- Uses versioned images (e.g. `v0.2.0`)
- Higher replica counts
- SSL redirect enabled at ingress

---

## 🏷️ Image versioning

- Images are published by CI
- Tags are promoted via values files
- Helm templates remain environment-agnostic

---

## 🧠 Design principles

- No hard-coded environment logic in templates
- No local-only assumptions leaking into stg/prod
- Promotion happens by configuration, not code changes
