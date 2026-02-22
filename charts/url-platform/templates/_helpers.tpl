{{- define "url-platform.name" -}}
url-platform
{{- end -}}

{{- define "url-platform.fullname" -}}
{{- .Release.Name -}}
{{- end -}}

{{- define "url-platform.labels" -}}
app.kubernetes.io/name: {{ include "url-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Shared PrometheusRule metadata block.
Usage: include "url-platform.prometheusRuleMeta" (dict "svc" "redirect-service" "suffix" "availability" "ctx" .)
*/}}
{{- define "url-platform.prometheusRuleMeta" -}}
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: {{ include "url-platform.fullname" .ctx }}-{{ .svc }}-{{ .suffix }}
  namespace: {{ .ctx.Release.Namespace }}
  labels:
    {{- with .ctx.Values.monitoring.prometheusRules.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
{{- end -}}

{{/*
Render a ServiceMonitor for a given service.
Usage: include "url-platform.serviceMonitor" (dict "svc" "redirect-service" "ctx" .)
*/}}
{{- define "url-platform.serviceMonitor" -}}
{{- $svc := .svc -}}
{{- $ctx := .ctx -}}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "url-platform.fullname" $ctx }}-{{ $svc }}
  namespace: {{ $ctx.Release.Namespace }}
  labels:
    {{- with $ctx.Values.monitoring.serviceMonitor.labels }}
    {{- toYaml . | nindent 4 }}
    {{- end }}
spec:
  selector:
    matchLabels:
      app: {{ $svc }}
  namespaceSelector:
    matchNames:
      - {{ $ctx.Release.Namespace }}
  endpoints:
    - port: http
      path: {{ $ctx.Values.monitoring.serviceMonitor.path | default "/metrics" }}
      interval: {{ $ctx.Values.monitoring.serviceMonitor.interval | default "30s" }}
      scrapeTimeout: {{ $ctx.Values.monitoring.serviceMonitor.scrapeTimeout | default "10s" }}
{{- end -}}

{{/*
Render an availability PrometheusRule for a given service.
Usage: include "url-platform.availabilityRule" (dict "svc" "redirect-service" "ctx" .)
*/}}
{{- define "url-platform.availabilityRule" -}}
{{- $svc := .svc -}}
{{- $ctx := .ctx -}}
{{- $alertName := $svc | replace "-" " " | title | replace " " "" -}}
{{ include "url-platform.prometheusRuleMeta" (dict "svc" $svc "suffix" "availability" "ctx" $ctx) }}
spec:
  groups:
    - name: {{ $svc }}.availability
      rules:
        - alert: {{ $alertName }}Down
          expr: |
            max by (namespace, service) (
              up{namespace="{{ $ctx.Release.Namespace }}", service="{{ $svc }}"} == 0
            )
          for: 2m
          labels:
            severity: warning
            service: {{ $svc }}
            env: {{ $ctx.Values.global.appEnv | default "unknown" | quote }}
          annotations:
            summary: "{{ $svc }} is down (not being scraped)"
            description: "Prometheus cannot scrape {{ $svc }} in namespace {{ $ctx.Release.Namespace }} for more than 2 minutes."
{{- end -}}

{{/*
Render a latency SLO PrometheusRule for a given service.
Usage: include "url-platform.latencySLORule" (dict "svc" "redirect-service" "ctx" .)
*/}}
{{- define "url-platform.latencySLORule" -}}
{{- $svc := .svc -}}
{{- $ctx := .ctx -}}
{{- $ns := $ctx.Release.Namespace -}}
{{- $alertName := $svc | replace "-" " " | title | replace " " "" -}}
{{- $slo := $ctx.Values.monitoring.prometheusRules.latencySLO -}}
{{- $threshold := $slo.thresholdSeconds | default "0.5" -}}
{{- $budget := $slo.errorBudgetFraction | default 0.05 -}}
{{- $fastShort := $slo.fastShortWindow | default "5m" -}}
{{- $fastLong := $slo.fastLongWindow | default "1h" -}}
{{- $slowShort := $slo.slowShortWindow | default "30m" -}}
{{- $slowLong := $slo.slowLongWindow | default "6h" -}}
{{- $fastBurn := $slo.fastBurnMultiplier | default 14 -}}
{{- $slowBurn := $slo.slowBurnMultiplier | default 2 -}}
{{ include "url-platform.prometheusRuleMeta" (dict "svc" $svc "suffix" "latency-slo" "ctx" $ctx) }}
spec:
  groups:
    - name: {{ $svc }}.slo.latency
      rules:
        - alert: {{ $alertName }}LatencySLOFastBurn
          expr: |
            (
              (
                (
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $fastShort }}]))
                -
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le={{ $threshold | quote }}}[{{ $fastShort }}]))
                )
                /
                clamp_min(sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $fastShort }}])), 1e-9)
              )
              / {{ $budget }}
            ) > {{ $fastBurn }}
            and
            (
              (
                (
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $fastLong }}]))
                -
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le={{ $threshold | quote }}}[{{ $fastLong }}]))
                )
                /
                clamp_min(sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $fastLong }}])), 1e-9)
              )
              / {{ $budget }}
            ) > {{ $fastBurn }}
          for: {{ $slo.fastBurnFor | default "2m" }}
          labels:
            severity: {{ $slo.fastSeverity | default "page" | quote }}
            service: {{ $svc }}
            env: {{ $ctx.Values.global.appEnv | default "unknown" | quote }}
          annotations:
            summary: "{{ $svc }} latency SLO fast burn (p95>{{ $threshold }}s)"
            description: "Error budget burn rate is high for both {{ $fastShort }} and {{ $fastLong }} windows."
        - alert: {{ $alertName }}LatencySLOSlowBurn
          expr: |
            (
              (
                (
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $slowShort }}]))
                -
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le={{ $threshold | quote }}}[{{ $slowShort }}]))
                )
                /
                clamp_min(sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $slowShort }}])), 1e-9)
              )
              / {{ $budget }}
            ) > {{ $slowBurn }}
            and
            (
              (
                (
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $slowLong }}]))
                -
                  sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le={{ $threshold | quote }}}[{{ $slowLong }}]))
                )
                /
                clamp_min(sum(rate(http_request_duration_seconds_bucket{namespace="{{ $ns }}",service="{{ $svc }}",le="+Inf"}[{{ $slowLong }}])), 1e-9)
              )
              / {{ $budget }}
            ) > {{ $slowBurn }}
          for: {{ $slo.slowBurnFor | default "15m" }}
          labels:
            severity: {{ $slo.slowSeverity | default "ticket" | quote }}
            service: {{ $svc }}
            env: {{ $ctx.Values.global.appEnv | default "unknown" | quote }}
          annotations:
            summary: "{{ $svc }} latency SLO slow burn (p95>{{ $threshold }}s)"
            description: "Error budget burn rate is moderately high for both {{ $slowShort }} and {{ $slowLong }} windows."
{{- end -}}
