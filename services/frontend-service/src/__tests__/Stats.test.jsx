import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import Stats from '../pages/Stats.jsx'
import { handlers, errorHandlers, STATS_RESPONSE } from './handlers.js'

const server = setupServer(...handlers)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

function renderStats() {
  return render(
    <MemoryRouter>
      <Stats />
    </MemoryRouter>
  )
}

describe('Stats page', () => {
  it('renders the heading', () => {
    renderStats()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('shows total tracked codes after load', async () => {
    renderStats()
    await waitFor(() =>
      expect(screen.queryByText('…')).not.toBeInTheDocument()
    )
    // STATS_RESPONSE.tracked_codes = 3
    expect(screen.getAllByText('3').length).toBeGreaterThanOrEqual(1)
  })

  it('renders a row for each entry in the response', async () => {
    renderStats()
    await screen.findByText(STATS_RESPONSE.top[0].code)

    const rows = screen.getAllByRole('row')
    // thead row + 3 data rows
    expect(rows).toHaveLength(1 + STATS_RESPONSE.top.length)
  })

  it('displays the code and hit count for each entry', async () => {
    renderStats()
    await screen.findByText(STATS_RESPONSE.top[0].code)

    for (const { code } of STATS_RESPONSE.top) {
      expect(screen.getByText(code)).toBeInTheDocument()
    }

    const table = screen.getByRole('table')
    for (const { count } of STATS_RESPONSE.top) {
      const cells = within(table).getAllByText(count.toLocaleString())
      expect(cells.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('renders an error state and retry button on API failure', async () => {
    server.use(errorHandlers.statsError)
    renderStats()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/failed to load/i)
    expect(within(alert).getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('retries loading when the Retry button is clicked', async () => {
    server.use(errorHandlers.statsError)
    renderStats()

    await screen.findByRole('alert')

    server.resetHandlers()

    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    await screen.findByText(STATS_RESPONSE.top[0].code)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renders the code lookup section', async () => {
    renderStats()
    expect(screen.getByLabelText(/short code to look up/i)).toBeInTheDocument()
  })

  it('shows code lookup result for a valid code', async () => {
    renderStats()
    const input = screen.getByLabelText(/short code to look up/i)
    await userEvent.type(input, STATS_RESPONSE.top[0].code)
    fireEvent.click(screen.getByRole('button', { name: /lookup/i }))

    await waitFor(() => {
      expect(screen.getByText('HITS')).toBeInTheDocument()
    })
    expect(screen.getAllByText('42').length).toBeGreaterThanOrEqual(1)
  })

  it('shows not found error for an unknown code', async () => {
    renderStats()
    const input = screen.getByLabelText(/short code to look up/i)
    await userEvent.type(input, 'zzz999')
    fireEvent.click(screen.getByRole('button', { name: /lookup/i }))

    expect(await screen.findByText(/not found/i)).toBeInTheDocument()
  })
})
