import { Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar.jsx'
import Shorten from './pages/Shorten.jsx'
import Stats from './pages/Stats.jsx'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <NavBar />
      <main style={{ flex: 1, padding: '2rem 1.5rem' }}>
        <Routes>
          <Route path="/"        element={<Navigate to="/shorten" replace />} />
          <Route path="/shorten" element={<Shorten />} />
          <Route path="/stats"   element={<Stats />} />
        </Routes>
      </main>
      <footer style={{
        padding: '1.5rem',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem',
        borderTop: '1px solid var(--border-subtle)',
        letterSpacing: '0.08em',
      }}>
        URL PLATFORM // {(window.__ENV__?.APP_ENV ?? 'local').toUpperCase()}
      </footer>
    </div>
  )
}
