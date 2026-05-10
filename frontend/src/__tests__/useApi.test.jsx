import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// We need to mock AuthContext BEFORE importing useApi
const mockLogout = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    logout: mockLogout,
    refreshSession: mockRefreshSession,
    isAuthenticated: true,
  }),
}));

// Now import useApi after mocks are set
const { useApi } = await import('../hooks/useApi');

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    useNavigate: () => mockNavigate,
  };
});

function wrapper({ children }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useApi hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRefreshSession.mockResolvedValue(true);
  });

  it('should return an axios instance', () => {
    const { result } = renderHook(() => useApi(), { wrapper });

    expect(result.current).toBeDefined();
    expect(typeof result.current.get).toBe('function');
    expect(typeof result.current.post).toBe('function');
    expect(typeof result.current.put).toBe('function');
    expect(typeof result.current.delete).toBe('function');
  });

  it('should have withCredentials enabled', () => {
    const { result } = renderHook(() => useApi(), { wrapper });

    // Check the instance defaults
    expect(result.current.defaults.withCredentials).toBe(true);
  });

  it('should have response interceptors configured', () => {
    const { result } = renderHook(() => useApi(), { wrapper });

    // Axios instances with interceptors have handlers array
    expect(result.current.interceptors.response.handlers.length).toBeGreaterThan(0);
  });

  it('should return a stable reference across re-renders', () => {
    const { result, rerender } = renderHook(() => useApi(), { wrapper });
    const first = result.current;
    rerender();
    const second = result.current;
    expect(first).toBe(second);
  });
});
