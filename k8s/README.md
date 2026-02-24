# 🧱 Raw Kubernetes Manifests (Historical)

This directory contains the **original raw Kubernetes manifests** written before the platform was abstracted into a Helm chart and managed by ArgoCD.

These manifests are **not used for active deployments**. They are preserved intentionally as a foundation reference — they show the underlying Kubernetes primitives that the Helm chart and GitOps layer are built on top of.

---

## Why this exists

The platform was built progressively:

1. **Raw manifests** (this directory) — hand-written YAML for each resource, establishing the core topology: namespace, secrets, PostgreSQL, three service Deployments, and ingress
2. **Helm chart** (`charts/url-platform/`) — the same resources templated and parameterized, with environment-driven values, Flyway migration Jobs, and ArgoCD sync waves added
3. **GitOps** ([`production-url-platform-gitops`](https://github.com/gal-halevi/production-url-platform-gitops)) — ArgoCD Applications driving all deployments, with per-environment values files and automated promotion workflows

Understanding the raw manifests gives useful context for reading the Helm templates — you can see exactly what each template is generating.

---

## Contents

| File | What it defines |
|---|---|
| `00-namespace.yaml` | `url-platform` namespace |
| `05-secrets.example.yaml` | Secret structure reference (no real values) |
| `10-postgress.yaml` | PostgreSQL Deployment, Service, PVC |
| `20-url-service.yaml` | url-service Deployment and Service |
| `30-redirect-service.yaml` | redirect-service Deployment and Service |
| `40-analytics-service.yaml` | analytics-service Deployment and Service |
| `50-ingress.yaml` | Ingress rules for all three services |

---

## Active deployment

For how the platform is actually deployed today, see:

- [charts/url-platform/README.md](../charts/url-platform/README.md) — Helm chart and sync wave architecture
- [production-url-platform-gitops](https://github.com/gal-halevi/production-url-platform-gitops) — ArgoCD Applications and per-environment values
