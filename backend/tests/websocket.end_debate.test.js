jest.mock('socket.io', () => {
  const mockRoomEmit = jest.fn();
  const mockIoTo = jest.fn(() => ({ emit: mockRoomEmit }));
  const state = { connectionHandler: null, mockRoomEmit, mockIoTo };
  const Server = jest.fn().mockImplementation(() => ({
    use: jest.fn(),
    to: mockIoTo,
    on: jest.fn((event, handler) => {
      if (event === 'connection') state.connectionHandler = handler;
    }),
  }));
  Server.__mockState = state;
  return { Server };
});

jest.mock('../services/aiOrchestrator.service', () => ({
  streamResponse: jest.fn(),
}));

jest.mock('../services/debateEngine.service', () => ({
  finalizeDebate: jest.fn(),
}));

jest.mock('../models', () => {
  const Debate = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };
  const User = {
    findById: jest.fn(),
  };
  return { Debate, User };
});

const { Server } = require('socket.io');
const { Debate, User } = require('../models');
const aiOrchestrator = require('../services/aiOrchestrator.service');
const { finalizeDebate } = require('../services/debateEngine.service');
const initWebSocket = require('../websocket/index');

function createMockSocket(user) {
  const handlers = {};
  const emitted = [];
  const rooms = new Set();

  return {
    id: `sock-${Math.random().toString(36).slice(2, 8)}`,
    user,
    rooms,
    join: jest.fn((room) => rooms.add(room)),
    emit: jest.fn((event, payload) => {
      emitted.push({ event, payload });
    }),
    on: jest.fn((event, cb) => {
      handlers[event] = cb;
    }),
    _handlers: handlers,
    _emitted: emitted,
  };
}

describe('WebSocket end_debate and reconnect verdict recovery', () => {
  beforeAll(() => {
    initWebSocket({});
  });

  beforeEach(() => {
    jest.clearAllMocks();
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });
    Debate.findByIdAndUpdate.mockResolvedValue({});
    finalizeDebate.mockResolvedValue({
      avgScore: 77,
      streakResult: { newStreak: 1, milestoneReached: null, freezeUsed: false },
    });
  });

  it('scores via ML fallback and emits judge_verdict when Redis session is missing and judge LLM fails', async () => {
    const debateId = 'debate-abc-1';
    const userId = 'user-abc-1';
    const debateDoc = {
      _id: debateId,
      userId,
      topicSnapshot: 'AI will replace all human jobs within 20 years',
      userSide: 'for',
      difficulty: 'beginner',
      format: 'freeform',
      participants: [],
      arguments: [
        {
          speaker: 'user',
          content: 'AI automation is rapidly replacing repetitive cognitive tasks.',
          turnNumber: 1,
          scores: { logic: 78, evidence: 70, clarity: 82, overall: 77 },
        },
        {
          speaker: 'ai',
          content: 'Historical technological shifts created more jobs than they destroyed.',
          turnNumber: 1,
        },
      ],
    };

    Debate.findOne.mockResolvedValue(debateDoc);
    Debate.findById.mockResolvedValue(debateDoc);
    aiOrchestrator.streamResponse.mockImplementation(async function* () {
      throw new Error('All AI services failed');
    });

    const socket = createMockSocket({ id: userId, username: 'debater1' });
    Server.__mockState.connectionHandler(socket);

    await socket._handlers.end_debate({
      debateId,
      tzOffsetMinutes: 330,
    });

    expect(Server.__mockState.mockIoTo).toHaveBeenCalledWith(debateId);
    const verdictCall = Server.__mockState.mockRoomEmit.mock.calls.find(([ev]) => ev === 'judge_verdict');
    expect(verdictCall).toBeDefined();
    expect(verdictCall[1].userScore).toBe(77);

    // Direct socket fallback also delivers when socket wasn't in room yet
    const directVerdict = socket._emitted.find((e) => e.event === 'judge_verdict');
    expect(directVerdict).toBeDefined();
    expect(directVerdict.payload.userScore).toBe(77);

    expect(Debate.findByIdAndUpdate).toHaveBeenCalledWith(
      debateId,
      expect.objectContaining({
        status: 'completed',
        judgeScore: expect.objectContaining({ userScore: 77 }),
      }),
    );
  });

  it('re-emits saved judge_verdict when join_debate runs on a completed debate', async () => {
    const debateId = 'debate-abc-2';
    const userId = 'user-abc-2';
    const debateDoc = {
      _id: debateId,
      userId,
      topicSnapshot: 'AI will replace all human jobs within 20 years',
      userSide: 'for',
      difficulty: 'beginner',
      format: 'freeform',
      status: 'completed',
      endedAt: new Date(),
      participants: [],
      judgeScore: {
        userScore: 84,
        aiScore: 72,
        winner: 'user',
        feedback: 'Strong structured arguments.',
      },
    };

    Debate.findOne.mockResolvedValue(debateDoc);
    User.findById.mockResolvedValue({
      _id: userId,
      username: 'debater1',
      fallacyProfile: new Map(),
      targetImprovements: [],
      grammarMistakes: [],
    });

    const socket = createMockSocket({ id: userId, username: 'debater1' });
    Server.__mockState.connectionHandler(socket);

    await socket._handlers.join_debate({
      debateId,
      tzOffsetMinutes: 330,
      preferredLang: 'en',
    });

    const joined = socket._emitted.find((e) => e.event === 'debate_joined');
    const verdict = socket._emitted.find((e) => e.event === 'judge_verdict');
    expect(joined).toBeDefined();
    expect(verdict).toBeDefined();
    expect(verdict.payload.userScore).toBe(84);
    expect(verdict.payload.winner).toBe('user');
  });

  it('emits debate_ended with non-GD message when ended early with fewer than 2 arguments', async () => {
    const debateId = 'debate-abc-3';
    const userId = 'user-abc-3';
    const debateDoc = {
      _id: debateId,
      userId,
      topicSnapshot: 'AI will replace all human jobs within 20 years',
      userSide: 'for',
      difficulty: 'beginner',
      format: 'freeform',
      participants: [],
      arguments: [],
    };

    Debate.findOne.mockResolvedValue(debateDoc);
    finalizeDebate.mockResolvedValue({ avgScore: 0 });

    const socket = createMockSocket({ id: userId, username: 'debater1' });
    Server.__mockState.connectionHandler(socket);

    await socket._handlers.end_debate({
      debateId,
      tzOffsetMinutes: 0,
    });

    const endedCall = Server.__mockState.mockRoomEmit.mock.calls.find(([ev]) => ev === 'debate_ended');
    expect(endedCall).toBeDefined();
    expect(endedCall[1].winner).toBe('ai');
    expect(endedCall[1].forfeit).toBe(true);
    expect(endedCall[1].message).toBe('Debate ended early.');
  });

  it('still emits judge_verdict and updates winner if finalizeDebate throws after judgeScore save', async () => {
    const debateId = 'debate-abc-4';
    const userId = 'user-abc-4';
    const debateDoc = {
      _id: debateId,
      userId,
      topicSnapshot: 'AI will replace all human jobs within 20 years',
      userSide: 'for',
      difficulty: 'beginner',
      format: 'freeform',
      participants: [],
      arguments: [
        {
          speaker: 'user',
          content: 'Automation increases productivity.',
          turnNumber: 1,
          scores: { logic: 74, evidence: 68, clarity: 80, overall: 74 },
        },
        {
          speaker: 'ai',
          content: 'New industries emerge alongside automation.',
          turnNumber: 1,
        },
      ],
    };

    Debate.findOne.mockResolvedValue(debateDoc);
    Debate.findById.mockResolvedValue(debateDoc);
    aiOrchestrator.streamResponse.mockImplementation(async function* () {
      yield JSON.stringify({
        userScore: 74,
        aiScore: 70,
        winner: 'ai',
        feedback: 'Good effort.',
      });
    });
    finalizeDebate.mockRejectedValueOnce(new Error('Streak update failed'));

    const socket = createMockSocket({ id: userId, username: 'debater1' });
    Server.__mockState.connectionHandler(socket);

    await socket._handlers.end_debate({
      debateId,
      tzOffsetMinutes: 0,
    });

    const verdictCall = Server.__mockState.mockRoomEmit.mock.calls.find(([ev]) => ev === 'judge_verdict');
    expect(verdictCall).toBeDefined();
    expect(verdictCall[1].userScore).toBe(74);
    expect(Debate.findByIdAndUpdate).toHaveBeenCalledWith(
      debateId,
      expect.objectContaining({
        winner: 'ai',
        userFinalScore: 74,
        status: 'completed',
      }),
    );
  });
});
