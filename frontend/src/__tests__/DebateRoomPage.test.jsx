import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DebateRoomPage from '../pages/DebateRoomPage';

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockEndDebate = vi.fn(() => true);
const mockSetLanguage = vi.fn();
const mockToast = {
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
};

let latestOnEvent = null;

vi.mock('../hooks/useApi', () => ({
  useApi: () => ({
    get: mockApiGet,
    post: mockApiPost,
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', username: 'Alice' },
  }),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

vi.mock('../hooks/useDebateSocket', () => ({
  useDebateSocket: (_debateId, opts = {}) => {
    latestOnEvent = opts.onEvent;
    return {
      connected: true,
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      endDebate: mockEndDebate,
      sendText: vi.fn(),
      broadcastGDCountdown: vi.fn(),
      liveTranscript: '',
      isAISpeaking: false,
      availableVoices: [],
      setVoiceEnabled: vi.fn(),
      setTtsLanguageOverride: vi.fn(),
      setLanguage: mockSetLanguage,
    };
  },
}));

vi.mock('../components/Confetti', () => ({ default: () => null }));
vi.mock('../components/StreakCelebration', () => ({ default: () => null }));
vi.mock('../components/ShareDebateModal', () => ({ default: () => null }));

function renderDebateRoom() {
  return render(
    <MemoryRouter initialEntries={['/debate/debate-123']}>
      <Routes>
        <Route path="/debate/:id" element={<DebateRoomPage />} />
        <Route path="/lobby" element={<div>Lobby</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('DebateRoomPage topbar controls and end-debate score display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestOnEvent = null;
    Element.prototype.scrollIntoView = vi.fn();
    mockApiGet.mockResolvedValue({
      data: {
        debate: {
          _id: 'debate-123',
          userId: 'user-1',
          topicSnapshot: 'AI will replace all human jobs within 20 years',
          format: 'freeform',
          status: 'active',
          language: 'en',
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders both language selector and End Debate button visibly in the topbar', async () => {
    renderDebateRoom();

    await waitFor(() => {
      expect(screen.getByText('AI will replace all human jobs within 20 years')).toBeInTheDocument();
    });

    const langSelect = screen.getByLabelText('Debate language');
    const endBtn = screen.getByRole('button', { name: /End Debate/i });

    expect(langSelect).toBeVisible();
    expect(endBtn).toBeVisible();
  });

  it('shows calculating state on End Debate click and displays score immediately when judge_verdict arrives', async () => {
    renderDebateRoom();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /End Debate/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /End Debate/i }));

    expect(mockEndDebate).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Calculating Your Score/i)).toBeInTheDocument();

    act(() => {
      latestOnEvent('judge_verdict', {
        winner: 'user',
        userScore: 82,
        aiScore: 68,
        feedback: 'Strong rebuttal and clear evidence.',
      });
    });

    expect(screen.getByText(/Debate Report Card/i)).toBeInTheDocument();
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.getByText('68')).toBeInTheDocument();
  });

  it('recovers and shows score via polling without page refresh if judge_verdict socket event is missed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderDebateRoom();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /End Debate/i })).toBeInTheDocument();
    });

    mockApiGet.mockResolvedValue({
      data: {
        debate: {
          _id: 'debate-123',
          userId: 'user-1',
          topicSnapshot: 'AI will replace all human jobs within 20 years',
          format: 'freeform',
          status: 'completed',
          endedAt: new Date().toISOString(),
          judgeScore: {
            winner: 'ai',
            userScore: 79,
            aiScore: 84,
            feedback: 'Solid logic, improve factual citations.',
          },
        },
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /End Debate/i }));
    expect(screen.getByText(/Calculating Your Score/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => {
      expect(screen.getByText(/Debate Report Card/i)).toBeInTheDocument();
    });
    expect(screen.getByText('79')).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
  });

  it('displays Debate Summary score card when debate_ended arrives without judge_verdict', async () => {
    renderDebateRoom();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /End Debate/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /End Debate/i }));

    act(() => {
      latestOnEvent('debate_ended', {
        winner: 'ai',
        userFinalScore: 42,
        forfeit: true,
        message: 'Debate ended early.',
      });
    });

    expect(screen.getByText(/Debate Summary/i)).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('Debate ended early.')).toBeInTheDocument();
  });
});
