import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../context/AuthContext';
import React from 'react';

// Mock axios globally
vi.mock('axios', () => {
  const create = vi.fn(() => ({
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  }));

  return {
    default: {
      create,
      get: vi.fn(() => Promise.resolve({ data: {} })),
      post: vi.fn(() => Promise.resolve({ data: {} })),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  };
});

// Test component that displays auth state
function AuthConsumer() {
  const { user, isAuthenticated, loading } = useAuth();
  if (loading) return <div data-testid="loading">Loading...</div>;
  return (
    <div>
      <span data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</span>
      {user && <span data-testid="username">{user.username}</span>}
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <div data-testid="child">Hello</div>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });
  });

  it('should show unauthenticated state by default (no session)', async () => {
    // Default: the session check will fail (mocked axios returns undefined)
    render(
      <MemoryRouter>
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('unauthenticated');
    });
  });

  it('should expose useAuth hook with expected shape', async () => {
    let authValue;

    function Inspector() {
      authValue = useAuth();
      return null;
    }

    render(
      <MemoryRouter>
        <AuthProvider>
          <Inspector />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(authValue).toBeDefined();
      expect(authValue).toHaveProperty('user');
      expect(authValue).toHaveProperty('login');
      expect(authValue).toHaveProperty('logout');
      expect(authValue).toHaveProperty('isAuthenticated');
      expect(authValue).toHaveProperty('loading');
      expect(authValue).toHaveProperty('checkSession');
      expect(authValue).toHaveProperty('refreshSession');
    });
  });

  it('should throw if useAuth is used outside AuthProvider', () => {
    function Bad() {
      useAuth();
      return null;
    }

    // Suppress React error boundary logs
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(
        <MemoryRouter>
          <Bad />
        </MemoryRouter>,
      );
    }).toThrow('useAuth must be used within an AuthProvider');

    spy.mockRestore();
  });
});
