import { NavLink } from 'react-router-dom'

const navStyle = {
  position: 'sticky',
  top: 0,
  zIndex: 100,
  display: 'flex',
  alignItems: 'center',
  padding: '0 2rem',
  height: '60px',
  background: 'rgba(10, 12, 16, 0.85)',
  backdropFilter: 'blur(12px)',
  borderBottom: '1px solid var(--border-subtle)',
  gap: '2.5rem',
}

const logoStyle = {
  fontFamily: 'var(--font-display)',
  fontSize: '1.6rem',
  letterSpacing: '0.12em',
  color: 'var(--accent-cyan)',
  textDecoration: 'none',
  marginRight: 'auto',
  textShadow: '0 0 20px rgba(0, 229, 255, 0.4)',
  userSelect: 'none',
}

const linkBase = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.78rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  textDecoration: 'none',
  color: 'var(--text-secondary)',
  padding: '0.3rem 0',
  borderBottom: '2px solid transparent',
  transition: 'color 0.15s, border-color 0.15s',
}

const linkActiveStyle = {
  ...linkBase,
  color: 'var(--accent-cyan)',
  borderBottomColor: 'var(--accent-cyan)',
}

export default function NavBar() {
  return (
    <nav style={navStyle} role="navigation" aria-label="Main navigation">
      <span style={logoStyle}>URL PLATFORM</span>
      <NavLink
        to="/shorten"
        style={({ isActive }) => isActive ? linkActiveStyle : linkBase}
      >
        Shorten
      </NavLink>
      <NavLink
        to="/stats"
        style={({ isActive }) => isActive ? linkActiveStyle : linkBase}
      >
        Stats
      </NavLink>
    </nav>
  )
}
