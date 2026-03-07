import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import Shorten from '../pages/Shorten.jsx'
import { handlers, errorHandlers, SHORTEN_RESPONSE } from './handlers.js'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderShorten() {
  return render(
    <MemoryRouter>
      <Shorten />
    </MemoryRouter>
  )
}

describe('Shorten page', () => {
  it('renders the heading and input', () => {
    renderShorten()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByLabelText(/url to shorten/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /shorten url/i })).toBeDisabled()
  })

  it('enables the submit button when input is non-empty', async () => {
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'https://example.com')
    expect(screen.getByRole('button', { name: /shorten url/i })).not.toBeDisabled()
  })

  it('shows validation error for non-URL input', async () => {
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'not-a-url')
    fireEvent.click(screen.getByRole('button', { name: /shorten url/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid.*url/i)
  })

  it('displays the short URL on success', async () => {
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'https://example.com/some/very/long/path')
    fireEvent.click(screen.getByRole('button', { name: /shorten url/i }))

    const shortLink = await screen.findByRole('link')
    expect(shortLink).toHaveAttribute('href', SHORTEN_RESPONSE.short_url)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('clears the input after a successful submission', async () => {
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'https://example.com/path')
    fireEvent.click(screen.getByRole('button', { name: /shorten url/i }))

    await screen.findByRole('status')
    expect(input).toHaveValue('')
  })

  it('shows a server error message on 5xx response', async () => {
    server.use(errorHandlers.shortenServerError)
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'https://example.com/path')
    fireEvent.click(screen.getByRole('button', { name: /shorten url/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/service unavailable/i)
  })

  it('shows a validation error message on 422 response', async () => {
    server.use(errorHandlers.shortenValidationError)
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'https://example.com/path')
    fireEvent.click(screen.getByRole('button', { name: /shorten url/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid/i)
  })

  it('submits on Enter key press', async () => {
    renderShorten()
    const input = screen.getByLabelText(/url to shorten/i)
    await userEvent.type(input, 'https://example.com/keyboard{Enter}')

    await waitFor(() =>
      expect(screen.getByRole('status')).toBeInTheDocument()
    )
  })
})
