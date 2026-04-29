# Pass 2 Design Notes — Question Generation

## The core prompt engineering problem

The default failure mode for question generation is abstraction drift: the model understands that a signal is about a hardcoded value, and generates a question about hardcoded values in general instead of about this specific value on this specific line with this specific comment. The prompt fights this by demanding verbatim quotes from the source artifacts.

The second failure mode is WHAT creep: questions drift toward "what does X do?" instead of "why was X done this way?" The system prompt explicitly bans WHAT questions and gives six framing patterns that all lead with WHY.

## Why batch all signals in one call (vs. one call per signal)

One call per signal would give the model tightly focused context and likely produce higher per-question quality. But it also means 20–35 API calls, serial latency of 30–60 seconds, and no ability for the model to de-duplicate across signals (two signals may generate near-identical questions). Batching in a single call trades some per-question quality for better cross-question coherence and dramatically lower latency. This is the right tradeoff for v1.

For v2: consider per-signal calls with a de-duplication pass, especially for large codebases where each signal's context excerpt would overflow a batched prompt.

## The context excerpts section

Pass 2 receives not just the signals from Pass 1, but also `context_excerpts` — short snippets of the actual code, commit diff, or ticket text surrounding each signal. This is critical: without it, the model generates questions about abstract signals rather than specific artifacts.

The `context_builder.py` module assembles these excerpts:
- For code signals: ±15 lines around the flagged line
- For commit signals: the full commit metadata + first 50 lines of diff if available
- For ticket signals: the full ticket (title, description, resolution, reopen history)

## Quality filters built into the prompt

The final prompt includes four self-critique steps before returning output:
1. Remove WHAT questions
2. Remove questions whose answers are in the code
3. Remove near-duplicates
4. Cap at 25 questions

These filters are applied by the model at the end of its generation, not by our code. This keeps the logic in the prompt where it can be iterated on. Our code validates the output length and priority values but does not re-filter questions.

## Priority calibration

`high` is reserved for questions where not knowing the answer puts the new engineer at real risk:
- They might remove something they shouldn't remove
- They might trigger a past incident by repeating an old pattern
- They might miss a compliance or legal constraint embedded in code behavior

If more than 8 questions come back as `high`, the model is miscalibrated. Add an explicit count constraint: "At most 6 questions should be marked high."

## The verbatim quoting requirement

The most important single instruction in Pass 2 is quoting real artifacts verbatim. When an engineer hears "Commit abc123 from January 8th has the message 'fix' and touched 23 lines of payment_processor.py," they immediately know exactly what you're talking about. When they hear "I noticed a commit that seems to be a quick fix to the payment processor," they do not.

If question quality is low, check whether the model is actually quoting. Add an explicit check: "Every question_text must contain at least one verbatim quote from the source artifacts, surrounded by single quotes."
