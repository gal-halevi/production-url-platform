### Overview
This PR introduces the **redirect-service**, responsible for handling short URL redirects
and acting as the entry point for user traffic.

The service is intentionally small and production-shaped, establishing conventions that
will be reused by the other services in the platform.

---

### Features
- HTTP service implemented in Go
- Health and readiness endpoints for orchestration
- Redirect endpoint (`GET /r/{code}`) returning a proper HTTP 302
- Configurable via environment variables
- Structured logging and graceful shutdown handling
- Containerized for local, CI, and Kubernetes execution

---

### Current behavior
- Redirects any valid code to a configurable default destination  
  (temporary behavior until url-service integration in a later milestone)

---

### How to test
```bash
# Run locally
go run services/redirect-service

# Health check
curl http://localhost:8080/health

# Redirect
curl -i http://localhost:8080/r/example
