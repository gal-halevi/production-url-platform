# Production URL Platform – Architecture

## Purpose
This repository demonstrates modern, production-grade DevOps practices using a realistic but intentionally simple application.

The focus is on:
- CI/CD design and tradeoffs
- Kubernetes deployment and operations
- Infrastructure as Code
- Observability and reliability
- Secure configuration and automation

Application logic is minimal by design. The value is in how the system is built, deployed, and operated.

---

## System Overview

### Services
- url-service (Node.js)
- redirect-service (Go)
- analytics-service (Python)

### Data Stores
- PostgreSQL
- Redis (optional later)

---

## Environments
- local: Docker Compose
- k8s-local: kind / minikube
- dev / stg / prod: AWS EKS

---

## CI/CD
- Jenkins (primary CI)
- Helm deployments
- Optional GitOps with ArgoCD

---

## Observability
- Prometheus
- Grafana
- Alertmanager

---

## Infrastructure
- Terraform (AWS)
- S3 remote state + DynamoDB lock
- EKS + RDS

---

## Configuration Management
- Ansible for Jenkins runners / hosts
