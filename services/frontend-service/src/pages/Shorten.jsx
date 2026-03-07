import { useState } from 'react'
import { shortenUrl } from '../api/client.js'
import CopyButton from '../components/CopyButton.jsx'

const MAX_URL_LENGTH = 2048

function isValidUrl(str) {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export default function Shorten() {
  const [url, setUrl]       = useState('')
  const [result, setResult] = useState(null)
  const [error, setError]   = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    const trimmed = url.trim()
    if (!trimmed) return

    if (!isValidUrl(trimmed)) {
      setError('Enter a valid http:// or https:// URL.')
      setResult(null)
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await shortenUrl(trimmed)
      setResult(data)
      setUrl('')
    } catch (err) {
      const status = err.response?.status
      if (status === 422 || status === 400) {
        setError('Invalid URL rejected by the API.')
      } else if (status >= 500) {
        setError('Service unavailable. Try again shortly.')
      } else {
        setError('Something went wrong. Is the API reachable?')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  const shortUrl = result?.short_url || result?.shortUrl || result?.url

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div className="fade-up" style={{ marginBottom: '2.5rem' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.8rem, 6vw, 5rem)',
          letterSpacing: '0.06em',
          lineHeight: 1,
          color: 'var(--text-primary)',
          marginBottom: '0.5rem',
        }}>
          SHORTEN
          <span style={{ color: 'var(--accent-cyan)' }}> IT</span>
        </h1>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          letterSpacing: '0.06em',
        }}>
          PASTE A LONG URL — GET A SHORT ONE
        </p>
      </div>

      {/* Input card */}
      <div
        className="fade-up fade-up-delay-1"
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem',
          boxShadow: 'var(--glow-cyan)',
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'stretch' }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <input
              type="url"
              value={url}
              onChange={e => { setUrl(e.target.value); setError(null) }}
              onKeyDown={handleKeyDown}
              placeholder="https://your-very-long-url.com/goes/here"
              maxLength={MAX_URL_LENGTH}
              disabled={loading}
              aria-label="URL to shorten"
              style={{
                width: '100%',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.85rem',
                padding: '0.75rem 1rem',
                background: 'var(--bg-elevated)',
                border: `1px solid ${error ? 'var(--accent-orange)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = 'var(--border-active)' }}
              onBlur={e => { if (!error) e.target.style.borderColor = 'var(--border-subtle)' }}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !url.trim()}
            aria-label="Shorten URL"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.1rem',
              letterSpacing: '0.12em',
              padding: '0 1.75rem',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: loading || !url.trim()
                ? 'rgba(0, 229, 255, 0.08)'
                : 'var(--accent-cyan)',
              color: loading || !url.trim()
                ? 'var(--text-muted)'
                : 'var(--bg-base)',
              cursor: loading || !url.trim() ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? '...' : 'GO'}
          </button>
        </div>

        {/* Error state */}
        {error && (
          <p style={{
            marginTop: '0.75rem',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            color: 'var(--accent-orange)',
            letterSpacing: '0.04em',
          }}
            role="alert"
          >
            ⚠ {error}
          </p>
        )}
      </div>

      {/* Result card */}
      {result && shortUrl && (
        <div
          className="fade-up"
          style={{
            marginTop: '1.25rem',
            background: 'var(--bg-card)',
            border: '1px solid rgba(170, 255, 0, 0.2)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem 1.75rem',
            boxShadow: 'var(--glow-lime)',
          }}
          role="status"
          aria-live="polite"
        >
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            marginBottom: '0.6rem',
          }}>
            SHORT URL READY
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <a
              href={shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                flex: 1,
                fontFamily: 'var(--font-mono)',
                fontSize: '1rem',
                color: 'var(--accent-lime)',
                textDecoration: 'none',
                wordBreak: 'break-all',
                letterSpacing: '0.03em',
              }}
            >
              {shortUrl}
            </a>
            <CopyButton text={shortUrl} />
          </div>
          {result.code && (
            <p style={{
              marginTop: '0.6rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              color: 'var(--text-muted)',
            }}>
              CODE: <span style={{ color: 'var(--accent-cyan)' }}>{result.code}</span>
            </p>
          )}
        </div>
      )}
    </div>
  )
}
