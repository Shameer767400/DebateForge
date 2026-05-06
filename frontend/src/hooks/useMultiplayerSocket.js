import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

const MP_EVENTS = [
  'room_state',
  'user_joined',
  'user_left',
  'match_started',
  'turn_change',
  'turn_timeout',
  'argument_submitted',
  'fallacy_detected',
  'scores_update',
  'moderator_message',
  'chat_message',
  'vote_update',
  'voting_phase',
  'match_ended',
  'error',
];

/**
 * useMultiplayerSocket
 *
 * Manages Socket.IO connection to the /multiplayer namespace.
 *
 * @param {string}   roomId
 * @param {Function} onEvent(eventName, data)
 */
export function useMultiplayerSocket(roomId, { onEvent } = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  /* ── Socket setup ── */
  useEffect(() => {
    if (!roomId) return;

    const baseUrl = process.env.REACT_APP_WS_URL || process.env.REACT_APP_API_URL || '';
    const socket = io(`${baseUrl}/multiplayer`, {
      transports: ['websocket'],
      auth: {
        token: localStorage.getItem('debateforge_token') || localStorage.getItem('token'),
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join_room', { roomId });
    });

    socket.on('disconnect', () => setConnected(false));

    MP_EVENTS.forEach((event) => {
      socket.on(event, (data) => {
        onEventRef.current?.(event, data);
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  /* ── Actions ── */
  const selectTeam = useCallback((team) => {
    socketRef.current?.emit('select_team', { roomId, team });
  }, [roomId]);

  const startMatch = useCallback(() => {
    socketRef.current?.emit('start_match', { roomId });
  }, [roomId]);

  const submitArgument = useCallback((text) => {
    if (!text?.trim()) return;
    socketRef.current?.emit('submit_argument', { roomId, text: text.trim() });
  }, [roomId]);

  const sendChat = useCallback((text) => {
    if (!text?.trim()) return;
    socketRef.current?.emit('chat_message', { roomId, text: text.trim() });
  }, [roomId]);

  const submitVote = useCallback((vote) => {
    socketRef.current?.emit('submit_vote', { roomId, vote });
  }, [roomId]);

  return {
    connected,
    selectTeam,
    startMatch,
    submitArgument,
    sendChat,
    submitVote,
  };
}
