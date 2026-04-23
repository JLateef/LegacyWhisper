import { useEffect, useRef, useState, useCallback } from 'react';
import { VocalBridge } from '@vocalbridgeai/sdk';

const API_KEY = import.meta.env.VITE_VOCAL_BRIDGE_API_KEY;
const AGENT_ID = import.meta.env.VITE_VOCAL_BRIDGE_AGENT_ID;

export function useVoice({ onTranscript, currentQuestion }) {
  const vbRef = useRef(null);
  const currentQuestionRef = useRef(currentQuestion);

  const [connected, setConnected] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Keep question ref in sync so the closure inside VocalBridge always sees latest
  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  const connect = useCallback(async () => {
    if (vbRef.current || connecting) return;
    setConnecting(true);
    setError(null);

    try {
      const vb = new VocalBridge({
        auth: { apiKey: API_KEY },
        agentId: AGENT_ID,
        participantName: 'Interviewee',
        autoPlayAudio: true,
        debug: false,
      });

      vb.on('transcript', ({ role, text }) => {
        // Feed spoken user responses into the interview as if typed
        if (role === 'user' && text?.trim()) {
          onTranscript(text.trim());
        }
      });

      vb.on('connectionStateChanged', (state) => {
        const isConnected = state === 'connected';
        setConnected(isConnected);
        if (isConnected) {
          setConnecting(false);
          // Enable mic automatically on first connect
          setMicEnabled(true);
        }
        if (state === 'disconnected') {
          setMicEnabled(false);
          setConnecting(false);
        }
      });

      vb.on('error', (err) => {
        setError(err?.message || 'Voice connection failed');
        setConnecting(false);
        setConnected(false);
        setMicEnabled(false);
      });

      // When VocalBridge agent needs to respond, we supply the current interview question
      vb.onAIAgentQuery(async ({ turnId }) => {
        const q = currentQuestionRef.current;
        if (q?.text) {
          await vb.sendAIAgentResponse(turnId, q.text);
        }
      });

      await vb.connect();
      vbRef.current = vb;
    } catch (err) {
      setError(err?.message || 'Could not connect to voice agent');
      setConnecting(false);
    }
  }, [onTranscript, connecting]);

  const disconnect = useCallback(async () => {
    if (!vbRef.current) return;
    try {
      await vbRef.current.disconnect();
    } catch (_) {}
    vbRef.current = null;
    setConnected(false);
    setMicEnabled(false);
    setConnecting(false);
  }, []);

  const toggleMic = useCallback(() => {
    if (!vbRef.current) return;
    vbRef.current.toggleMicrophone();
    setMicEnabled(prev => !prev);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => { disconnect(); };
  }, [disconnect]);

  return { connect, disconnect, toggleMic, connected, micEnabled, connecting, error };
}
