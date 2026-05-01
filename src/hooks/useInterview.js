import { useState, useCallback, useRef, useEffect } from 'react';
import { PHASES, ACKNOWLEDGMENTS, KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

// ── Simplified interview structure ─────────────────────────────────────────────

const INTRO_QUESTION = {
  id: 'intro',
  text: "Welcome, and thank you for your time today.\n\nWe're here to capture the knowledge that lives in your head about this codebase — the decisions, the gotchas, the history that isn't in any doc.\n\nLet's start simply: your name, your role, and how long you've been working on this system?",
  knowledgeTag: 'background',
  followUps: [],
};

// Specific questions about the sample codebase — mirrors the test_step2.py transcript.
// Used when Machine 1 hasn't run (no server) so the demo always asks code-anchored questions.
const FALLBACK_CODE_QUESTIONS = [
  {
    id: 'f1',
    text: "config.py line 1 sets SYNC_CHUNK_SIZE = 847. That's a very specific number, and there are at least two 'update chunk size' commits in the history. Why that number and not something rounder like 1000 or 500?",
    knowledgeTag: 'context',
    followUps: [],
  },
  {
    id: 'f2',
    text: "In transformers.py line 19, normalize_price is called on the description field with a '# fix' comment. A function called normalize_price being applied to a description looks wrong — but the comment suggests it was intentional. What was that fixing?",
    knowledgeTag: 'gotcha',
    followUps: [],
  },
  {
    id: 'f3',
    text: "In connectors/storefront.py, StorefrontConflictError is caught and silently passed — no log, no counter, nothing. Why are 409 conflicts being silently dropped rather than logged or retried?",
    knowledgeTag: 'decision',
    followUps: [],
  },
  {
    id: 'f4',
    text: "ENABLE_DELTA_SYNC is set to False in config, but there's a full implementation of delta sync in sync_engine.py. Commit 5e39e0d is titled 'disable delta sync' after three fix commits. What was fundamentally broken, and what would need to be true to re-enable it safely?",
    knowledgeTag: 'risk',
    followUps: [],
  },
  {
    id: 'f5',
    text: "MERCHANT_OVERRIDE_IDS contains [1042, 7731] and forces those merchants through the v1 warehouse connector regardless of region. Why those specific merchants, and what breaks if they go through send_to_warehouse_v2?",
    knowledgeTag: 'context',
    followUps: [],
  },
  {
    id: 'f6',
    text: "There's a time.sleep(0.3) inside the per-record loop in sync_products — not per batch, per record. Commit 97c8d9e is just titled 'increase sleep'. At 30k products that's 150 minutes of sleeping. Why 0.3 specifically, and what happens if someone removes it?",
    knowledgeTag: 'risk',
    followUps: [],
  },
  {
    id: 'f7',
    text: "_handle_legacy_format in transformers.py appears to have no direct callers anywhere in the codebase — grep and IDE navigation both show it as unused. Is it actually called? How would you know not to delete it during a cleanup?",
    knowledgeTag: 'gotcha',
    followUps: [],
  },
  {
    id: 'f8',
    text: "On August 2nd and 3rd, Aisha reverted 31 lines from storefront.py, then un-reverted them the next morning. What broke during those 24 hours, and which scenario is the current code still not handling?",
    knowledgeTag: 'context',
    followUps: [],
  },
  {
    id: 'f9',
    text: "SYNC-001 was reopened three times for weekend runs failing 15-20% more than weekdays, and the resolution just says 'Updated sync parameters.' What actually changed, and why do weekends behave differently?",
    knowledgeTag: 'risk',
    followUps: [],
  },
];


function extractPotentialPeople(text) {
  const found = new Set();

  const pairs = text.match(/\b[A-Z][a-z]{1,20}(?:\s[A-Z][a-z]{1,20})+\b/g) || [];
  pairs.forEach(n => found.add(n));

  const japanese = [...text.matchAll(/\b([A-Za-z]{2,15})(?:-san|-kun|-chan|-sama)\b/gi)];
  japanese.forEach(m => found.add(m[1]));

  const titled = [...text.matchAll(/\b(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)];
  titled.forEach(m => found.add(m[1]));

  const STOP = new Set([
    'The','This','That','They','There','Then','These','Those','When','Where','What',
    'Which','Who','Why','How','Also','And','But','Or','For','So','Yet','January',
    'February','March','April','June','July','August','September','October',
    'November','December','Monday','Tuesday','Wednesday','Thursday','Friday',
    'Saturday','Sunday','Building','Floor','Room','Office','Department','Team',
    'Tokyo','Japan','Osaka','Main','Every','Each','After','Before','During',
  ]);

  return [...found].filter(name => {
    const first = name.split(' ')[0];
    return !STOP.has(first) && name.length > 2;
  });
}

function getRandomAck() {
  return ACKNOWLEDGMENTS[Math.floor(Math.random() * ACKNOWLEDGMENTS.length)];
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let msgId = 0;
function makeMsg(role, content, phaseId, questionTag) {
  return { id: ++msgId, role, content, phaseId, questionTag, ts: new Date() };
}

export function useInterview() {
  const [phase, setPhase] = useState('setup');
  const [interviewee, setInterviewee] = useState(null);
  const [messages, setMessages] = useState([]);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [followUpAsked, setFollowUpAsked] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [connections, setConnections] = useState([]);
  const [suggestedPeople, setSuggestedPeople] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [knowledgeBase, setKnowledgeBase] = useState({});
  const [activeView, setActiveView] = useState('interview');

  // Refs to always read the latest values inside async sendMessage,
  // avoiding stale closure bugs after React re-renders mid-await.
  const phaseIdxRef = useRef(0);
  const questionIdxRef = useRef(0);
  const followUpAskedRef = useRef(false);
  const [activePhases, setActivePhases] = useState(PHASES);
  const activePhasesRef = useRef(PHASES);

  useEffect(() => { phaseIdxRef.current = phaseIdx; }, [phaseIdx]);
  useEffect(() => { questionIdxRef.current = questionIdx; }, [questionIdx]);
  useEffect(() => { followUpAskedRef.current = followUpAsked; }, [followUpAsked]);

  const currentPhase = activePhases[phaseIdx] || activePhases[activePhases.length - 1];
  const currentQuestion = currentPhase?.questions[questionIdx] || null;

  const addToKnowledge = useCallback((tag, content) => {
    setKnowledgeBase(prev => ({
      ...prev,
      [tag]: [...(prev[tag] || []), content],
    }));
  }, []);

  const acceptSuggestedPerson = useCallback((name) => {
    setSuggestedPeople(prev => prev.filter(p => p !== name));
    setConnections(prev => {
      if (prev.some(c => c.name.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, {
        id: Date.now() + Math.random(),
        name,
        role: '',
        email: '',
        notes: '',
        mentionedIn: [currentPhase?.id],
        knowledgeTags: [currentQuestion?.knowledgeTag].filter(Boolean),
        addedAt: new Date(),
      }];
    });
  }, [currentPhase, currentQuestion]);

  const dismissSuggestedPerson = useCallback((name) => {
    setSuggestedPeople(prev => prev.filter(p => p !== name));
  }, []);

  const updateConnection = useCallback((id, updates) => {
    setConnections(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const addConnectionManually = useCallback((name) => {
    if (!name.trim()) return;
    setConnections(prev => {
      if (prev.some(c => c.name.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, {
        id: Date.now() + Math.random(),
        name: name.trim(),
        role: '',
        email: '',
        notes: '',
        mentionedIn: [],
        knowledgeTags: [],
        addedAt: new Date(),
      }];
    });
  }, []);

  const addDocument = useCallback((doc) => {
    setDocuments(prev => [...prev, { ...doc, id: Date.now() + Math.random(), addedAt: new Date() }]);
  }, []);

  const startInterview = useCallback(async (info, questionPlan = null) => {
    // Always use a single-phase simplified structure: 1 intro + 5 code questions
    let codeQuestions;
    if (questionPlan && questionPlan.length > 0) {
      const order = { high: 0, medium: 1, low: 2 };
      codeQuestions = [...questionPlan]
        .sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1))
        .slice(0, 9)
        .map((q, i) => ({
          id: `gq${i}`,
          text: q.question_text,
          knowledgeTag: q.reference_type || 'context',
          followUps: [],
        }));
    } else {
      codeQuestions = FALLBACK_CODE_QUESTIONS;
    }

    const phases = [{
      id: 'interview',
      name: 'Interview',
      icon: '◆',
      color: 'indigo',
      questions: [INTRO_QUESTION, ...codeQuestions],
    }];

    activePhasesRef.current = phases;
    setActivePhases(phases);

    setInterviewee(info);
    setPhase('interview');

    await delay(400);
    setIsTyping(true);
    await delay(1600);
    setIsTyping(false);

    const openingQ = phases[0].questions[0];
    setMessages([makeMsg('ai', openingQ.text, phases[0].id, openingQ.knowledgeTag)]);
  }, []);

  const sendMessage = useCallback(async (userText) => {
    if (!userText.trim() || isTyping || phase !== 'interview') return;

    // Read from refs — always the latest values regardless of when this callback was created
    const curPhaseIdx = phaseIdxRef.current;
    const curQIdx = questionIdxRef.current;
    const curPhase = activePhasesRef.current[curPhaseIdx] || activePhasesRef.current[activePhasesRef.current.length - 1];
    const curQuestion = curPhase?.questions[curQIdx] || null;

    const userMsg = makeMsg('user', userText, curPhase?.id, curQuestion?.knowledgeTag);
    setMessages(prev => [...prev, userMsg]);

    const detectedPeople = extractPotentialPeople(userText);
    if (detectedPeople.length > 0) {
      setSuggestedPeople(prev => {
        const existing = new Set(prev.map(p => p.toLowerCase()));
        const newPeople = detectedPeople.filter(p => !existing.has(p.toLowerCase()));
        return [...new Set([...prev, ...newPeople])];
      });
    }

    if (curQuestion?.knowledgeTag) {
      addToKnowledge(curQuestion.knowledgeTag, userText);
    }

    setIsTyping(true);
    await delay(1000 + Math.random() * 1000);

    const lowerText = userText.toLowerCase();
    const potentialFollowUp = !followUpAskedRef.current && curQuestion?.followUps?.find(f =>
      f.triggers.some(t => lowerText.includes(t))
    );

    if (potentialFollowUp) {
      setFollowUpAsked(true);
      setIsTyping(false);
      setMessages(prev => [...prev, makeMsg('ai', potentialFollowUp.text, curPhase?.id, curQuestion?.knowledgeTag)]);
      return;
    }

    const ack = getRandomAck();
    const nextQIdx = curQIdx + 1;
    const phaseQuestions = curPhase.questions;

    setFollowUpAsked(false);

    if (nextQIdx < phaseQuestions.length) {
      const nextQ = phaseQuestions[nextQIdx];
      setQuestionIdx(nextQIdx);
      setIsTyping(false);
      setMessages(prev => [...prev,
        makeMsg('ai', `${ack}\n\n${nextQ.text}`, curPhase.id, nextQ.knowledgeTag)
      ]);
    } else {
      const nextPhaseIdx = curPhaseIdx + 1;

      if (nextPhaseIdx < activePhasesRef.current.length) {
        const nextPhase = activePhasesRef.current[nextPhaseIdx];
        const nextQ = nextPhase.questions[0];
        const transition = PHASE_TRANSITIONS[nextPhase.id] || '';

        setPhaseIdx(nextPhaseIdx);
        setQuestionIdx(0);
        setIsTyping(false);
        setMessages(prev => [...prev,
          makeMsg('ai', `${ack}\n\n${transition ? `— ${transition} —\n\n` : ''}${nextQ.text}`, nextPhase.id, nextQ.knowledgeTag)
        ]);
      } else {
        setIsTyping(false);
        setPhase('complete');
        setMessages(prev => [...prev,
          makeMsg('ai',
            `${ack}\n\nThat's everything. Thank you — truly.\n\nThe knowledge you've shared is being prepared as your handoff document now.`,
            'complete', null)
        ]);
      }
    }
  }, [isTyping, phase, addToKnowledge]);

  const resetInterview = useCallback(() => {
    setPhase('setup');
    setInterviewee(null);
    setMessages([]);
    setPhaseIdx(0);
    setQuestionIdx(0);
    setFollowUpAsked(false);
    setIsTyping(false);
    setConnections([]);
    setSuggestedPeople([]);
    setDocuments([]);
    setKnowledgeBase({});
    setActiveView('interview');
    setActivePhases(PHASES);
    activePhasesRef.current = PHASES;
  }, []);

  // Progress tracking for the simplified single-phase flow
  const totalQuestions = activePhases.reduce((sum, p) => sum + p.questions.length, 0);
  const currentQuestionNumber = Math.min(
    activePhases.slice(0, phaseIdx).reduce((sum, p) => sum + p.questions.length, 0) + questionIdx + 1,
    totalQuestions
  );

  return {
    phase,
    interviewee,
    messages,
    phaseIdx,
    questionIdx,
    isTyping,
    connections,
    suggestedPeople,
    documents,
    knowledgeBase,
    currentPhase,
    currentQuestion,
    totalQuestions,
    currentQuestionNumber,
    startInterview,
    resetInterview,
    sendMessage,
    acceptSuggestedPerson,
    dismissSuggestedPerson,
    updateConnection,
    addConnectionManually,
    addDocument,
  };
}
