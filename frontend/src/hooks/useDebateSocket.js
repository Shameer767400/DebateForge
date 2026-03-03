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
  const audioQueueRef    = useRef([]);     // Not used for Web Speech API, but keeping for reference or future use
  const sentenceBufRef   = useRef('');     // Buffer for incoming text chunks
  const isPlayingRef     = useRef(false);  // guard against concurrent plays
  const onEventRef       = useRef(onEvent);

  /* keep onEvent ref fresh without re-running socket effect */
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  /* ─────────────────────────────────────────────
     Audio playback helpers
  ───────────────────────────────────────────── */
  /* Warm up voices for Chrome/Safari */
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = () => synth.getVoices();
    }
    synth.getVoices();
  }, []);

  /** Speak a single sentence using Web Speech API */
  const speakSentence = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    console.log('[useDebateSocket] Speaking:', trimmed);
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(trimmed);
    
    // Choose a professional sounding voice if available (macOSAlex is high quality)
    const voices = synth.getVoices();
    const preferredVoice = voices.find(v => v.name === 'Alex') || 
                          voices.find(v => v.name.includes('Samantha')) ||
                           voices.find(v => v.name.includes('Daniel')) ||
                           voices.find(v => v.name.includes('Google US English')) ||
                           voices.find(v => v.lang === 'en-US');
    
    if (preferredVoice) {
      console.log('[useDebateSocket] Using voice:', preferredVoice.name);
      utterance.voice = preferredVoice;
    }

    utterance.rate = 1.0; 
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsAISpeaking(true);
    utterance.onend = () => {
      // Only set to false if nothing else is in the queue
      if (!synth.speaking) setIsAISpeaking(false);
    };
    utterance.onerror = (e) => console.error('[useDebateSocket] TTS Error:', e);

    synth.speak(utterance);
  }, []);

  const handleAiTextChunk = useCallback((text) => {
    sentenceBufRef.current += text;

    // Use a regex to find all complete sentences ending in . ! or ?
    // followed by possible whitespace.
    const sentences = sentenceBufRef.current.match(/[^.!?]+[.!?](\s|$)/g);
    
    if (sentences) {
      sentences.forEach(s => speakSentence(s));
      // Remove spoken sentences from the buffer
      sentenceBufRef.current = sentenceBufRef.current.slice(sentences.join('').length);
    }
  }, [speakSentence]);

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
        /* Browser-based TTS (Web Speech API) 
           We speak incoming text chunks as they form sentences. */
        if (event === 'ai_text_chunk') {
          handleAiTextChunk(data.text);
        }

        /* Flush any remaining text when the turn is done */
        if (event === 'ai_turn_complete') {
          if (sentenceBufRef.current.trim()) {
            speakSentence(sentenceBufRef.current);
            sentenceBufRef.current = '';
          }
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
