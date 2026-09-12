import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { UpdatePrompt } from './update-prompt'

const { useRegisterSWMock } = vi.hoisted(() => ({ useRegisterSWMock: vi.fn() }))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: useRegisterSWMock,
}))

describe('UpdatePrompt', () => {
  it('renders nothing when no update is waiting', () => {
    useRegisterSWMock.mockReturnValue({
      needRefresh: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    })
    const { container } = render(<UpdatePrompt />)
    expect(container).toBeEmptyDOMElement()
  })

  it('refreshes via updateServiceWorker(true) when the update button is clicked', async () => {
    const updateServiceWorker = vi.fn()
    useRegisterSWMock.mockReturnValue({
      needRefresh: [true, vi.fn()],
      updateServiceWorker,
    })
    render(<UpdatePrompt />)
    await userEvent.click(screen.getByRole('button', { name: 'Tải lại' }))
    expect(updateServiceWorker).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('dismisses by calling the needRefresh setter with false', async () => {
    const setNeedRefresh = vi.fn()
    useRegisterSWMock.mockReturnValue({
      needRefresh: [true, setNeedRefresh],
      updateServiceWorker: vi.fn(),
    })
    render(<UpdatePrompt />)
    await userEvent.click(screen.getByRole('button', { name: 'Đóng' }))
    expect(setNeedRefresh).toHaveBeenCalledExactlyOnceWith(false)
  })
})
