import { useState, useCallback, useRef, useEffect } from 'react';
import { PHASES, ACKNOWLEDGMENTS, KNOWLEDGE_TAG_LABELS } from '../data/questions.js';

// ── Simplified interview structure ─────────────────────────────────────────────

const INTRO_QUESTION = {
  id: 'intro',
  text: "Welcome, and thank you for your time today.\n\nWe're here to capture the knowledge that lives in your head about this codebase — the decisions, the gotchas, the history that isn't in any doc.\n\nLet's start simply: your name, your role, and how long you've been working on this system?",
  knowledgeTag: 'background',
  followUps: [],
};

// Used when no Machine 1 question plan is available
const FALLBACK_CODE_QUESTIONS = [
  { id: 'f1', text: "Let's start with the big picture — not the official description, but how you'd explain this system to someone joining the team tomorrow. What problem does it solve, and what depends on it?", knowledgeTag: 'system_overview', followUps: [] },
  { id: 'f2', text: "What parts of this system are most fragile or poorly understood, even by you? Where would you tread very carefully before making changes?", knowledgeTag: 'fragile_areas', followUps: [] },
  { id: 'f3', text: "What would you tell a new engineer on their first day that they'd never find written down? The setup gotchas, the non-obvious dependencies, the things that always trip people up.", knowledgeTag: 'onboarding_gotchas', followUps: [] },
  { id: 'f4', text: "Are there any 'temporary' solutions that have quietly become permanent fixtures? Things that were meant to be replaced but have been running in production so long they're now load-bearing?", knowledgeTag: 'permanent_workarounds', followUps: [] },
  { id: 'f5', text: "Finally — what would you warn your successor about? What do you wish someone had told you on your first day with this codebase?", knowledgeTag: 'lessons_learned', followUps: [] },
];

// ── Demo mode (?demo=true) ─────────────────────────────────────────────────────
// Pre-written answers that auto-submit after each AI question.
// Covers both fallback questions and likely Machine 1 questions about sample_codebase.

const DEMO_ANSWERS = [
  // Intro
  "I'm Alex Rivera, Senior Platform Engineer. I've been the primary maintainer of the Catalog Sync Service for about two and a half years.",
  // SYNC_CHUNK_SIZE = 847
  "847 is the maximum the warehouse API will accept per batch without failing silently. We discovered it empirically — tried 1000 first, got partial results with no error at all. Backed it down until it was stable. That number is sacred. Don't change it without getting written confirmation from the warehouse team.",
  // normalize_price on description
  "That's a hack from a bad supplier data import in late 2022. Their descriptions came with HTML entities everywhere — &amp;, &nbsp;, all of it. normalize_price already had string handling so I added the entity stripping in there and called it on descriptions too. The function name is completely misleading now. Removing the description call would silently corrupt that supplier's product data.",
  // StorefrontConflictError
  "The ops team manages about 50 products manually on the storefront — special pricing, custom configurations. When sync hits those, the storefront returns a 409. We were generating 60 alerts a day that ops immediately dismissed every single time. So we made the call to swallow them silently. The tradeoff is real — it's why some price discrepancies keep showing up and never fully resolve.",
  // ENABLE_DELTA_SYNC
  "Delta sync worked fine in testing but broke on a specific production edge case. When a product gets a catalog edit and a price update in the same sync window, the price update comes from a separate service that writes to price_updated_at, not updated_at. Our delta filter only checked updated_at. Those products silently stopped syncing their price changes. Fixing it properly required coordinating with the pricing team, which got deprioritized. I just disabled it.",
  // MERCHANT_OVERRIDE_IDS
  "Those two merchants were onboarded before we had the v2 warehouse API. They have data contracts specifying the old v1 payload format — different field names, different auth. If their records go through v2, the warehouse rejects the payload with a 422. The override forces them to v1 regardless of region. To sunset v1, you'd need to migrate their contracts with the warehouse team — they've had it on their backlog for over a year.",
  // time.sleep(0.3)
  "The storefront API has an undocumented rate limit on write operations, roughly 3 per second. We hit it the first production deployment — hundreds of 429 errors. Started at 0.1 seconds sleep, still got rate limited. Went to 0.2, still intermittent. Landed on 0.3 and it's been stable. It's per record, not per batch, because the limit is per request. At 30k products that's 150 minutes of sleeping. I know.",
  // Fallback / general
  "The thing I'd most warn my successor about is the settlement deadline. The sync job has to complete before 6 AM UTC for same-day clearing. Right now with 50k products we have maybe a 30-minute buffer. If the catalog grows much beyond that without us addressing the sleep-per-record issue, we'll start missing the deadline. Finance has no idea how close to the edge we are.",
];

const IS_DEMO = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('demo') === 'true';

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
        .slice(0, 5)
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

  // Demo mode: auto-submit pre-written answers after each AI message
  const demoAnswerIdx = useRef(0);
  useEffect(() => {
    if (!IS_DEMO || phase !== 'interview' || isTyping) return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'ai') return;
    const answer = DEMO_ANSWERS[demoAnswerIdx.current % DEMO_ANSWERS.length];
    demoAnswerIdx.current += 1;
    const t = setTimeout(() => sendMessage(answer), 1800);
    return () => clearTimeout(t);
  }, [messages, phase, isTyping, sendMessage]);

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
