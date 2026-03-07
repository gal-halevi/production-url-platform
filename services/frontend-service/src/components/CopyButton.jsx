import { useState } from 'react'

export default function CopyButton({ text, style = {} }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API unavailable — silently ignore
    }
  }

  return (
    <button
      onClick={handleCopy}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.72rem',
        letterSpacing: '0.08em',
        padding: '0.4rem 0.9rem',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${copied ? 'var(--accent-lime)' : 'var(--border-active)'}`,
        background: copied ? 'rgba(170, 255, 0, 0.08)' : 'transparent',
        color: copied ? 'var(--accent-lime)' : 'var(--accent-cyan)',
        cursor: 'pointer',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        ...style,
      }}
    >
      {copied ? 'COPIED' : 'COPY'}
    </button>
  )
}
