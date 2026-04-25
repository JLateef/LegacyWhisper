export const PHASES = [
  {
    id: 'welcome',
    name: 'Opening',
    icon: '✦',
    color: 'indigo',
    description: 'Setting the stage',
    estimatedMinutes: 5,
    questions: [
      {
        id: 'w1',
        text: `Welcome — and thank you sincerely for your time today.\n\nWhat we're doing here matters. The systems you've built and maintained represent years of decisions, hard-won knowledge, and invisible scaffolding that keeps things running. When you move on, that context is at serious risk of being lost forever — and the people who follow you deserve better than starting from zero.\n\nEverything you share today will be organized into a knowledge brief for your team and your successor. There are no wrong answers — only things that may never be captured if you don't say them now.\n\nLet's start simply. Can you tell me your name, your role, and roughly how long you've been working on this codebase or system?`,
        followUps: [],
        knowledgeTag: 'background',
      },
    ],
  },
  {
    id: 'system',
    name: 'The System',
    icon: '⬡',
    color: 'emerald',
    description: 'Architecture & history',
    estimatedMinutes: 20,
    questions: [
      {
        id: 's1',
        text: `Let's start with the big picture.\n\nCan you describe what this system actually does — not the official description, but how you'd explain it to someone joining the team tomorrow? What problem does it solve, and who or what depends on it?`,
        followUps: [
          { triggers: ['used by', 'depends on', 'downstream', 'upstream', 'customer', 'team', 'service', 'relies'], text: `Those dependencies are exactly the kind of thing that gets discovered the hard way. Are any of those relationships formally documented, or have they always been word-of-mouth?` },
        ],
        knowledgeTag: 'system_overview',
      },
      {
        id: 's2',
        text: `Every codebase carries the scars of past decisions.\n\nWhat are the most important architectural choices made in this system, and why were they made? I'm especially interested in the reasoning behind decisions that might look strange or surprising to someone new.`,
        followUps: [
          { triggers: ['because', 'reason', 'decision', 'chosen', 'decided', 'at the time', 'originally', 'back then'], text: `That kind of context almost never survives in the code itself. Was the reasoning documented anywhere — in a design doc, a ticket, an email thread — or has it only ever lived in people's heads?` },
        ],
        knowledgeTag: 'architecture_decisions',
      },
      {
        id: 's3',
        text: `What parts of this system are most fragile or poorly understood — even by you?\n\nAre there areas you'd approach very carefully, or that you always test extensively before touching? Places where "here be dragons" should probably be written in the comments?`,
        followUps: [
          { triggers: ["don't touch", 'careful', 'fragile', 'scary', 'risky', 'complex', 'messy', 'nobody knows', 'no one knows', 'black box'], text: `These are the areas most likely to cause incidents after you're gone. Is there any documentation at all for that section, or is this knowledge entirely undocumented?` },
        ],
        knowledgeTag: 'fragile_areas',
      },
    ],
  },
  {
    id: 'people',
    name: 'Key People',
    icon: '◈',
    color: 'blue',
    description: 'Who knows what',
    estimatedMinutes: 15,
    questions: [
      {
        id: 'p1',
        text: `Now let's talk about the people — because in most teams, knowledge is distributed unevenly and informally.\n\nWho are the people your successor absolutely needs to meet in their first week? Not just on your direct team — anyone in the organization who carries knowledge critical to this system running well.`,
        followUps: [
          { triggers: ['and', 'also', 'another', 'plus', 'as well', 'there\'s also'], text: `That's a strong network. Of those people, who holds knowledge that is genuinely irreplaceable — someone who, if they left tomorrow, would create a serious operational risk?` },
        ],
        knowledgeTag: 'key_contacts',
      },
      {
        id: 'p2',
        text: `Which parts of the codebase does each person know best?\n\nI'm thinking about the informal ownership that's never in any CODEOWNERS file — the person you'd ping at 2am if something broke in a specific module, or the one everyone goes to for questions about a particular subsystem.`,
        followUps: [
          { triggers: ['owns', 'knows', 'expert', 'best', 'always', 'go to', 'familiar', 'ask', 'responsible for'], text: `That kind of informal expertise map is invaluable. Has anyone ever tried to formalize this — in a runbook, a wiki page, or even a Slack channel?` },
        ],
        knowledgeTag: 'expertise_map',
      },
      {
        id: 'p3',
        text: `Are there external contacts — at vendors, partner teams, or third-party services — whose relationship with you personally makes things run more smoothly?\n\nContacts where knowing who to call, how to reach them, and what approach gets results makes a real difference?`,
        followUps: [
          { triggers: ['contact', 'call', 'email', 'reach', 'relationship', 'vendor', 'partner', 'support', 'account manager'], text: `Those relationships take years to build and can disappear completely in a transition. Is there a preferred way to approach them, or context about the relationship that the next person should know?` },
        ],
        knowledgeTag: 'external_contacts',
      },
    ],
  },
  {
    id: 'hidden',
    name: 'Hidden Knowledge',
    icon: '◎',
    color: 'amber',
    description: "What the docs don't say",
    estimatedMinutes: 20,
    questions: [
      {
        id: 'h1',
        text: `Every codebase has things that work — but only if you know the secret.\n\nWhat would you tell a new engineer on their first day that they'd never find written down? The setup gotchas, the non-obvious dependencies, the things that always trip people up in their first month?`,
        followUps: [
          { triggers: ['first', 'setup', 'install', 'config', 'environment', 'onboarding', 'always breaks', 'nobody tells you'], text: `These friction points are exactly what make onboarding painful. Has anyone ever tried to capture this in a README or onboarding guide?` },
        ],
        knowledgeTag: 'onboarding_gotchas',
      },
      {
        id: 'h2',
        text: `Are there behaviors in this system that aren't documented anywhere but are critically important to understand?\n\nThings like: "it only does X under condition Y," or "never call Z or it triggers a cascade," or logic that was added for a historical reason that no longer exists but can't safely be removed.`,
        followUps: [
          { triggers: ['only', 'unless', 'never', 'always', 'if', 'condition', 'depends', 'because', 'historical', 'legacy reason'], text: `That's exactly the kind of thing that causes incidents months after you leave. Is there any risk of someone removing or changing that behavior unknowingly?` },
        ],
        knowledgeTag: 'undocumented_behavior',
      },
      {
        id: 'h3',
        text: `Are there any "temporary" solutions that have quietly become permanent fixtures?\n\nThings that were originally meant to be replaced or cleaned up, but have been running in production for so long that they're now load-bearing — and someone new would never know they were meant to be temporary.`,
        followUps: [
          { triggers: ['temporary', 'meant to', 'should have', 'eventually', 'someday', 'tech debt', 'workaround', 'hack', 'quick fix', 'placeholder'], text: `These are the most dangerous kind of hidden knowledge. Has this been flagged in a ticket or backlog anywhere, or does it only exist in institutional memory?` },
        ],
        knowledgeTag: 'permanent_workarounds',
      },
    ],
  },
  {
    id: 'tribal',
    name: 'Tribal Knowledge',
    icon: '◐',
    color: 'rose',
    description: 'The unwritten rules',
    estimatedMinutes: 15,
    questions: [
      {
        id: 't1',
        text: `Now for the things that will never appear in a runbook.\n\nIf something goes seriously wrong in production at 2am — a critical outage, a data integrity issue, a cascading failure — walk me through your actual mental process. Who do you call? What do you check first? What's the real escalation path, not the org chart one?`,
        followUps: [],
        knowledgeTag: 'incident_response',
      },
      {
        id: 't2',
        text: `What are the unwritten rules of how work actually gets done on this team?\n\nThings like: how decisions actually get made, who needs to be consulted before any change touches a certain area, what the real deployment process looks like versus what the documentation says.`,
        followUps: [
          { triggers: ['actually', 'real', 'informal', 'unwritten', 'know', 'understand', 'consult', 'check with', 'run by'], text: `These process realities are often the most consequential things to hand over. What would happen if someone didn't know this and just followed the documented process?` },
        ],
        knowledgeTag: 'process_reality',
      },
      {
        id: 't3',
        text: `What are the organizational dynamics your successor needs to navigate carefully?\n\nAny sensitivities between teams, competing priorities, or relationships that require particular care? Things that aren't in any org chart but shape how work actually gets done and decisions actually get made?`,
        followUps: [
          { triggers: ['tension', 'careful', 'sensitive', 'history', 'difficult', 'politics', 'conflict', 'friction', 'complicated'], text: `Navigating those dynamics early prevents a lot of early mistakes. What's the best approach for someone new — how should they engage to avoid triggering those tensions?` },
        ],
        knowledgeTag: 'organizational_dynamics',
      },
    ],
  },
  {
    id: 'active',
    name: 'In Flight',
    icon: '◑',
    color: 'teal',
    description: 'Active work & open items',
    estimatedMinutes: 15,
    questions: [
      {
        id: 'a1',
        text: `Let's talk about what's currently in motion — the things that won't pause because you're leaving.\n\nWhat active work, open pull requests, ongoing migrations, or live investigations will someone need to pick up immediately? What has context that absolutely cannot be lost in the handover?`,
        followUps: [
          { triggers: ['urgent', 'deadline', 'critical', 'production', 'migration', 'breaking', 'release', 'soon', 'this week', 'next week'], text: `That sounds time-sensitive. What's the single most important piece of context that the person picking this up needs to know before they touch it?` },
        ],
        knowledgeTag: 'active_work',
      },
      {
        id: 'a2',
        text: `Are there decisions that are mid-stream — architectural choices, team agreements, or technical directions that haven't been fully settled or documented yet?\n\nAnything that exists as a conversation in Slack, a half-written design doc, or only in your head, that could easily get lost?`,
        followUps: [],
        knowledgeTag: 'pending_decisions',
      },
    ],
  },
  {
    id: 'legacy',
    name: 'Your Legacy',
    icon: '✧',
    color: 'purple',
    description: 'What you leave behind',
    estimatedMinutes: 12,
    questions: [
      {
        id: 'l1',
        text: `We're near the end. This part matters just as much as everything before it.\n\nWhat are you most proud of from your time with this system? What did you build, fix, or protect that you genuinely hope continues — and that you'd want people to know you were behind?`,
        followUps: [],
        knowledgeTag: 'achievements',
      },
      {
        id: 'l2',
        text: `What would you warn your successor about?\n\nWhat do you wish someone had told you on your first day with this codebase? What mistakes — yours or others' — are you hoping the next person can avoid?`,
        followUps: [],
        knowledgeTag: 'lessons_learned',
      },
      {
        id: 'l3',
        text: `Finally — is there anything I haven't asked about that you'd feel uncomfortable leaving undocumented?\n\nAny knowledge, context, technical detail, or simply something that only you know — that would cause real pain if it disappeared when you walked out the door?`,
        followUps: [],
        knowledgeTag: 'additional_knowledge',
      },
    ],
  },
];

export const KNOWLEDGE_TAG_LABELS = {
  background: 'Background & Role',
  system_overview: 'System Overview & Dependencies',
  architecture_decisions: 'Architecture & Design Decisions',
  fragile_areas: 'Fragile Areas & Risk Zones',
  key_contacts: 'Key People to Brief',
  expertise_map: 'Informal Expertise Map',
  external_contacts: 'External Contacts & Vendors',
  onboarding_gotchas: 'Onboarding Gotchas',
  undocumented_behavior: 'Undocumented Behavior',
  permanent_workarounds: 'Permanent Workarounds & Hidden Debt',
  incident_response: 'Incident Response & Escalation',
  process_reality: 'How Work Actually Gets Done',
  organizational_dynamics: 'Team & Organizational Dynamics',
  active_work: 'Active Work & Open Items',
  pending_decisions: 'Pending Decisions',
  achievements: 'Legacy & Achievements',
  lessons_learned: 'Lessons Learned',
  additional_knowledge: 'Additional Knowledge',
};

export const ACKNOWLEDGMENTS = [
  "That's exactly the kind of institutional knowledge we're here to capture. Thank you.",
  "This is invaluable. The kind of context that simply cannot be found by reading the code.",
  "I'm noting that carefully. This will matter enormously to whoever inherits this system.",
  "Thank you for being so candid. That context changes how everything else gets understood.",
  "That level of detail is exactly what separates a smooth handover from a painful one.",
  "Noted. This is the kind of thing that only comes from years of being in the room when decisions were made.",
  "This is exactly what we're here for. Let's keep going.",
];

export const PHASE_TRANSITIONS = {
  system: "Good. Let's move into the system itself — the architecture, the history, and the decisions behind it.",
  people: "Thank you. Now let's talk about the people — because in most teams, knowledge is held informally and unevenly.",
  hidden: "Now for the hidden layer — the things that work, but only if you know the secret.",
  tribal: "This is often the most important part: the unwritten rules that govern how things actually work.",
  active: "Let's make sure nothing in motion gets dropped. What's currently in flight?",
  legacy: "One last phase. This is where we capture what you want to leave behind.",
};
