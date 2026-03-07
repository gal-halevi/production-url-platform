import { useState, useEffect, useCallback } from 'react'
import { getStats } from '../api/client.js'
import CodeLookup from '../components/CodeLookup.jsx'

const ITEMS_PER_PAGE = 20

function StatCard({ label, value, accent, delay = '' }) {
  return (
    <div
      className={`fade-up ${delay}`}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
        padding: '1.25rem 1.5rem',
      }}
    >
      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.68rem',
        color: 'var(--text-muted)',
        letterSpacing: '0.12em',
        marginBottom: '0.4rem',
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-display)',
        fontSize: '2.2rem',
        letterSpacing: '0.06em',
        color: accent || 'var(--text-primary)',
        lineHeight: 1,
      }}>
        {value ?? '—'}
      </p>
    </div>
  )
}

export default function Stats() {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getStats()
      setData(result)
    } catch {
      setError('Failed to load stats. Is the API reachable?')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const rows     = data?.top || []
  const total    = data?.tracked_codes ?? rows.length
  const topHits  = rows.length > 0 ? Math.max(...rows.map(r => r.count ?? 0)) : null

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
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
          PLATFORM
          <span style={{ color: 'var(--accent-lime)' }}> STATS</span>
        </h1>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          letterSpacing: '0.06em',
        }}>
          LIVE TRAFFIC OVERVIEW
        </p>
      </div>

      {/* Stat cards */}
      {!error && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginBottom: '2rem',
        }}>
          <StatCard
            label="TRACKED CODES"
            value={loading ? '…' : total}
            accent="var(--accent-cyan)"
            delay="fade-up-delay-1"
          />
          <StatCard
            label="TOP URL HITS"
            value={loading ? '…' : topHits}
            accent="var(--accent-lime)"
            delay="fade-up-delay-2"
          />
          <StatCard
            label="URLS IN TABLE"
            value={loading ? '…' : rows.length}
            delay="fade-up-delay-3"
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '1.25rem 1.5rem',
          background: 'rgba(255, 107, 53, 0.08)',
          border: '1px solid rgba(255, 107, 53, 0.3)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.82rem',
          color: 'var(--accent-orange)',
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
          role="alert"
        >
          <span>⚠ {error}</span>
          <button
            onClick={load}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              padding: '0.3rem 0.8rem',
              border: '1px solid var(--accent-orange)',
              borderRadius: 'var(--radius-sm)',
              background: 'transparent',
              color: 'var(--accent-orange)',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* Top URLs table */}
      {!error && (
        <section style={{ marginBottom: '2.5rem' }}>
          <SectionTitle>TOP {ITEMS_PER_PAGE} CODES</SectionTitle>
          {loading ? (
            <Skeleton />
          ) : rows.length === 0 ? (
            <Empty message="No URLs tracked yet." />
          ) : (
            <CodeTable rows={rows.slice(0, ITEMS_PER_PAGE)} />
          )}
        </section>
      )}

      {/* Code lookup */}
      <section>
        <SectionTitle>LOOKUP BY CODE</SectionTitle>
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.5rem 1.75rem',
        }}>
          <CodeLookup />
        </div>
      </section>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 style={{
      fontFamily: 'var(--font-mono)',
      fontSize: '0.72rem',
      color: 'var(--text-muted)',
      letterSpacing: '0.14em',
      marginBottom: '0.75rem',
    }}>
      {children}
    </h2>
  )
}

function CodeTable({ rows }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
    }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8rem',
      }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {['#', 'CODE', 'HITS'].map(h => (
              <th key={h} style={{
                padding: h === '#' ? '0.75rem 1rem 0.75rem 1.5rem' : '0.75rem 1rem',
                textAlign: h === 'HITS' ? 'right' : 'left',
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                fontWeight: 'normal',
                fontSize: '0.68rem',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const hits = row.count ?? 0
            const code = row.code ?? '—'
            return (
              <tr
                key={code}
                style={{
                  borderBottom: i < rows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '0.7rem 1rem 0.7rem 1.5rem', color: 'var(--text-muted)' }}>
                  {i + 1}
                </td>
                <td style={{ padding: '0.7rem 1rem', color: 'var(--accent-cyan)' }}>
                  {code}
                </td>
                <td style={{
                  padding: '0.7rem 1.5rem 0.7rem 1rem',
                  textAlign: 'right',
                  color: hits > 0 ? 'var(--accent-lime)' : 'var(--text-muted)',
                  fontWeight: hits > 0 ? '700' : 'normal',
                }}>
                  {hits.toLocaleString()}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.75rem',
    }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{
          height: '16px',
          borderRadius: '3px',
          background: 'var(--bg-elevated)',
          opacity: 1 - i * 0.15,
          animation: 'pulse-border 1.5s ease infinite',
        }} />
      ))}
    </div>
  )
}

function Empty({ message }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-lg)',
      padding: '2rem',
      textAlign: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.82rem',
      color: 'var(--text-muted)',
    }}>
      {message}
    </div>
  )
}
