export const PHASES = [
  {
    id: 'welcome',
    name: 'Opening',
    icon: '✦',
    color: 'indigo',
    description: 'Setting the stage',
    estimatedMinutes: 3,
    questions: [
      {
        id: 'w1',
        text: `Welcome — and thank you sincerely for your time today.\n\nMy purpose here is simple: to make sure that nothing you've built, learned, or carefully maintained gets lost when you move on. The people who come after you deserve to inherit your knowledge, not start from zero.\n\nEverything you share will be organized into a confidential knowledge brief for your team and your successor. There are no wrong answers — only things that may never be captured if you don't share them today.\n\nLet's start gently. Can you tell me your name, your title, and roughly how long you've been in this role?`,
        followUps: [],
        knowledgeTag: 'background',
      },
    ],
  },
  {
    id: 'people',
    name: 'Key People',
    icon: '◈',
    color: 'blue',
    description: 'Relationships & cohorts',
    estimatedMinutes: 18,
    questions: [
      {
        id: 'p1',
        text: `Let's talk about the people — because in facilities management, relationships are often the most important thing you carry.\n\nWho were your closest working partners on this team? Not just by org chart, but the people you'd call first in a crisis. The ones who actually got things done when the official channels were too slow.`,
        followUps: [
          { triggers: ['and', 'also', 'plus'], text: `That's a strong network. Of those people, who holds knowledge that absolutely cannot be lost when you leave — someone your successor needs to meet in the first week?` },
        ],
        knowledgeTag: 'internal_relationships',
      },
      {
        id: 'p2',
        text: `Now I'd like to understand your tenant relationships — the ones that go beyond the lease agreement.\n\nAre there any tenant representatives who had a personal relationship specifically with you? Someone who might call your mobile rather than the main line, or who you'd handle differently because of history you've built together?`,
        followUps: [
          { triggers: ['prefer', 'like', 'always', 'never', 'request'], text: `Those kinds of personal arrangements are exactly what gets lost in transition. Can you walk me through what you'd actually do differently for them — what the accommodation was, and why it started?` },
        ],
        knowledgeTag: 'tenant_relationships',
      },
      {
        id: 'p3',
        text: `What about vendors, contractors, and external service providers?\n\nWho are the ones you trusted with your life — and equally important, who are the ones that need watching? Be candid. The successor doesn't need to repeat your hard lessons.`,
        followUps: [
          { triggers: ['good', 'trust', 'reliable', 'honest', 'best'], text: `That's valuable intelligence. Do they have a direct contact you've built a personal rapport with, or a preferred way of being approached that gets better results?` },
        ],
        knowledgeTag: 'vendor_relationships',
      },
    ],
  },
  {
    id: 'building',
    name: 'Building Intel',
    icon: '⬡',
    color: 'emerald',
    description: 'Secrets & institutional memory',
    estimatedMinutes: 20,
    questions: [
      {
        id: 'b1',
        text: `Every building has a personality — things that aren't in any manual, that you only learn by being here.\n\nWhat would you tell someone on their very first day that they would never find written down anywhere? Think about the quirks, the workarounds, the things that confused you at first and took months to understand.`,
        followUps: [
          { triggers: ['basement', 'roof', 'floor', 'system', 'pipe', 'elevator', 'hvac', 'electrical', 'valve'], text: `That's exactly the kind of institutional memory we need to capture. Is there a drawing, log, or diagram for this anywhere, or has it always just been passed by word of mouth?` },
        ],
        knowledgeTag: 'building_quirks',
      },
      {
        id: 'b2',
        text: `Are there recurring issues — problems that appear to be solved but tend to resurface? Any seasonal patterns the next person should be prepared for?\n\nI'm thinking about the kind of thing you notice coming and brace yourself — because you've seen it before.`,
        followUps: [
          { triggers: ['summer', 'winter', 'rain', 'hot', 'cold', 'typhoon', 'season', 'year', 'annual'], text: `Seasonal operational knowledge is one of the most valuable things to document. Can you walk me through what your response actually looks like when that happens — who you call, what sequence you follow?` },
        ],
        knowledgeTag: 'recurring_issues',
      },
      {
        id: 'b3',
        text: `Which mechanical systems, building infrastructure, or specific areas need the most attention?\n\nAnd critically — are there any "temporary fixes" that have quietly become permanent? Things everyone just lives with that someone new would never know to look for?`,
        followUps: [
          { triggers: ['fix', 'workaround', 'temporary', 'patch', 'old', 'should', 'haven\'t'], text: `These workarounds are often the first thing that bites a new operator. Do you know when this started, and has it ever been flagged formally for repair?` },
        ],
        knowledgeTag: 'maintenance_intel',
      },
    ],
  },
  {
    id: 'financials',
    name: 'Property Financials',
    icon: '¥',
    color: 'teal',
    description: 'Fees, yield & reporting',
    estimatedMinutes: 20,
    questions: [
      {
        id: 'f1',
        text: `Let's talk about the building's financial health — the numbers that determine whether this asset actually performs.\n\nAre the monthly 管理費 (kanrihi / management fee) and 修繕積立金 (shuzen tsumitatekin / repair reserve) stable? How often have they increased, and by how much? Is another increase expected?`,
        followUps: [
          { triggers: ['increase', 'rise', 'raised', 'went up', 'higher', 'expect'], text: `That's important context. Was the increase communicated in advance, and was there a formal vote by the management association? Do you know what triggered it?` },
        ],
        knowledgeTag: 'building_fees',
      },
      {
        id: 'f2',
        text: `Are the common area utilities — electricity, water, elevator power — separately metered, or are they bundled into the building management fee?\n\nAnd separately: what is the average delinquency rate on management fees across the building? Are any co-owners consistently behind on payments?`,
        followUps: [
          { triggers: ['behind', 'delinquent', 'not paying', 'unpaid', 'arrears', 'issue'], text: `Delinquencies weaken the reserve fund for everyone. Is the management association actively pursuing those owners, or has it been left unresolved?` },
        ],
        knowledgeTag: 'building_fees',
      },
      {
        id: 'f3',
        text: `What is the actual net yield on this property — after subtracting management fees, property taxes, repair reserves, and any other recurring costs?\n\nAnd what is the building's average occupancy rate? Not the unit's occupancy, but the building-wide figure — and how has it trended over the past few years?`,
        followUps: [
          { triggers: ['gross', 'advertised', 'percent', '%', 'low', 'vacant', 'empty'], text: `Gross yields in Japan are often significantly higher than net. Can you walk me through the actual cost breakdown that gets you to the real number?` },
        ],
        knowledgeTag: 'financial_yield',
      },
      {
        id: 'f4',
        text: `Does the building allow short-term rentals — Airbnb, Rakuten STAY, or similar platforms? If not, how strictly is this enforced by the management association?\n\nHave there been any violations, complaints, or legal issues related to this?`,
        followUps: [
          { triggers: ['airbnb', 'short', 'rental', 'illegal', 'violation', 'complaint'], text: `This can have serious consequences for the building's reputation and valuation. Was it resolved formally, or is it still an ongoing situation?` },
        ],
        knowledgeTag: 'rental_policy',
      },
      {
        id: 'f5',
        text: `What is the strategy for tenant turnover and re-leasing when a unit becomes vacant?\n\nIs professional photography used? Is the listing placed across major platforms — SUUMO, AtHome, Homes? What is the average time-to-lease, and is there a preferred agency relationship?`,
        followUps: [
          { triggers: ['slow', 'vacant', 'empty', 'hard', 'difficult', 'agency', 'broker'], text: `Vacancy in Tokyo can be very expensive quickly. Is there a specific agency or contact who has performed best historically for this building or this unit type?` },
        ],
        knowledgeTag: 'leasing_strategy',
      },
      {
        id: 'f6',
        text: `What is the management fee structure — is it a percentage of gross rent, or a flat monthly fee? What is included, and what is charged separately?\n\nSpecifically: is tenant placement (入居者募集) included, or billed separately — and if so, at what rate?`,
        followUps: [
          { triggers: ['percent', '%', 'one month', 'flat', 'extra', 'additional', 'placement'], text: `Standard in Japan is 5–10% of gross rent plus one month's rent for tenant placement. Is what's in place here consistent with that, and has it ever been renegotiated?` },
        ],
        knowledgeTag: 'management_fees',
      },
      {
        id: 'f7',
        text: `Finally on the financial side: are monthly reports provided in English? Do they include a full cash-flow statement and copies of the original vendor invoices?\n\nIf not — who currently receives the reports, in what format, and is there a contact at the management company who can produce English-language summaries on request?`,
        followUps: [
          { triggers: ['no', 'japanese', 'not', 'only', 'never', 'translation'], text: `For non-Japanese-speaking owners or successors, this is a significant gap. Has anyone previously requested an English-language summary, and what was the response?` },
        ],
        knowledgeTag: 'financial_reporting',
      },
    ],
  },
  {
    id: 'tribal',
    name: 'Tribal Knowledge',
    icon: '◎',
    color: 'amber',
    description: 'The unwritten rules',
    estimatedMinutes: 20,
    questions: [
      {
        id: 't1',
        text: `Now for the things that will never appear in a procedure document.\n\nIf something goes seriously wrong at 2am — a major system failure, a tenant crisis, a safety issue — walk me through your actual mental rolodex. Who do you call first, and in what order? Not the org chart answer. Your answer.`,
        followUps: [],
        knowledgeTag: 'emergency_protocols',
      },
      {
        id: 't2',
        text: `Are there any informal arrangements or understandings that exist outside of official contracts or documentation?\n\nThings that are "understood" between you and a tenant, or you and a vendor, or even within the team — but have never been formally written anywhere?`,
        followUps: [
          { triggers: ['understand', 'informal', 'agree', 'arrangement', 'deal', 'between'], text: `These are often the most consequential things to hand over — they can look like failures from the outside if someone doesn't know they exist. Who else is currently aware of this arrangement?` },
        ],
        knowledgeTag: 'informal_agreements',
      },
      {
        id: 't3',
        text: `What are the political dynamics your successor needs to navigate?\n\nAny sensitivities between teams, between departments, or involving specific individuals? Relationships that need to be treated with particular care?`,
        followUps: [
          { triggers: ['tension', 'issue', 'difficult', 'careful', 'sensitive', 'problem', 'history'], text: `Understanding those dynamics early can prevent a lot of early mistakes. What's the best way for someone new to approach that situation without triggering it?` },
        ],
        knowledgeTag: 'organizational_dynamics',
      },
    ],
  },
  {
    id: 'active',
    name: "In Flight",
    icon: '◐',
    color: 'rose',
    description: 'Active situations & commitments',
    estimatedMinutes: 15,
    questions: [
      {
        id: 'a1',
        text: `Let's talk about what's currently in motion — the things that won't pause just because you're leaving.\n\nWhat active projects, ongoing negotiations, or live situations will need someone's attention immediately after you're gone?`,
        followUps: [
          { triggers: ['urgent', 'deadline', 'soon', 'week', 'month', 'critical', 'due'], text: `That sounds time-sensitive. Who is the right person to own this handover right now, and what's the single most important thing they need to know?` },
        ],
        knowledgeTag: 'active_issues',
      },
      {
        id: 'a2',
        text: `Are there conversations that are mid-stream — with tenants, vendors, or internally — where context could be easily lost?\n\nAny verbal commitments you've made that aren't formally documented yet? Anything that exists only in your email or in your head?`,
        followUps: [],
        knowledgeTag: 'pending_commitments',
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
        text: `We're near the end. This part is just as important as everything before it.\n\nWhat are you most proud of from your time in this role? What did you build, protect, or improve that you genuinely hope continues after you're gone?`,
        followUps: [],
        knowledgeTag: 'achievements',
      },
      {
        id: 'l2',
        text: `What would you warn your successor about?\n\nWhat do you wish someone had told you when you started, or what mistakes — yours or others' — would you want them to avoid?`,
        followUps: [],
        knowledgeTag: 'lessons_learned',
      },
      {
        id: 'l3',
        text: `Finally — is there anything I haven't asked about that feels important to capture?\n\nAny knowledge, relationships, ongoing situations, or simply things that only you know, that you'd feel uncomfortable leaving undocumented?`,
        followUps: [],
        knowledgeTag: 'additional_knowledge',
      },
    ],
  },
];

export const KNOWLEDGE_TAG_LABELS = {
  background: 'Background & Role',
  internal_relationships: 'Internal Cohorts & Team',
  tenant_relationships: 'Tenant Relationships',
  vendor_relationships: 'Vendors & Contractors',
  building_quirks: 'Building Quirks & Hidden Knowledge',
  recurring_issues: 'Recurring Issues & Patterns',
  maintenance_intel: 'Maintenance & Infrastructure Intel',
  building_fees: '管理費・修繕積立金 (Kanrihi & Repair Reserve)',
  financial_yield: 'Net Yield & Occupancy Rate',
  rental_policy: 'Short-Term Rental Policy',
  leasing_strategy: 'Tenant Turnover & Re-leasing Strategy',
  management_fees: 'Management Fee Structure',
  financial_reporting: 'Monthly Financial Reporting',
  emergency_protocols: 'Emergency Contacts & Protocols',
  informal_agreements: 'Informal Agreements',
  organizational_dynamics: 'Team Dynamics',
  active_issues: 'Active Projects & Issues',
  pending_commitments: 'Pending Commitments',
  achievements: 'Legacy & Achievements',
  lessons_learned: 'Lessons Learned',
  additional_knowledge: 'Additional Knowledge',
};

export const ACKNOWLEDGMENTS = [
  "That's exactly the kind of institutional memory we're here to capture. Thank you.",
  "This is invaluable. The kind of thing that simply can't be found in any document.",
  "I'm noting that carefully. This will matter a great deal to whoever steps into this role.",
  "Thank you for being so candid. That context changes how everything else gets understood.",
  "That level of detail is exactly what makes the difference between a smooth transition and a painful one.",
  "Noted. This is the kind of thing that only comes from years of being in the room.",
  "This kind of insight is what we're here for. Let's keep going.",
];

export const PHASE_TRANSITIONS = {
  people: "Good. Now let's shift from background to the people — the relationships that make this work possible.",
  building: "Thank you. Now I want to move into the building itself — the knowledge that lives in the walls and systems.",
  financials: "Good. Now let's go deep on the financial picture — the numbers that are rarely documented but determine everything.",
  tribal: "Now we get to the most important part: the things that were never written down.",
  active: "Let's talk about what's currently in motion — the things that can't wait.",
  legacy: "One last phase. This is where we capture what you want to leave behind.",
};
