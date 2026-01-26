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
