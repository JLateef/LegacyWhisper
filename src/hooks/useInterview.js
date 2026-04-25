import { useState, useCallback, useRef, useEffect } from 'react';
import { PHASES, ACKNOWLEDGMENTS, PHASE_TRANSITIONS, KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

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

  useEffect(() => { phaseIdxRef.current = phaseIdx; }, [phaseIdx]);
  useEffect(() => { questionIdxRef.current = questionIdx; }, [questionIdx]);
  useEffect(() => { followUpAskedRef.current = followUpAsked; }, [followUpAsked]);

  const currentPhase = PHASES[phaseIdx] || PHASES[PHASES.length - 1];
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

  const startInterview = useCallback(async (info) => {
    setInterviewee(info);
    setPhase('interview');

    await delay(400);
    setIsTyping(true);
    await delay(1600);
    setIsTyping(false);

    const openingQ = PHASES[0].questions[0];
    setMessages([makeMsg('ai', openingQ.text, PHASES[0].id, openingQ.knowledgeTag)]);
  }, []);

  const sendMessage = useCallback(async (userText) => {
    if (!userText.trim() || isTyping || phase !== 'interview') return;

    // Read from refs — always the latest values regardless of when this callback was created
    const curPhaseIdx = phaseIdxRef.current;
    const curQIdx = questionIdxRef.current;
    const curPhase = PHASES[curPhaseIdx] || PHASES[PHASES.length - 1];
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

      if (nextPhaseIdx < PHASES.length) {
        const nextPhase = PHASES[nextPhaseIdx];
        const nextQ = nextPhase.questions[0];
        const transition = PHASE_TRANSITIONS[nextPhase.id] || '';

        setPhaseIdx(nextPhaseIdx);
        setQuestionIdx(0);
        setIsTyping(false);
        setMessages(prev => [...prev,
          makeMsg('ai', `${ack}\n\n${transition ? `— ${transition} —\n\n` : ''}${nextQ.text}`, nextPhase.id, nextQ.knowledgeTag)
        ]);
      } else {
        setPhaseIdx(PHASES.length - 1);
        setIsTyping(false);
        setPhase('complete');
        setMessages(prev => [...prev,
          makeMsg('ai',
            `${ack}\n\nThat's everything. Thank you — truly.\n\nThe knowledge you've shared today has been organized into a confidential briefing for your team and your successor. The context, the decisions, the hidden knowledge — none of it will be lost.\n\nYou can review the full Knowledge Brief in the tab above, export it as a document, and share individual sections with specific colleagues.\n\nあなたの知識は、次の世代のエンジニアに受け継がれます。Thank you for your time.`,
            'complete', null)
        ]);
        setActiveView('summary');
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
  }, []);

  const generateSummary = useCallback(() => {
    const sections = [];
    for (const [tag, entries] of Object.entries(knowledgeBase)) {
      if (entries.length > 0) {
        sections.push({
          label: KNOWLEDGE_TAG_LABELS[tag] || tag,
          tag,
          entries,
        });
      }
    }
    return sections;
  }, [knowledgeBase]);

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
    activeView,
    currentPhase,
    currentQuestion,
    startInterview,
    resetInterview,
    sendMessage,
    acceptSuggestedPerson,
    dismissSuggestedPerson,
    updateConnection,
    addConnectionManually,
    addDocument,
    generateSummary,
    setActiveView,
  };
}
