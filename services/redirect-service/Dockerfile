# syntax=docker/dockerfile:1

FROM golang:1.25-alpine AS build
WORKDIR /src

RUN apk add --no-cache ca-certificates

COPY go.mod go.sum* ./
RUN go mod download && go mod verify

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/redirect-service .

FROM gcr.io/distroless/static:nonroot
WORKDIR /

COPY --from=build /out/redirect-service /redirect-service
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

ENV PORT=8080
EXPOSE 8080

# Note: distroless has no shell/curl, so we drop HEALTHCHECK for now.
# Kubernetes liveness/readiness probes will hit /health and /ready instead.

ENTRYPOINT ["/redirect-service"]
