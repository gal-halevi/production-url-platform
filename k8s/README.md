# 🧱 Kubernetes Cluster (kind)

This directory documents **cluster-level setup only**.
It intentionally excludes application and Helm-specific concerns.

The goal is to keep a clean separation between:
- **Cluster infrastructure** (kind, ingress controller)
- **Application deployment** (Helm chart under `charts/`)

---

## 🧰 Prerequisites
- Docker
- kubectl
- kind

---

## 🚀 Create local cluster

```bash
kind create cluster --config k8s/kind-config.yaml
```

Verify:
```bash
kubectl cluster-info
kubectl get nodes
```

---

## 🗑️ Delete cluster

```bash
kind delete cluster --name url-platform
```

---

## 🌐 Ingress Controller (NGINX)

This project uses **ingress-nginx** for HTTP routing.

The ingress controller is a **cluster-level dependency** and is:
- Installed once per cluster
- Not versioned or templated inside the Helm chart

### 📦 Install ingress-nginx (kind)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Wait for readiness:
```bash
kubectl -n ingress-nginx get pods
```

---

## 📝 Notes

- No application manifests live here
- No Helm commands should be documented here
- Environment-specific deployment lives under [charts/url-platform/](/charts/url-platform/)

If you are looking to deploy the platform, continue to:
[charts/url-platform/README.md](/charts/url-platform/README.md)
