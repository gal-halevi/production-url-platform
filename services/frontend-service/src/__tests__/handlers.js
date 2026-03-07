import { http, HttpResponse } from 'msw'

export const SHORTEN_RESPONSE = {
  code: 'abc123',
  short_url: 'https://r.example.com/abc123',
}

export const STATS_RESPONSE = {
  tracked_codes: 3,
  top: [
    { code: 'abc123', count: 42 },
    { code: 'def456', count: 17 },
    { code: 'ghi789', count: 5 },
  ],
}

export const handlers = [
  http.post('/api/urls', () =>
    HttpResponse.json(SHORTEN_RESPONSE, { status: 201 })
  ),

  http.get('/api/stats', () =>
    HttpResponse.json(STATS_RESPONSE)
  ),

  http.get('/api/stats/:code', ({ params }) => {
    const match = STATS_RESPONSE.top.find(u => u.code === params.code)
    if (!match) return HttpResponse.json({ message: 'Not found' }, { status: 404 })
    return HttpResponse.json(match)
  }),
]

export const errorHandlers = {
  shortenServerError: http.post('/api/urls', () =>
    HttpResponse.json({ message: 'Internal Server Error' }, { status: 500 })
  ),
  shortenValidationError: http.post('/api/urls', () =>
    HttpResponse.json({ message: 'Invalid URL' }, { status: 422 })
  ),
  statsError: http.get('/api/stats', () =>
    HttpResponse.json({ message: 'Service Unavailable' }, { status: 503 })
  ),
}
