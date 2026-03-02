import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/* ─────────────────────────────────────────────────────────────
   All server-emitted events the hook subscribes to
───────────────────────────────────────────────────────────── */
const SERVER_EVENTS = [
  'debate_joined',
  'transcript_live',
  'transcript_final',
  'fallacy_detected',
  'scores_update',
  'ai_thinking',
  'ai_text_chunk',
  'ai_audio_chunk',
  'ai_turn_complete',
  'debate_ended',
  'error',
];

/**
 * useDebateSocket
 *
 * Manages:
 *  - Socket.IO connection (WebSocket transport)
 *  - MediaRecorder audio streaming to server
 *  - Web Speech API live transcript (parallel / fallback)
 *  - AudioContext queue playback for AI audio chunks
 *
 * @param {string}   debateId
 * @param {Function} onEvent(eventName, data) — called for every server event
 *
 * @returns {{
 *   connected:      boolean,
 *   startRecording: () => Promise<void>,
 *   stopRecording:  () => void,
 *   endDebate:      () => void,
 *   liveTranscript: string,
 *   isAISpeaking:   boolean,
 *   audioSupported: boolean,
 * }}
 */
export function useDebateSocket(debateId, { onEvent } = {}) {
  /* ── public state ── */
  const [connected,      setConnected]      = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isAISpeaking,   setIsAISpeaking]   = useState(false);
  const [audioSupported] = useState(
    () => typeof MediaRecorder !== 'undefined' || 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  );

  /* ── internal refs (never cause re-renders) ── */
  const socketRef        = useRef(null);
  const mediaRecRef      = useRef(null);   // MediaRecorder instance
  const recognitionRef   = useRef(null);   // SpeechRecognition instance
  const streamRef        = useRef(null);   // getUserMedia stream
  const audioCtxRef      = useRef(null);   // AudioContext
  const audioQueueRef    = useRef([]);     // decoded AudioBuffer queue
  const isPlayingRef     = useRef(false);  // guard against concurrent plays
  const onEventRef       = useRef(onEvent);

  /* keep onEvent ref fresh without re-running socket effect */
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  /* ─────────────────────────────────────────────
     Audio playback helpers
  ───────────────────────────────────────────── */
  const playNextChunk = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsAISpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsAISpeaking(true);

    const ctx    = audioCtxRef.current;
    const source = ctx.createBufferSource();
    source.buffer = audioQueueRef.current.shift();
    source.connect(ctx.destination);
    source.onended = playNextChunk;
    source.start();
  }, []);

  const handleAiAudioChunk = useCallback((data) => {
    /* Lazily create AudioContext on first real data (requires prior user gesture) */
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;

    /* data.chunk may be an ArrayBuffer or a base64 string */
    const toBuffer = (chunk) => {
      if (chunk instanceof ArrayBuffer) return Promise.resolve(chunk);
      /* base64 → ArrayBuffer */
      const binary = atob(chunk);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return Promise.resolve(bytes.buffer);
    };

    toBuffer(data.chunk)
      .then((arrayBuf) => ctx.decodeAudioData(arrayBuf))
      .then((decoded) => {
        audioQueueRef.current.push(decoded);
        if (!isPlayingRef.current) playNextChunk();
      })
      .catch((err) => console.warn('[useDebateSocket] audio decode error:', err));
  }, [playNextChunk]);

  /* ─────────────────────────────────────────────
     Socket setup / teardown
  ───────────────────────────────────────────── */
  useEffect(() => {
    if (!debateId) return;

    const socket = io(process.env.REACT_APP_WS_URL || process.env.REACT_APP_API_URL || '', {
      transports: ['websocket'],
      auth: {
        token: localStorage.getItem('debateforge_token') || localStorage.getItem('token'),
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[useDebateSocket] connected', socket.id);
      setConnected(true);
      socket.emit('join_debate', { debateId });
    });

    socket.on('disconnect', (reason) => {
      console.log('[useDebateSocket] disconnected:', reason);
      setConnected(false);
    });

    /* subscribe to all server events */
    SERVER_EVENTS.forEach((event) => {
      socket.on(event, (data) => {
        /* Handle audio chunks internally */
        if (event === 'ai_audio_chunk') {
          handleAiAudioChunk(data);
        }
        /* Propagate every event to caller */
        onEventRef.current?.(event, data);
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId]);

  /* ─────────────────────────────────────────────
     Recording helpers
  ───────────────────────────────────────────── */

  /** Sets up Web Speech API for live transcript. Safe if not supported. */
  const startSpeechRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition       = new SR();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = 'en-US';

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      setLiveTranscript(transcript);
    };

    recognition.onerror = (e) => {
      console.warn('[useDebateSocket] SpeechRecognition error:', e.error);
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, []);

  /** PRIMARY path: MediaRecorder + parallel SpeechRecognition */
  const startRecordingWithMediaRecorder = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    /* Prefer opus/webm; fall back to browser default */
    const mimeType   = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : '';
    const recOptions = mimeType ? { mimeType } : {};
    const rec        = new MediaRecorder(stream, recOptions);
    mediaRecRef.current = rec;

    const socket = socketRef.current;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && socket) {
        socket.emit('audio_chunk', { debateId, chunk: e.data });
      }
    };

    rec.start(250);  // emit every 250 ms

    /* Parallel live transcript */
    startSpeechRecognition();
  }, [debateId, startSpeechRecognition]);

  /** FALLBACK path: SpeechRecognition only → emit transcript_direct on final result */
  const startRecordingFallback = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition       = new SR();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    recognition.lang            = 'en-US';

    recognition.onresult = (e) => {
      let interim = '';
      let final   = '';
      for (const result of e.results) {
        if (result.isFinal) final   += result[0].transcript;
        else                 interim += result[0].transcript;
      }
      setLiveTranscript(interim || final);

      if (final && socketRef.current) {
        socketRef.current.emit('transcript_direct', { debateId, text: final });
      }
    };

    recognition.onerror = (e) => {
      console.warn('[useDebateSocket] SpeechRecognition fallback error:', e.error);
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [debateId]);

  /* ─────────────────────────────────────────────
     Public API
  ───────────────────────────────────────────── */

  const startRecording = useCallback(async () => {
    try {
      if (typeof MediaRecorder !== 'undefined') {
        await startRecordingWithMediaRecorder();
      } else {
        startRecordingFallback();
      }
    } catch (err) {
      console.error('[useDebateSocket] startRecording error:', err);
      /* getUserMedia denied or MediaRecorder failed — try fallback */
      startRecordingFallback();
    }
  }, [startRecordingWithMediaRecorder, startRecordingFallback]);

  const stopRecording = useCallback(() => {
    /* Stop MediaRecorder */
    if (mediaRecRef.current && mediaRecRef.current.state !== 'inactive') {
      mediaRecRef.current.stop();
      mediaRecRef.current = null;
    }

    /* Release mic stream */
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    /* Stop speech recognition */
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    /* Signal server that audio is done */
    socketRef.current?.emit('audio_end', { debateId });

    setLiveTranscript('');
  }, [debateId]);

  const endDebate = useCallback(() => {
    socketRef.current?.emit('end_debate', { debateId });
  }, [debateId]);

  /* ─────────────────────────────────────────────
     Cleanup on unmount
  ───────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      mediaRecRef.current?.state !== 'inactive' && mediaRecRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
      audioCtxRef.current?.close();
      audioQueueRef.current = [];
    };
  }, []);

  return {
    connected,
    startRecording,
    stopRecording,
    endDebate,
    liveTranscript,
    isAISpeaking,
    audioSupported,
  };
}
