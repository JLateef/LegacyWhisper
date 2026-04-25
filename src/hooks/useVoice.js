import { useEffect, useRef, useState, useCallback } from 'react';

const SR = typeof window !== 'undefined'
  && (window.SpeechRecognition || window.webkitSpeechRecognition);

function pickVoice() {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  return voices.find(v => v.lang.startsWith('en') && /female/i.test(v.name))
    || voices.find(v => v.lang.startsWith('en') && !/male/i.test(v.name))
    || voices.find(v => v.lang.startsWith('en'))
    || null;
}

export function useVoice({ onTranscript, currentQuestion }) {
  const recRef = useRef(null);
  const questionRef = useRef(currentQuestion);
  const voiceRef = useRef(null); // populated after Chrome loads voices async

  // Refs track live state without stale closures inside event handlers
  const connectedRef = useRef(false);
  const listeningRef = useRef(false);
  const speakingRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    questionRef.current = currentQuestion;
  }, [currentQuestion]);

  // Chrome loads voices asynchronously — populate voiceRef when ready
  useEffect(() => {
    const load = () => { voiceRef.current = pickVoice(); };
    load();
    window.speechSynthesis?.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', load);
  }, []);

  // ── Speech synthesis ──────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch (_) {}
  }, []);

  const startListening = useCallback(() => {
    if (!recRef.current || speakingRef.current || !listeningRef.current) return;
    try { recRef.current.start(); } catch (_) {}
  }, []);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    stopListening();

    const clean = text.replace(/\n+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.92;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (voiceRef.current) utterance.voice = voiceRef.current;

    speakingRef.current = true;

    utterance.onend = () => {
      speakingRef.current = false;
      if (listeningRef.current && connectedRef.current) startListening();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
    };

    window.speechSynthesis.speak(utterance);
  }, [startListening, stopListening]);

  // Speak incoming questions automatically while connected
  useEffect(() => {
    if (connected && currentQuestion?.text) {
      speak(currentQuestion.text);
    }
  }, [currentQuestion, connected, speak]);

  // ── Connect / disconnect ──────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (connected || connecting) return;

    if (!SR) {
      setError('Voice recognition requires Chrome or Edge.');
      return;
    }
    if (!window.speechSynthesis) {
      setError('Speech synthesis is not supported in this browser.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });

      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) {
            const text = e.results[i][0].transcript.trim();
            if (text) onTranscript(text);
          }
        }
      };

      rec.onerror = (e) => {
        // no-speech and aborted are not real errors
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        setError(`Microphone error: ${e.error}`);
      };

      // Chrome stops recognition after silence — restart if we're still live
      rec.onend = () => {
        if (listeningRef.current && connectedRef.current && !speakingRef.current) {
          setTimeout(() => {
            if (listeningRef.current && connectedRef.current) {
              try { rec.start(); } catch (_) {}
            }
          }, 250);
        }
      };

      recRef.current = rec;
      connectedRef.current = true;
      listeningRef.current = true;
      setConnected(true);
      setMicEnabled(true);
      setConnecting(false);

      // Speak the current question; if none yet, start listening immediately
      if (questionRef.current?.text) {
        speak(questionRef.current.text);
      } else {
        startListening();
      }
    } catch (err) {
      setError(err?.message || 'Could not access microphone. Check browser permissions.');
      setConnecting(false);
    }
  }, [connected, connecting, speak, startListening, onTranscript]);

  const disconnect = useCallback(() => {
    window.speechSynthesis?.cancel();
    connectedRef.current = false;
    listeningRef.current = false;
    speakingRef.current = false;
    stopListening();
    recRef.current = null;
    setConnected(false);
    setMicEnabled(false);
    setConnecting(false);
    setError(null);
  }, [stopListening]);

  const toggleMic = useCallback(() => {
    if (!connected) return;
    if (micEnabled) {
      listeningRef.current = false;
      setMicEnabled(false);
      stopListening();
    } else {
      listeningRef.current = true;
      setMicEnabled(true);
      if (!speakingRef.current) startListening();
    }
  }, [connected, micEnabled, startListening, stopListening]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
      try { recRef.current?.stop(); } catch (_) {}
    };
  }, []);

  return { connect, disconnect, toggleMic, connected, micEnabled, connecting, error };
}
