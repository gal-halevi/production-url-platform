import axios from 'axios'

// Base URL injected at runtime via nginx entrypoint.
// In production, set to the full external API URL (e.g. https://api.galhalevi.dev).
// In local docker-compose, leave empty — nginx proxies /api/* to the backend services,
// avoiding CORS without conflicting with React Router paths like /stats and /shorten.
const baseURL =
  (typeof window !== 'undefined' && window.__ENV__?.API_URL) ||
  import.meta.env?.VITE_API_URL ||
  ''

// In docker-compose (baseURL empty), calls go to /api/urls, /api/stats.
// In production (baseURL set), calls go to https://api.galhalevi.dev/urls, /stats.
const apiPrefix = baseURL ? '' : '/api'

const client = axios.create({
  baseURL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

export async function shortenUrl(longUrl) {
  const { data } = await client.post(`${apiPrefix}/urls`, { long_url: longUrl })
  return data
}

export async function getStats() {
  const { data } = await client.get(`${apiPrefix}/stats`)
  return data
}

export async function getStatsByCode(code) {
  const { data } = await client.get(`${apiPrefix}/stats/${code}`)
  return data
}
