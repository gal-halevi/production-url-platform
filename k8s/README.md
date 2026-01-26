# Local Kubernetes (kind)

This project uses kind for a reproducible local Kubernetes environment.

## Prerequisites
- Docker
- kubectl
- kind

## Create cluster
```bash
kind create cluster --config k8s/kind-config.yaml
```

Verify:
```bash
kubectl cluster-info
kubectl get nodes
```

## Delete cluster
```bash
kind delete cluster --name url-platform
```

## Loading local images into kind

kind runs Kubernetes nodes as Docker containers. Images built on your host are not automatically available inside the cluster.

Build an image:
```bash
docker build -t url-service:dev services/url-service
```

Load it into kind:
```bash
kind load docker-image url-service:dev --name url-platform
```

Repeat for other services:
```bash
docker build -t redirect-service:dev services/redirect-service
kind load docker-image redirect-service:dev --name url-platform

docker build -t analytics-service:dev services/analytics-service
kind load docker-image analytics-service:dev --name url-platform
```

## Ingress (NGINX) 🌐

This project uses **ingress-nginx** as the Kubernetes ingress controller for local development with kind.

Ingress resources in this repository require an ingress controller to be installed in the cluster. The controller is a cluster-level dependency and is not versioned in this repository.

### Install ingress-nginx (once per cluster)

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Wait until the controller is ready:

```bash
kubectl -n ingress-nginx get pods
```

### Traffic flow

The ingress controller exposes HTTP traffic on NodePort **30000**.

Ingress rules defined under `k8s/manifests/` route incoming traffic to the appropriate services based on URL paths.

## Helm-based deployment

While raw Kubernetes manifests are kept under `k8s/manifests/` for reference and learning purposes,
the recommended way to deploy the platform locally is via **Helm**.

The Helm chart packages all services (postgres, url-service, redirect-service, analytics-service)
along with ingress routing and runtime configuration.

### Deploy using Helm

- Ensure ingress-nginx is installed (see section above)
- Create the namespace:
  ```bash
  kubectl create namespace url-platform
  ```
- Apply local secrets:
  ```bash
  kubectl apply -f k8s/manifests/05-secrets.yaml
  ```
- Install or upgrade the chart:
  ```bash
  helm upgrade --install url-platform charts/url-platform -n url-platform
  ```

After installation, the platform is accessible through the ingress entry point
(NodePort 30000 by default), using path-based routing:
- `/` → url-service
- `/r` → redirect-service
- `/stats` → analytics-service
