# Production URL Platform

A production-style URL platform built to demonstrate modern DevOps practices end-to-end.

## What this repo demonstrates
- Containerized services with Docker
- Local orchestration with Docker Compose
- Kubernetes deployment (kind/minikube locally, EKS in AWS later)
- Helm charts with environment-specific values
- CI/CD with Jenkins (pipeline, artifacts, scanning, promotions)
- Infrastructure as Code with Terraform (multi-environment)
- Configuration management with Ansible (where it fits)
- Observability: metrics, dashboards, and alerting (Prometheus/Grafana)

## Services and runtime (local)
This project consists of three services:
- url-service: creates and stores short URLs
- redirect-service: handles redirects and records usage
- analytics-service: aggregates redirect counts

All services communicate over HTTP and share a single PostgreSQL database in local development.
See Docker Compose configuration for exact wiring.

## Quickstart (local)
Run the url-service container:

```bash
docker build -t url-service:dev services/url-service
docker run --rm -e PORT=3000 -e BASE_URL=http://localhost:3000 -p 3000:3000 url-service:dev
curl -s http://localhost:3000/health
```

## Project docs
- Architecture overview: [PROJECT_ARCHITECTURE.md](./docs/PROJECT_ARCHITECTURE.md)
- Milestones and plan: [MILESTONE_TRACKER.md](./docs/MILESTONE_TRACKER.md)

## Status
Work in progress. This repository is built milestone-by-milestone with PRs and documented decisions.
