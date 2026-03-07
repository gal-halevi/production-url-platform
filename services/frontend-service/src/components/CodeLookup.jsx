import { useState } from 'react'
import { getStatsByCode } from '../api/client.js'

const inputStyle = {
  flex: 1,
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  padding: '0.65rem 1rem',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color 0.15s',
}

export default function CodeLookup() {
  const [code, setCode] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleLookup() {
    const trimmed = code.trim()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await getStatsByCode(trimmed)
      setResult(data)
    } catch (err) {
      const status = err.response?.status
      setError(status === 404 ? `Code "${trimmed}" not found.` : 'Lookup failed. Is the API reachable?')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleLookup()
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <input
          style={inputStyle}
          type="text"
          placeholder="Enter short code..."
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={e => (e.target.style.borderColor = 'var(--border-active)')}
          onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
          aria-label="Short code to look up"
        />
        <button
          onClick={handleLookup}
          disabled={loading || !code.trim()}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            letterSpacing: '0.08em',
            padding: '0.65rem 1.25rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-active)',
            background: 'transparent',
            color: 'var(--accent-cyan)',
            cursor: loading || !code.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !code.trim() ? 0.5 : 1,
            transition: 'all 0.15s',
          }}
        >
          {loading ? '...' : 'LOOKUP'}
        </button>
      </div>

      {error && (
        <p style={{
          marginTop: '0.75rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: 'var(--accent-orange)',
        }}>
          {error}
        </p>
      )}

      {result && (
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          animation: 'fadeUp 0.3s ease both',
        }}>
          <Row label="CODE"  value={result.code} accent="var(--accent-cyan)" />
          <Row label="HITS"  value={result.count ?? '—'} accent="var(--accent-lime)" />
        </div>
      )}
    </div>
  )
}

function Row({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
      <span style={{ color: 'var(--text-muted)', minWidth: '48px' }}>{label}</span>
      <span style={{
        color: accent || 'var(--text-primary)',
        wordBreak: 'break-all',
      }}>
        {String(value)}
      </span>
    </div>
  )
}
