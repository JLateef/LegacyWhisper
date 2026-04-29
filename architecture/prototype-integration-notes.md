# Voice Prototype Integration Notes

Maps the abstract interfaces in `system-spec.md` to what actually exists in `src/hooks/useInterview.js`.

---

## What the Prototype Already Does Well

The hook is already a solid interview state machine:

- `phase` state machine (`setup → interview → complete`) is the right model
- `knowledgeBase` is a tagged accumulator — `{ [knowledgeTag]: string[] }` — that is essentially a pre-extracted version of `ExtractedKnowledgeItem` already organized by category
- `connections` (people extracted from responses) maps to a future `Stakeholder` entity
- `generateSummary()` groups knowledge by tag — this is the precursor to the Output Generator
- Follow-up trigger logic (`followUps[].triggers`) is the right pattern for Turn Manager behavior
- Stale closure protection via refs (phaseIdxRef etc.) is correct and should be preserved

---

## What Needs to Change for Full System Integration

### 1. Replace hardcoded PHASES with a dynamic question plan

**Current:** `startInterview()` uses `PHASES[0].questions[0]` from `data/questions.js`

**Target:** accept a question plan from the API

```javascript
// Change startInterview signature from:
const startInterview = useCallback(async (info) => { ... })

// To:
const startInterview = useCallback(async (info, questionPlan) => {
  // questionPlan: [{ id, sequence, text, knowledgeTag, followUps[], anchorContext }]
  // Store in state; use instead of PHASES
})
```

The `PHASES` structure becomes a v1 fallback — if no API question plan is available, use the hardcoded phases. This lets you ship before the full pipeline is built.

```javascript
const activePlan = questionPlan ?? PHASES.flatMap(p => p.questions);
```

### 2. Persist transcript segments as they happen

**Current:** `messages[]` accumulate in memory only; nothing is persisted during the session

**Target:** after each `sendMessage` response, POST the turn to the API

```javascript
// At the end of sendMessage, after the AI message is added:
await fetch(`/api/sessions/${sessionId}/segments`, {
  method: 'POST',
  body: JSON.stringify({
    questionId: curQuestion?.id,
    speaker: 'engineer',
    text: userText,
    startMs: turnStart,
    endMs: Date.now(),
  })
});
```

Keep all existing in-memory state — the API call is fire-and-forget. If it fails, the session still works; you'll reconcile from `messages[]` on completion.

### 3. Fire onSessionComplete with the full session data

**Current:** the `complete` transition (line 205) sets state and shows a closing message

**Target:** also POST the full session to the backend

```javascript
// In the else block at line 204, add:
if (onSessionComplete) {
  onSessionComplete({
    sessionId,
    messages,           // full message history
    knowledgeBase,      // tagged knowledge already extracted by the hook
    connections,        // people mentioned
    documents,          // documents referenced
    durationMs: Date.now() - sessionStartRef.current,
  });
}

// Or directly POST:
await fetch(`/api/sessions/${sessionId}/complete`, {
  method: 'POST',
  body: JSON.stringify({ messages, knowledgeBase, connections }),
});
```

### 4. Map knowledgeBase tags to ExtractedKnowledgeItem categories

The hook's `knowledgeTag` values (from `data/questions.js`) need to map to the system's `category` enum:

| Current knowledgeTag (example) | System category |
|--------------------------------|-----------------|
| `architecture` | `decision` |
| `gotchas` | `gotcha` |
| `risks` | `risk` |
| `patterns` | `pattern` |
| `context` | `context` |

When the backend receives `knowledgeBase`, it can pre-populate `ExtractedKnowledgeItem` rows from the tags before running the Claude extraction pass. This gives you a cheap first-pass extraction that Claude then refines.

---

## Session ID Threading

The hook currently has no concept of a `sessionId`. Add it:

```javascript
export function useInterview({ sessionId } = {}) {
  // use sessionId in all API calls
}
```

The session is created server-side when the engineer clicks "Start Interview." The UI receives the ID and passes it into the hook. This ties all persisted data to the right session row.

---

## What NOT to Change in V1

- The follow-up trigger logic (`followUps[].triggers`) — it works; don't touch it
- The refs pattern (`phaseIdxRef`, `questionIdxRef`) — correct async defense; preserve it
- The `connections` / `suggestedPeople` extraction — `extractPotentialPeople()` is a useful heuristic for flagging stakeholders
- The `generateSummary()` output — still useful for the local UI display even after the backend generates the formal output doc
- The `isTyping` / `delay()` UX feel — users notice; keep it

---

## Integration Checklist

- [ ] Add `sessionId` prop to `useInterview`
- [ ] Add `questionPlan` param to `startInterview` with `PHASES` fallback
- [ ] Add `POST /api/sessions/:id/segments` call inside `sendMessage` (fire-and-forget)
- [ ] Add `POST /api/sessions/:id/complete` call at session end
- [ ] Map `knowledgeBase` tag keys to system `category` enum
- [ ] Thread `knowledgeTag` from dynamic question plan into `makeMsg` calls (already done for hardcoded questions)
