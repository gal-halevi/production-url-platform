import axios from 'axios'

// Base URLs injected at runtime via nginx entrypoint.
// In production, set to the full external URLs (e.g. https://api.galhalevi.dev).
// In local docker-compose, leave empty — nginx proxies /api/* to the backend services,
// avoiding CORS without conflicting with React Router paths like /stats and /shorten.
const apiBaseURL =
  (typeof window !== 'undefined' && window.__ENV__?.API_URL) ||
  import.meta.env?.VITE_API_URL ||
  ''

const analyticsBaseURL =
  (typeof window !== 'undefined' && window.__ENV__?.ANALYTICS_URL) ||
  import.meta.env?.VITE_ANALYTICS_URL ||
  ''

// In docker-compose (baseURLs empty), calls go to /api/urls and /api/stats via nginx proxy.
// In production (baseURLs set), calls go to their respective services directly.
const apiPrefix       = apiBaseURL       ? '' : '/api'
const analyticsPrefix = analyticsBaseURL ? '' : '/api'

const apiClient = axios.create({
  baseURL: apiBaseURL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

const analyticsClient = axios.create({
  baseURL: analyticsBaseURL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

export async function shortenUrl(longUrl) {
  const { data } = await apiClient.post(`${apiPrefix}/urls`, { long_url: longUrl })
  return data
}

export async function getStats() {
  const { data } = await analyticsClient.get(`${analyticsPrefix}/stats`)
  return data
}

export async function getStatsByCode(code) {
  const { data } = await analyticsClient.get(`${analyticsPrefix}/stats/${code}`)
  return data
}
