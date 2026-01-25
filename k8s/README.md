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

## Next steps
- Add Kubernetes manifests for postgres + services (Deployments/Services)
- Wire configuration via ConfigMaps/Secrets
- Add port-forward commands for local testing
