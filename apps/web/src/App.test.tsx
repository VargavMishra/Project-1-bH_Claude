import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App.tsx';

function mockFetchOnce(status: number, body: unknown) {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));
}

describe('<App /> API status', () => {
  it('shows the API version when the health check succeeds', async () => {
    const fetchSpy = mockFetchOnce(200, {
      data: {
        status: 'ok',
        version: 'abc1234',
        uptimeSeconds: 5,
        timestamp: new Date().toISOString(),
      },
    });

    render(<App />);

    expect(await screen.findByText(/Connected/)).toBeInTheDocument();
    expect(screen.getByText('abc1234')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:4000/api/health',
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('shows the server error message from the standard envelope', async () => {
    mockFetchOnce(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'Database unavailable', requestId: 'r1' },
    });

    render(<App />);

    expect(await screen.findByText(/Database unavailable/)).toBeInTheDocument();
  });

  it('explains network failures in plain language', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<App />);

    expect(await screen.findByText(/Could not reach the server/)).toBeInTheDocument();
  });
});
