import { useState, useCallback } from 'react';
import { PHASES, ACKNOWLEDGMENTS, PHASE_TRANSITIONS, KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

function extractPotentialPeople(text) {
  const found = new Set();

  // Two+ consecutive Title Case words: "John Smith", "Tanaka Kenji"
  const pairs = text.match(/\b[A-Z][a-z]{1,20}(?:\s[A-Z][a-z]{1,20})+\b/g) || [];
  pairs.forEach(n => found.add(n));

  // Japanese honorifics: "Yamamoto-san", "Kenji-kun"
  const japanese = [...text.matchAll(/\b([A-Za-z]{2,15})(?:-san|-kun|-chan|-sama)\b/gi)];
  japanese.forEach(m => found.add(m[1]));

  // Single title-case words after "Mr.", "Ms.", "Dr."
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
  const [phase, setPhase] = useState('setup'); // setup | interview | complete
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

    const userMsg = makeMsg('user', userText, currentPhase?.id, currentQuestion?.knowledgeTag);
    setMessages(prev => [...prev, userMsg]);

    // Extract people from response
    const detectedPeople = extractPotentialPeople(userText);
    if (detectedPeople.length > 0) {
      setSuggestedPeople(prev => {
        const existing = new Set([...prev, ...connections.map(c => c.name.toLowerCase())]);
        const newPeople = detectedPeople.filter(p => !existing.has(p.toLowerCase()));
        return [...new Set([...prev, ...newPeople])];
      });
    }

    // Store in knowledge base
    if (currentQuestion?.knowledgeTag) {
      addToKnowledge(currentQuestion.knowledgeTag, userText);
    }

    setIsTyping(true);
    await delay(1000 + Math.random() * 1000);

    // Check for follow-up trigger
    const lowerText = userText.toLowerCase();
    const potentialFollowUp = !followUpAsked && currentQuestion?.followUps?.find(f =>
      f.triggers.some(t => lowerText.includes(t))
    );

    if (potentialFollowUp) {
      setFollowUpAsked(true);
      setIsTyping(false);
      setMessages(prev => [...prev, makeMsg('ai', potentialFollowUp.text, currentPhase?.id, currentQuestion?.knowledgeTag)]);
      return;
    }

    // Advance to next question
    const ack = getRandomAck();
    const nextQIdx = questionIdx + 1;
    const currentPhaseQuestions = currentPhase.questions;

    setFollowUpAsked(false);

    if (nextQIdx < currentPhaseQuestions.length) {
      // Next question in same phase
      const nextQ = currentPhaseQuestions[nextQIdx];
      setQuestionIdx(nextQIdx);
      setIsTyping(false);
      setMessages(prev => [...prev,
        makeMsg('ai', `${ack}\n\n${nextQ.text}`, currentPhase.id, nextQ.knowledgeTag)
      ]);
    } else {
      // Move to next phase
      const nextPhaseIdx = phaseIdx + 1;

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
        // Interview complete
        setPhaseIdx(PHASES.length - 1);
        setIsTyping(false);
        setPhase('complete');
        setMessages(prev => [...prev,
          makeMsg('ai',
            `${ack}\n\nThat's everything. Thank you — truly.\n\nThe knowledge you've shared today has been organized into a confidential briefing for your team and your successor. Nothing you've said will be lost.\n\nYou can review the full Knowledge Summary in the tab above, and share individual sections or connections with specific colleagues.\n\n您的贡献将长久留存。Thank you for your service.`,
            'complete', null)
        ]);
        setActiveView('summary');
      }
    }
  }, [isTyping, phase, currentPhase, currentQuestion, questionIdx, phaseIdx, followUpAsked, addToKnowledge, connections]);

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
