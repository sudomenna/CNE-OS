/**
 * T-11-08 — Testes unitários: send_external
 *
 * docs/20-domain/15-automation.md §7 Actions, §13.6
 * Cobrir: fetch chamado com URL/method/payload; 200 retorna ok=true;
 *         4xx/5xx retorna ok=false sem lançar; rede falha lança para retry.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTACT_ID = '00000000-0000-0000-0000-000000000001'
const URL = 'https://hooks.example.com/notify'

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

// ---------------------------------------------------------------------------
// Import (após mock global declarado)
// ---------------------------------------------------------------------------

const { sendExternal } = await import('../../../../lib/domain/automation/actions/send-external')

const tx = {} as never

function makeCtx() {
  return {
    subject: {},
    subjectKind: 'contact',
    subjectId: CONTACT_ID,
  }
}

function mockFetchOk(status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status,
    json: vi.fn().mockResolvedValue({}),
  })
}

function mockFetchError(status: number) {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue({ error: 'bad request' }),
  })
}

function mockFetchNetworkError() {
  fetchMock.mockRejectedValueOnce(new Error('Network request failed'))
}

// ===========================================================================

describe('send_external action', () => {
  beforeEach(() => {
    fetchMock.mockClear()
  })

  describe('given valid URL and 200 response', () => {
    it('when sendExternal then returns ok=true with status 200', async () => {
      mockFetchOk(200)
      const result = await sendExternal({ url: URL }, makeCtx(), tx)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.output).toEqual({ status: 200 })
      }
    })

    it('when sendExternal with POST method and payload then fetch is called with correct args', async () => {
      mockFetchOk(200)
      const payload = { event: 'sale_approved', contact_id: CONTACT_ID }

      await sendExternal({ url: URL, method: 'POST', payload }, makeCtx(), tx)

      expect(fetchMock).toHaveBeenCalledWith(
        URL,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      )
    })

    it('when sendExternal with PUT method then fetch uses PUT', async () => {
      mockFetchOk(201)
      await sendExternal({ url: URL, method: 'PUT' }, makeCtx(), tx)

      expect(fetchMock).toHaveBeenCalledWith(
        URL,
        expect.objectContaining({ method: 'PUT' }),
      )
    })

    it('when sendExternal without method then defaults to POST', async () => {
      mockFetchOk(200)
      await sendExternal({ url: URL }, makeCtx(), tx)

      expect(fetchMock).toHaveBeenCalledWith(
        URL,
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('given 4xx HTTP error', () => {
    it('when sendExternal with 400 then returns ok=false with HTTP 400', async () => {
      mockFetchError(400)
      const result = await sendExternal({ url: URL }, makeCtx(), tx)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('HTTP 400')
      }
    })

    it('when sendExternal with 422 then returns ok=false without throwing', async () => {
      mockFetchError(422)
      const result = await sendExternal({ url: URL }, makeCtx(), tx)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('HTTP 422')
      }
    })
  })

  describe('given 5xx HTTP error', () => {
    it('when sendExternal with 500 then returns ok=false with HTTP 500', async () => {
      mockFetchError(500)
      const result = await sendExternal({ url: URL }, makeCtx(), tx)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('HTTP 500')
      }
    })
  })

  describe('given network failure', () => {
    it('when sendExternal and fetch throws then propagates error for Inngest retry', async () => {
      mockFetchNetworkError()
      await expect(sendExternal({ url: URL }, makeCtx(), tx)).rejects.toThrow(
        'Network request failed',
      )
    })
  })
})
